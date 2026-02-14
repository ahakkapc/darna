import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

const logger = new Logger('MetaLeadgenBackfill');

async function withOrgWorker<T>(
  prisma: PrismaClient,
  orgId: string,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, orgId);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
    const result = await fn(tx);
    await tx.$executeRawUnsafe(`RESET ROLE`);
    return result;
  });
}

export async function processMetaLeadgenBackfill(
  prisma: PrismaClient,
  data: { metaLeadSourceId: string; organizationId: string; sinceHours?: number },
): Promise<void> {
  const { metaLeadSourceId, organizationId, sinceHours = 72 } = data;
  logger.log(`Backfill started: source=${metaLeadSourceId} org=${organizationId} sinceHours=${sinceHours}`);

  // Load source + integration
  const source: any = await withOrgWorker(prisma, organizationId, (tx) =>
    tx.metaLeadSource.findFirst({
      where: { id: metaLeadSourceId, isActive: true },
      include: { integration: true },
    }),
  );

  if (!source) {
    logger.warn(`Source ${metaLeadSourceId} not found or inactive`);
    return;
  }

  if (source.integration.status !== 'ACTIVE') {
    logger.warn(`Integration ${source.integrationId} not active`);
    return;
  }

  // Get access_token
  const secret: any = await withOrgWorker(prisma, organizationId, (tx) =>
    tx.integrationSecret.findFirst({
      where: { integrationId: source.integrationId, key: 'access_token' },
    }),
  );

  if (!secret) {
    logger.error(`access_token not found for integration ${source.integrationId}`);
    return;
  }

  // Decrypt token — in worker context we need the vault logic
  // For now, we'll import the decrypt utility inline
  const { decryptValue } = await import('./backfill-crypto-helper');
  const accessToken = decryptValue(secret.valueEnc, secret.keyVersion);

  if (!accessToken) {
    logger.error('Could not decrypt access_token');
    return;
  }

  // Fetch leads from Meta
  const config = (source.integration.configJson as any) ?? {};
  const graphBaseUrl = config.graphBaseUrl ?? 'https://graph.facebook.com';
  const apiVersion = config.apiVersion ?? 'v20.0';
  const sinceUnix = Math.floor((Date.now() - sinceHours * 3600 * 1000) / 1000);

  const url = `${graphBaseUrl}/${apiVersion}/${source.formId}/leads?fields=created_time&since=${sinceUnix}&limit=100&access_token=${accessToken}`;
  let nextUrl: string | null = url;
  let totalCreated = 0;

  while (nextUrl) {
    let res: Response;
    try {
      res = await fetch(nextUrl);
    } catch (err: any) {
      logger.error(`Network error fetching form leads: ${err.message}`);
      break;
    }

    const body = await res.json() as any;

    if (!res.ok) {
      logger.error(`Meta API error: ${body?.error?.message ?? 'Unknown'}`);
      break;
    }

    const leads: Array<{ id: string; created_time: string }> = body.data ?? [];

    for (const lead of leads) {
      // Create InboundEvent if not exists (idempotent by externalId)
      try {
        await withOrgWorker(prisma, organizationId, async (tx) => {
          // Check if already exists
          const existing = await tx.inboundEvent.findFirst({
            where: {
              sourceType: 'META_LEADGEN',
              externalId: lead.id,
            },
          });

          if (existing) return;

          await tx.inboundEvent.create({
            data: {
              organizationId,
              sourceType: 'META_LEADGEN',
              provider: 'META_CLOUD',
              integrationId: source.integrationId,
              externalId: lead.id,
              payloadJson: {
                pageId: source.pageId,
                formId: source.formId,
                created_time: lead.created_time,
                backfill: true,
              },
              metaJson: { metaLeadSourceId: source.id },
              status: 'RECEIVED',
            },
          });

          // Enqueue processing job
          await tx.jobRun.create({
            data: {
              type: 'INBOUND_PROCESS_EVENT',
              status: 'QUEUED',
              payload: {
                inboundEventId: lead.id,
                organizationId,
              },
              maxAttempts: 5,
              ttlSeconds: 300,
            },
          });

          totalCreated++;
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // Duplicate, skip
        } else {
          logger.error(`Failed to create inbound event for ${lead.id}: ${err.message}`);
        }
      }
    }

    nextUrl = body.paging?.next ?? null;
  }

  logger.log(`Backfill complete: source=${metaLeadSourceId} created=${totalCreated}`);
}

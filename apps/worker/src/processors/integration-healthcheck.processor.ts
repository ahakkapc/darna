import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

async function withOrgWorker(prisma: PrismaClient, orgId: string, fn: (tx: any) => Promise<any>) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, orgId);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
    const result = await fn(tx);
    await tx.$executeRawUnsafe(`RESET ROLE`);
    return result;
  });
}

export async function processIntegrationHealthcheck(
  prisma: PrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  const integrationId = data.integrationId as string;
  const orgId = data.organizationId as string;

  if (!integrationId || !orgId) {
    logger.error('INTEGRATION_HEALTHCHECK missing integrationId or orgId', { data });
    return;
  }

  const integration = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.integration.findFirst({ where: { id: integrationId } }),
  );

  if (!integration) {
    logger.warn('Integration not found for healthcheck', { integrationId });
    return;
  }

  try {
    // Placeholder healthcheck — real implementations will test provider connectivity
    // e.g. Meta API token validity, SMTP connection test, WhatsApp API ping
    const healthResult = {
      lastCheckAt: new Date().toISOString(),
      status: 'OK',
      latencyMs: 0,
    };

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.integration.update({
        where: { id: integrationId },
        data: {
          healthJson: healthResult,
          status: 'ACTIVE',
        },
      }),
    );

    logger.info('Integration healthcheck OK', { integrationId, type: integration.type });
  } catch (err) {
    const error = err as Error;

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.integration.update({
        where: { id: integrationId },
        data: {
          healthJson: {
            lastCheckAt: new Date().toISOString(),
            status: 'ERROR',
            lastErrorCode: error.message?.substring(0, 100),
          },
          status: 'ERROR',
        },
      }),
    );

    logger.error('Integration healthcheck FAILED', { integrationId, error: error.message });
  }
}

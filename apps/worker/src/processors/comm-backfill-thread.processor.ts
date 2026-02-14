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

export async function processCommBackfillThread(
  prisma: PrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  const orgId = data.organizationId as string;
  const threadId = data.threadId as string;
  const leadId = data.leadId as string;
  const userId = (data.userId as string) ?? null;

  if (!orgId || !threadId || !leadId) {
    logger.error('COMM_BACKFILL_THREAD missing required fields', { data });
    return;
  }

  logger.info('Starting CommEvent backfill', { orgId, threadId, leadId });

  const messages: any[] = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.inboxMessage.findMany({
      where: { threadId },
      orderBy: { occurredAt: 'asc' },
      take: 5000,
    }),
  );

  let created = 0;
  let skipped = 0;

  for (const msg of messages) {
    try {
      const isInbound = msg.direction === 'INBOUND';
      const providerMsgId = isInbound ? (msg.providerMessageId ?? null) : null;
      const dedupeKey = isInbound
        ? (msg.providerMessageId ? null : `inbox:in:${msg.id}`)
        : `inbox:out:${msg.id}`;

      const commEvent = await withOrgWorker(prisma, orgId, (tx: any) =>
        tx.commEvent.create({
          data: {
            organizationId: orgId,
            channel: 'WHATSAPP',
            direction: isInbound ? 'INBOUND' : 'OUTBOUND',
            status: isInbound ? 'RECEIVED' : (msg.status ?? 'SENT'),
            occurredAt: msg.occurredAt ?? new Date(),
            leadId,
            inboxThreadId: threadId,
            inboxMessageId: msg.id,
            providerMessageId: providerMsgId,
            dedupeKey,
            preview: msg.bodyText?.slice(0, 140) ?? null,
          },
        }),
      );

      const activityType = isInbound ? 'WHATSAPP_INBOUND' : 'WHATSAPP_SENT';
      const title = isInbound ? 'WhatsApp reçu' : 'WhatsApp envoyé';

      const existing = await withOrgWorker(prisma, orgId, (tx: any) =>
        tx.leadActivity.findFirst({
          where: { payloadJson: { path: ['commEventId'], equals: commEvent.id } },
          select: { id: true },
        }),
      );

      if (!existing) {
        await withOrgWorker(prisma, orgId, (tx: any) =>
          tx.leadActivity.create({
            data: {
              organizationId: orgId,
              leadId,
              type: activityType,
              direction: msg.direction,
              title,
              body: msg.bodyText?.slice(0, 140) ?? null,
              createdByUserId: msg.createdByUserId ?? userId,
              happenedAt: msg.occurredAt ?? new Date(),
              payloadJson: {
                commEventId: commEvent.id,
                channel: 'WHATSAPP',
                direction: msg.direction,
                status: isInbound ? 'RECEIVED' : (msg.status ?? 'SENT'),
                threadId,
                inboxMessageId: msg.id,
                providerMessageId: providerMsgId,
              },
            },
          }),
        );
      }

      created++;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        skipped++;
        continue;
      }
      logger.warn('Backfill message failed', { messageId: msg.id, error: e.message?.slice(0, 200) });
      skipped++;
    }
  }

  logger.info('CommEvent backfill complete', { threadId, created, skipped, total: messages.length });
}

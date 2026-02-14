import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

const BACKOFF_SCHEDULE = [60, 300, 900, 3600, 21600]; // 1m,5m,15m,1h,6h
const MAX_ATTEMPTS = 5;

async function withOrgWorker(prisma: PrismaClient, orgId: string, fn: (tx: any) => Promise<any>) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, orgId);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
    const result = await fn(tx);
    await tx.$executeRawUnsafe(`RESET ROLE`);
    return result;
  });
}

export async function processInboundEvent(
  prisma: PrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  const eventId = data.inboundEventId as string;
  const orgId = data.organizationId as string;

  if (!eventId || !orgId) {
    logger.error('INBOUND_PROCESS_EVENT missing eventId or orgId', { data });
    return;
  }

  const event = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.inboundEvent.findFirst({ where: { id: eventId } }),
  );

  if (!event) {
    logger.warn('InboundEvent not found', { eventId });
    return;
  }

  if (event.status === 'PROCESSED' || event.status === 'DEAD' || event.status === 'DUPLICATE') {
    logger.info('InboundEvent already terminal', { eventId, status: event.status });
    return;
  }

  // Lock + set PROCESSING
  await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.inboundEvent.update({
      where: { id: eventId },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        lockedBy: `worker:${process.pid}`,
        attemptCount: { increment: 1 },
      },
    }),
  );

  try {
    // No registered processor yet — mark as PROCESSED (framework placeholder)
    // Real processors (MetaLeadgenProcessor, etc.) will be registered in future SPECs
    logger.info('InboundEvent processed (no-op processor)', { eventId, sourceType: event.sourceType });

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.inboundEvent.update({
        where: { id: eventId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );
  } catch (err) {
    const error = err as Error;
    const newAttemptCount = (event.attemptCount ?? 0) + 1;
    const isFinal = newAttemptCount >= MAX_ATTEMPTS;

    const backoffIdx = Math.min(newAttemptCount - 1, BACKOFF_SCHEDULE.length - 1);
    const nextAttemptAt = isFinal ? null : new Date(Date.now() + BACKOFF_SCHEDULE[backoffIdx] * 1000);

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.inboundEvent.update({
        where: { id: eventId },
        data: {
          status: isFinal ? 'DEAD' : 'ERROR',
          lastErrorCode: error.message?.substring(0, 100) ?? 'UNKNOWN',
          lastErrorMsg: error.message?.substring(0, 500),
          nextAttemptAt,
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );

    if (isFinal) {
      logger.error('InboundEvent DEAD after max attempts', { eventId, attempts: newAttemptCount });
    } else {
      logger.warn('InboundEvent ERROR, will retry', { eventId, attempts: newAttemptCount, nextAttemptAt });
    }
  }
}

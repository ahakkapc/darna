import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

const BACKOFF_SCHEDULE = [60, 300, 900, 3600, 21600];
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

export async function processOutboundJob(
  prisma: PrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  const jobId = data.outboundJobId as string;
  const orgId = data.organizationId as string;

  if (!jobId || !orgId) {
    logger.error('OUTBOUND_PROCESS_JOB missing jobId or orgId', { data });
    return;
  }

  const job = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.outboundJob.findFirst({ where: { id: jobId } }),
  );

  if (!job) {
    logger.warn('OutboundJob not found', { jobId });
    return;
  }

  if (job.status === 'SENT' || job.status === 'DEAD' || job.status === 'CANCELED') {
    logger.info('OutboundJob already terminal', { jobId, status: job.status });
    return;
  }

  // Lock + set PROCESSING
  await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.outboundJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(),
        lockedBy: `worker:${process.pid}`,
        attemptCount: { increment: 1 },
      },
    }),
  );

  try {
    // No registered provider yet — mock success (framework placeholder)
    // Real providers (Twilio, Resend, SMTP) will be registered in future SPECs
    const mockProviderMessageId = `mock_${Date.now()}_${jobId.substring(0, 8)}`;

    logger.info('OutboundJob sent (mock provider)', { jobId, type: job.type, provider: job.provider });

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.outboundJob.update({
        where: { id: jobId },
        data: {
          status: 'SENT',
          resultJson: { providerMessageId: mockProviderMessageId, sentAt: new Date().toISOString() },
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );

    // Update CommEvent + InboxMessage status
    await updateCommEventStatus(prisma, orgId, jobId, 'SENT', mockProviderMessageId);
  } catch (err) {
    const error = err as Error;
    const newAttemptCount = (job.attemptCount ?? 0) + 1;
    const isRateLimited = error.message?.includes('RATE_LIMITED');
    const isFinal = newAttemptCount >= MAX_ATTEMPTS && !isRateLimited;

    const backoffIdx = Math.min(newAttemptCount - 1, BACKOFF_SCHEDULE.length - 1);
    const nextAttemptAt = isFinal
      ? null
      : new Date(Date.now() + (isRateLimited ? 10_000 : BACKOFF_SCHEDULE[backoffIdx] * 1000));

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.outboundJob.update({
        where: { id: jobId },
        data: {
          status: isFinal ? 'DEAD' : 'FAILED',
          lastErrorCode: isRateLimited ? 'RATE_LIMITED' : (error.message?.substring(0, 100) ?? 'UNKNOWN'),
          lastErrorMsg: error.message?.substring(0, 500),
          nextAttemptAt,
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );

    // Update CommEvent status
    await updateCommEventStatus(
      prisma, orgId, jobId,
      isFinal ? 'FAILED' : 'FAILED',
      undefined,
      isRateLimited ? 'RATE_LIMITED' : error.message?.substring(0, 100),
      error.message?.substring(0, 500),
    );

    if (isFinal) {
      logger.error('OutboundJob DEAD after max attempts', { jobId, attempts: newAttemptCount });
    } else {
      logger.warn('OutboundJob FAILED, will retry', { jobId, attempts: newAttemptCount, nextAttemptAt });
    }
  }
}

async function updateCommEventStatus(
  prisma: PrismaClient,
  orgId: string,
  outboundJobId: string,
  newStatus: string,
  providerMessageId?: string,
  errorCode?: string,
  errorMsg?: string,
): Promise<void> {
  try {
    const commEvent = await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.commEvent.findFirst({ where: { outboundJobId } }),
    );
    if (!commEvent) return;

    const updateData: Record<string, unknown> = { status: newStatus };
    if (providerMessageId && !commEvent.providerMessageId) {
      updateData.providerMessageId = providerMessageId;
    }
    if (errorCode || errorMsg) {
      const meta = (commEvent.metaJson as Record<string, unknown>) ?? {};
      meta.lastErrorCode = errorCode;
      meta.lastErrorMsg = errorMsg;
      updateData.metaJson = meta;
    }

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.commEvent.update({ where: { id: commEvent.id }, data: updateData }),
    );

    // Also update InboxMessage status if linked
    if (commEvent.inboxMessageId) {
      const statusMap: Record<string, string> = { SENT: 'SENT', DELIVERED: 'DELIVERED', FAILED: 'FAILED' };
      const mapped = statusMap[newStatus];
      if (mapped) {
        await withOrgWorker(prisma, orgId, (tx: any) =>
          tx.inboxMessage.update({ where: { id: commEvent.inboxMessageId }, data: { status: mapped } }),
        ).catch(() => {});
      }
    }

    // Update LeadActivity payload status
    const activity = await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.leadActivity.findFirst({
        where: { payloadJson: { path: ['commEventId'], equals: commEvent.id } },
        select: { id: true, payloadJson: true },
      }),
    );
    if (activity) {
      const payload = (activity.payloadJson as Record<string, unknown>) ?? {};
      payload.status = newStatus;
      await withOrgWorker(prisma, orgId, (tx: any) =>
        tx.leadActivity.update({ where: { id: activity.id }, data: { payloadJson: payload } }),
      ).catch(() => {});
    }
  } catch (e: any) {
    logger.warn('updateCommEventStatus failed', { outboundJobId, error: e.message?.slice(0, 200) });
  }
}

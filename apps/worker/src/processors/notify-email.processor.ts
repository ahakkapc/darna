import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import { notifyConfig, computeNextAttemptAt } from '../notify-config';
import { sendEmailResend } from '../providers/email-resend';

export async function processNotifyEmail(
  prisma: PrismaClient,
  payload: { organizationId?: string; dispatchId?: string; requestId?: string },
): Promise<void> {
  const orgId = payload.organizationId;
  const dispatchId = payload.dispatchId;
  const ctx = { dispatchId, orgId, channel: 'EMAIL' };

  if (!orgId || !dispatchId) {
    logger.warn('NOTIFY_EMAIL missing orgId or dispatchId — skip', ctx);
    return;
  }

  const dispatch = await prisma.notificationDispatch.findFirst({
    where: { id: dispatchId, organizationId: orgId, channel: 'EMAIL' },
    include: { notification: true },
  });

  if (!dispatch) {
    logger.warn('NOTIFY_EMAIL dispatch not found — skip', ctx);
    return;
  }

  if (dispatch.state === 'SENT' || dispatch.state === 'DEAD' || dispatch.state === 'CANCELED') {
    logger.info(`NOTIFY_EMAIL dispatch already ${dispatch.state} — skip`, ctx);
    return;
  }

  if (dispatch.state !== 'PENDING' && dispatch.state !== 'FAILED') {
    logger.info(`NOTIFY_EMAIL dispatch state=${dispatch.state} — skip`, ctx);
    return;
  }

  if (dispatch.notification.recordStatus === 'DELETED' || dispatch.notification.deletedAt) {
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: { state: 'CANCELED', lockedAt: null, lockedBy: null, lastErrorCode: 'NOTIFICATION_DELETED', lastErrorMessage: 'Notification was soft-deleted before dispatch', nextAttemptAt: null },
    });
    logger.info('NOTIFY_EMAIL notification deleted — CANCELED', ctx);
    return;
  }

  const lockId = `worker:${process.pid}`;
  const now = new Date();
  const attempts = dispatch.attempts + 1;

  await prisma.notificationDispatch.update({
    where: { id: dispatchId },
    data: { state: 'SENDING', lockedAt: now, lockedBy: lockId, attempts },
  });

  if (!notifyConfig.emailEnabled) {
    const isDead = attempts >= dispatch.maxAttempts;
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: {
        state: isDead ? 'DEAD' : 'FAILED',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: 'EMAIL_DISABLED',
        lastErrorMessage: 'Email sending is disabled via NOTIFY_EMAIL_ENABLED',
        nextAttemptAt: isDead ? null : computeNextAttemptAt(attempts),
      },
    });
    logger.warn(`NOTIFY_EMAIL disabled — marked ${isDead ? 'DEAD' : 'FAILED'}`, { ...ctx, attempt: attempts });
    return;
  }

  const to = dispatch.to ?? (dispatch.notification.metaJson as any)?.recipientEmail ?? undefined;

  if (!to) {
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: {
        state: 'DEAD',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: 'NO_RECIPIENT_EMAIL',
        lastErrorMessage: 'No email address found for dispatch',
        nextAttemptAt: null,
      },
    });
    logger.error('NOTIFY_EMAIL no recipient email — DEAD', ctx);
    return;
  }

  try {
    const result = await sendEmailResend({
      to,
      subject: dispatch.notification.title,
      html: dispatch.notification.body ?? dispatch.notification.title,
      text: dispatch.notification.body ?? dispatch.notification.title,
      idempotencyKey: `email:${dispatchId}`,
    });

    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: {
        state: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextAttemptAt: null,
      },
    });

    logger.info('NOTIFY_EMAIL sent', { ...ctx, providerMessageId: result.providerMessageId, attempt: attempts });
  } catch (err: any) {
    const isDead = attempts >= dispatch.maxAttempts;
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: {
        state: isDead ? 'DEAD' : 'FAILED',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: (err.code ?? 'UNKNOWN').substring(0, 100),
        lastErrorMessage: (err.message ?? '').substring(0, 500),
        lastErrorJson: { message: err.message, stack: err.stack?.substring(0, 500) } as any,
        nextAttemptAt: isDead ? null : computeNextAttemptAt(attempts),
      },
    });

    if (isDead) {
      logger.error('NOTIFY_EMAIL DEAD after max attempts', { ...ctx, attempt: attempts, error: err.message });
    } else {
      logger.warn('NOTIFY_EMAIL failed — will retry', { ...ctx, attempt: attempts, error: err.message });
    }
  }
}

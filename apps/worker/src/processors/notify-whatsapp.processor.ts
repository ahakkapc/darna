import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import { notifyConfig, computeNextAttemptAt } from '../notify-config';
import { sendWhatsappTwilio, isValidE164 } from '../providers/whatsapp-twilio';

export async function processNotifyWhatsapp(
  prisma: PrismaClient,
  payload: { organizationId?: string; dispatchId?: string; requestId?: string },
): Promise<void> {
  const orgId = payload.organizationId;
  const dispatchId = payload.dispatchId;
  const ctx = { dispatchId, orgId, channel: 'WHATSAPP' };

  if (!orgId || !dispatchId) {
    logger.warn('NOTIFY_WHATSAPP missing orgId or dispatchId — skip', ctx);
    return;
  }

  const dispatch = await prisma.notificationDispatch.findFirst({
    where: { id: dispatchId, organizationId: orgId, channel: 'WHATSAPP' },
    include: { notification: true },
  });

  if (!dispatch) {
    logger.warn('NOTIFY_WHATSAPP dispatch not found — skip', ctx);
    return;
  }

  if (dispatch.state === 'SENT' || dispatch.state === 'DEAD' || dispatch.state === 'CANCELED') {
    logger.info(`NOTIFY_WHATSAPP dispatch already ${dispatch.state} — skip`, ctx);
    return;
  }

  if (dispatch.state !== 'PENDING' && dispatch.state !== 'FAILED') {
    logger.info(`NOTIFY_WHATSAPP dispatch state=${dispatch.state} — skip`, ctx);
    return;
  }

  if (dispatch.notification.recordStatus === 'DELETED' || dispatch.notification.deletedAt) {
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: { state: 'CANCELED', lockedAt: null, lockedBy: null, lastErrorCode: 'NOTIFICATION_DELETED', lastErrorMessage: 'Notification was soft-deleted before dispatch', nextAttemptAt: null },
    });
    logger.info('NOTIFY_WHATSAPP notification deleted — CANCELED', ctx);
    return;
  }

  const lockId = `worker:${process.pid}`;
  const now = new Date();
  const attempts = dispatch.attempts + 1;

  await prisma.notificationDispatch.update({
    where: { id: dispatchId },
    data: { state: 'SENDING', lockedAt: now, lockedBy: lockId, attempts },
  });

  if (!notifyConfig.whatsappEnabled) {
    const isDead = attempts >= dispatch.maxAttempts;
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: {
        state: isDead ? 'DEAD' : 'FAILED',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: 'WHATSAPP_DISABLED',
        lastErrorMessage: 'WhatsApp sending is disabled via NOTIFY_WHATSAPP_ENABLED',
        nextAttemptAt: isDead ? null : computeNextAttemptAt(attempts),
      },
    });
    logger.warn(`NOTIFY_WHATSAPP disabled — marked ${isDead ? 'DEAD' : 'FAILED'}`, { ...ctx, attempt: attempts });
    return;
  }

  const to = dispatch.to ?? (dispatch.notification.metaJson as any)?.recipientPhone;

  if (!to || !isValidE164(to)) {
    await prisma.notificationDispatch.update({
      where: { id: dispatchId },
      data: {
        state: 'DEAD',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: to ? 'INVALID_PHONE_E164' : 'NO_RECIPIENT_PHONE',
        lastErrorMessage: to ? `Invalid E.164: ${to}` : 'No phone number found for dispatch',
        nextAttemptAt: null,
      },
    });
    logger.error('NOTIFY_WHATSAPP invalid or missing phone — DEAD', { ...ctx, to });
    return;
  }

  try {
    const body = dispatch.notification.body ?? dispatch.notification.title;
    const result = await sendWhatsappTwilio({
      to,
      body,
      idempotencyKey: `whatsapp:${dispatchId}`,
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

    logger.info('NOTIFY_WHATSAPP sent', { ...ctx, providerMessageId: result.providerMessageId, attempt: attempts });
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
      logger.error('NOTIFY_WHATSAPP DEAD after max attempts', { ...ctx, attempt: attempts, error: err.message });
    } else {
      logger.warn('NOTIFY_WHATSAPP failed — will retry', { ...ctx, attempt: attempts, error: err.message });
    }
  }
}

import { PrismaClient } from '@prisma/client';

export async function processNotifyEmail(
  _prisma: PrismaClient,
  payload: { template?: string; to?: string; requestId?: string },
): Promise<void> {
  // MVP stub: log intent, no actual email sending
  console.log(`[NOTIFY_EMAIL] stub — template=${payload.template ?? 'unknown'} to=${payload.to ?? 'unknown'}`);
}

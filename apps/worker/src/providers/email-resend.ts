import { notifyConfig } from '../notify-config';
import { logger } from '../logger';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
}

interface SendEmailResult {
  providerMessageId: string;
}

export async function sendEmailResend(input: SendEmailInput): Promise<SendEmailResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notifyConfig.emailApiKey}`,
      'Content-Type': 'application/json',
      ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: notifyConfig.emailFrom,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error('Resend API error', { status: res.status, body: body.substring(0, 500) });
    const err = new Error(`Resend API ${res.status}: ${body.substring(0, 200)}`);
    (err as any).code = `RESEND_${res.status}`;
    throw err;
  }

  const data = await res.json() as { id: string };
  return { providerMessageId: data.id };
}

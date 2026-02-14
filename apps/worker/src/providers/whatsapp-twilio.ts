import { notifyConfig } from '../notify-config';
import { logger } from '../logger';

interface SendWhatsappInput {
  to: string;
  body: string;
  idempotencyKey?: string;
}

interface SendWhatsappResult {
  providerMessageId: string;
}

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

export async function sendWhatsappTwilio(input: SendWhatsappInput): Promise<SendWhatsappResult> {
  if (!isValidE164(input.to)) {
    const err = new Error(`Invalid E.164 phone number: ${input.to}`);
    (err as any).code = 'INVALID_PHONE_E164';
    throw err;
  }

  const { whatsappAccountSid, whatsappAuthToken, whatsappFrom } = notifyConfig;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${whatsappAccountSid}/Messages.json`;

  const params = new URLSearchParams();
  params.set('From', `whatsapp:${whatsappFrom}`);
  params.set('To', `whatsapp:${input.to}`);
  params.set('Body', input.body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${whatsappAccountSid}:${whatsappAuthToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error('Twilio API error', { status: res.status, body: body.substring(0, 500) });
    const err = new Error(`Twilio API ${res.status}: ${body.substring(0, 200)}`);
    (err as any).code = `TWILIO_${res.status}`;
    throw err;
  }

  const data = await res.json() as { sid: string };
  return { providerMessageId: data.sid };
}

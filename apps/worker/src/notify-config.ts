export const notifyConfig = {
  emailEnabled: process.env.NOTIFY_EMAIL_ENABLED === 'true',
  whatsappEnabled: process.env.NOTIFY_WHATSAPP_ENABLED === 'true',

  emailProvider: (process.env.EMAIL_PROVIDER ?? 'RESEND') as 'RESEND' | 'SENDGRID',
  emailApiKey: process.env.EMAIL_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'Darna <no-reply@darna.app>',

  whatsappProvider: (process.env.WHATSAPP_PROVIDER ?? 'TWILIO') as 'TWILIO',
  whatsappAccountSid: process.env.WHATSAPP_ACCOUNT_SID ?? '',
  whatsappAuthToken: process.env.WHATSAPP_AUTH_TOKEN ?? '',
  whatsappFrom: process.env.WHATSAPP_FROM ?? '',

  maxAttempts: parseInt(process.env.NOTIFY_MAX_ATTEMPTS ?? '8', 10),
  retryBaseSeconds: parseInt(process.env.NOTIFY_RETRY_BASE_SECONDS ?? '60', 10),
  retryMaxSeconds: parseInt(process.env.NOTIFY_RETRY_MAX_SECONDS ?? '3600', 10),
  lockSeconds: parseInt(process.env.NOTIFY_LOCK_SECONDS ?? '60', 10),
  batchSize: parseInt(process.env.NOTIFY_BATCH_SIZE ?? '20', 10),
};

export function computeNextAttemptAt(attempts: number): Date {
  const base = notifyConfig.retryBaseSeconds;
  const max = notifyConfig.retryMaxSeconds;
  const delay = Math.min(max, base * Math.pow(2, attempts - 1));
  const jitter = Math.random() * 15;
  return new Date(Date.now() + (delay + jitter) * 1000);
}

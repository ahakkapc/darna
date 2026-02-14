import { createHmac } from 'crypto';
import { Logger } from '@nestjs/common';
import { AppError } from '../common/errors/app-error';

const logger = new Logger('WebhookSecurity');

// Anti-replay store (in-memory, TTL-based cleanup)
const processedEvents = new Map<string, number>();
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function cleanupReplayStore(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - REPLAY_WINDOW_MS;
  for (const [key, ts] of processedEvents) {
    if (ts < cutoff) processedEvents.delete(key);
  }
}

/**
 * Verify Meta/Facebook webhook signature (X-Hub-Signature-256)
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature) {
    return false;
  }

  const [algo, hash] = signature.split('=');
  if (algo !== 'sha256' || !hash) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return hash === expected;
}

/**
 * Verify WhatsApp Cloud API webhook signature (X-Hub-Signature-256)
 * Same as Meta signature verification
 */
export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signature: string | undefined,
  appSecret: string,
): boolean {
  return verifyMetaSignature(rawBody, signature, appSecret);
}

/**
 * Check for replay attack using event ID
 * Returns true if this is a replay (already processed)
 */
export function isReplayAttack(eventId: string, channel: string): boolean {
  cleanupReplayStore();
  const key = `${channel}:${eventId}`;
  if (processedEvents.has(key)) {
    logger.warn(`Replay attack detected: ${key}`);
    return true;
  }
  processedEvents.set(key, Date.now());
  return false;
}

/**
 * Check timestamp freshness (anti-replay via timestamp)
 * Returns true if timestamp is stale (outside tolerance window)
 */
export function isStaleTimestamp(
  timestamp: number | undefined,
  toleranceMs: number = REPLAY_WINDOW_MS,
): boolean {
  if (!timestamp) return false; // Skip check if no timestamp provided
  const now = Date.now();
  const diff = Math.abs(now - timestamp * 1000); // timestamp is usually in seconds
  return diff > toleranceMs;
}

/**
 * Mask PII from webhook payload for safe logging
 */
export function maskWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const piiFields = ['phone', 'email', 'name', 'first_name', 'last_name', 'address', 'ip'];
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (piiFields.some((pii) => lowerKey.includes(pii))) {
      masked[key] = typeof value === 'string' ? `***${value.slice(-4)}` : '***';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      masked[key] = maskWebhookPayload(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Webhook security errors
 */
export const WEBHOOK_SIGNATURE_MISSING = () =>
  new AppError('WEBHOOK_SIGNATURE_MISSING', 401, 'X-Hub-Signature-256 header required');

export const WEBHOOK_SIGNATURE_INVALID = () =>
  new AppError('WEBHOOK_SIGNATURE_INVALID', 401, 'Invalid webhook signature');

export const WEBHOOK_REPLAY_DETECTED = () =>
  new AppError('WEBHOOK_REPLAY_DETECTED', 409, 'Duplicate event detected');

export const WEBHOOK_TIMESTAMP_STALE = () =>
  new AppError('WEBHOOK_TIMESTAMP_STALE', 400, 'Event timestamp is too old');

export const WEBHOOK_BODY_TOO_LARGE = () =>
  new AppError('WEBHOOK_BODY_TOO_LARGE', 413, 'Request body exceeds size limit');

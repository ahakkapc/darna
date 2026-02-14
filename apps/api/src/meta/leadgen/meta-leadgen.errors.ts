import { AppError } from '../../common/errors/app-error';

export const WEBHOOK_SIGNATURE_INVALID = () =>
  new AppError('WEBHOOK_SIGNATURE_INVALID', 401, 'Invalid webhook signature');

export const WEBHOOK_VERIFY_FAILED = () =>
  new AppError('WEBHOOK_VERIFY_FAILED', 403, 'Webhook verification failed');

export const META_SOURCE_NOT_FOUND = () =>
  new AppError('META_SOURCE_NOT_FOUND', 404, 'Meta lead source not found');

export const META_TOKEN_EXPIRED = () =>
  new AppError('META_TOKEN_EXPIRED', 409, 'Meta access token is expired or invalid');

export const META_PERMISSION_MISSING = () =>
  new AppError('META_PERMISSION_MISSING', 403, 'Missing Meta API permission');

export const META_RATE_LIMIT = () =>
  new AppError('META_RATE_LIMIT', 429, 'Meta API rate limit reached');

export const META_LEAD_FETCH_FAILED = (detail?: string) =>
  new AppError('META_LEAD_FETCH_FAILED', 502, detail ?? 'Failed to fetch lead from Meta Graph API');

export const META_MAPPING_INVALID = (detail?: string) =>
  new AppError('META_MAPPING_INVALID', 400, detail ?? 'Invalid field mapping configuration');

import { AppError } from '../common/errors/app-error';

export const INBOX_THREAD_NOT_FOUND = () =>
  new AppError('INBOX_THREAD_NOT_FOUND', 404, 'Thread not found');

export const INBOX_ACCESS_DENIED = () =>
  new AppError('INBOX_ACCESS_DENIED', 403, 'Access denied to this thread');

export const INBOX_INTEGRATION_REQUIRED = () =>
  new AppError('INBOX_INTEGRATION_REQUIRED', 409, 'WhatsApp integration required');

export const INBOX_MESSAGE_SEND_FAILED = () =>
  new AppError('INBOX_MESSAGE_SEND_FAILED', 502, 'Failed to send message');

export const INBOX_THREAD_ALREADY_ASSIGNED = () =>
  new AppError('INBOX_THREAD_ALREADY_ASSIGNED', 409, 'Thread already assigned');

export const INBOX_INVALID_STATUS = () =>
  new AppError('INBOX_INVALID_STATUS', 400, 'Invalid thread status');

export const INBOX_THREAD_CLOSED = () =>
  new AppError('INBOX_THREAD_CLOSED', 409, 'Thread is closed');

export const INBOX_WEBHOOK_SIGNATURE_INVALID = () =>
  new AppError('INBOX_WEBHOOK_SIGNATURE_INVALID', 401, 'Invalid webhook signature');

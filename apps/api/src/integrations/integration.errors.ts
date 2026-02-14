import { AppError } from '../common/errors/app-error';

export const INTEGRATION_NOT_FOUND = () =>
  new AppError('NOT_FOUND', 404, 'Integration not found');

export const INTEGRATION_DISABLED = () =>
  new AppError('INTEGRATION_DISABLED', 409, 'Integration is disabled');

export const INTEGRATION_SECRET_MISSING = (key: string) =>
  new AppError('INTEGRATION_SECRET_MISSING', 409, `Secret "${key}" is missing for this integration`);

export const INBOUND_EVENT_NOT_FOUND = () =>
  new AppError('NOT_FOUND', 404, 'Inbound event not found');

export const INBOUND_EVENT_INVALID = (msg: string) =>
  new AppError('INBOUND_EVENT_INVALID', 400, msg);

export const OUTBOUND_JOB_NOT_FOUND = () =>
  new AppError('NOT_FOUND', 404, 'Outbound job not found');

export const OUTBOUND_JOB_INVALID = (msg: string) =>
  new AppError('OUTBOUND_JOB_INVALID', 400, msg);

export const ROLE_FORBIDDEN = () =>
  new AppError('ROLE_FORBIDDEN', 403, 'Insufficient permissions');

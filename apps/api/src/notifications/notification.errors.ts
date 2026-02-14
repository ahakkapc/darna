import { AppError } from '../common/errors/app-error';

export const NOTIFICATION_NOT_FOUND = () =>
  new AppError('NOTIFICATION_NOT_FOUND', 404, 'Notification not found');

export const NOTIFICATION_PREF_INVALID_CATEGORY = () =>
  new AppError(
    'NOTIFICATION_PREF_INVALID_CATEGORY',
    400,
    'Invalid notification category',
  );

export const PHONE_NOT_VERIFIED = () =>
  new AppError(
    'PHONE_NOT_VERIFIED',
    409,
    'WhatsApp requires a verified E.164 phone number',
  );

export const FEATURE_NOT_AVAILABLE = () =>
  new AppError(
    'FEATURE_NOT_AVAILABLE',
    400,
    'Les notifications WhatsApp ne sont pas encore disponibles',
  );

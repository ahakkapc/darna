import { AppError } from '../../common/errors/app-error';

export function validatePayloadByType(
  type: string,
  body: string | undefined,
  direction: string | undefined,
  payload: Record<string, unknown> | undefined,
): void {
  switch (type) {
    case 'NOTE':
      if (!body || body.trim().length === 0) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'body is required for NOTE');
      }
      break;

    case 'CALL':
      if (!direction) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'direction is required for CALL');
      }
      if (!payload?.phone) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'payload.phone is required for CALL');
      }
      if (!payload?.outcome) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'payload.outcome is required for CALL');
      }
      {
        const validOutcomes = ['ANSWERED', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'WRONG_NUMBER'];
        if (!validOutcomes.includes(payload.outcome as string)) {
          throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, `payload.outcome must be one of: ${validOutcomes.join(', ')}`);
        }
      }
      if (payload?.durationSec !== undefined && (typeof payload.durationSec !== 'number' || payload.durationSec < 0)) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'payload.durationSec must be >= 0');
      }
      break;

    case 'SMS':
      if (!direction) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'direction is required for SMS');
      }
      if (!body || body.trim().length === 0) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'body is required for SMS');
      }
      break;

    case 'EMAIL':
      if (!direction) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'direction is required for EMAIL');
      }
      if (!body || body.trim().length === 0) {
        throw new AppError('ACTIVITY_PAYLOAD_INVALID', 400, 'body is required for EMAIL');
      }
      break;

    case 'VISIT':
      break;

    default:
      throw new AppError('ACTIVITY_TYPE_INVALID', 400, `Unknown activity type: ${type}`);
  }
}

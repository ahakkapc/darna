import { AppError } from '../common/errors/app-error';

export const LEAD_OPTED_OUT_CHANNEL = () =>
  new AppError('LEAD_OPTED_OUT_CHANNEL', 409, 'Lead has opted out of this communication channel');

export const COMM_BACKFILL_TOO_LARGE = () =>
  new AppError('COMM_BACKFILL_TOO_LARGE', 409, 'Thread has too many messages for synchronous backfill; job enqueued');

export const COMM_EVENT_MISSING_LEAD = () =>
  new AppError('COMM_EVENT_MISSING_LEAD', 409, 'Cannot create CommEvent without a linked lead');

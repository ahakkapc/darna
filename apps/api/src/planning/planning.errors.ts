import { AppError } from '../common/errors/app-error';

export const EVENT_TIME_CONFLICT = (conflictEventId: string, conflictStart: string, conflictEnd: string) =>
  new AppError('EVENT_TIME_CONFLICT', 409, 'This time slot conflicts with an existing event', {
    conflictEventId,
    conflictStart,
    conflictEnd,
  });

export const EVENT_INVALID_RANGE = () =>
  new AppError('EVENT_INVALID_RANGE', 400, 'startAt must be before endAt');

export const EVENT_DURATION_TOO_LONG = () =>
  new AppError('EVENT_DURATION_TOO_LONG', 400, 'Event duration cannot exceed 8 hours');

export const PERIOD_TOO_LARGE = () =>
  new AppError('PERIOD_TOO_LARGE', 400, 'Listing window cannot exceed 90 days');

export const ASSIGNEE_NOT_MEMBER = () =>
  new AppError('ASSIGNEE_NOT_MEMBER', 400, 'Assignee is not a member of this organization');

export const EVENT_NOT_FOUND = () =>
  new AppError('NOT_FOUND', 404, 'Event not found');

export const EVENT_ALREADY_CANCELED = () =>
  new AppError('EVENT_ALREADY_CANCELED', 409, 'Event is already canceled');

export const EVENT_ALREADY_COMPLETED = () =>
  new AppError('EVENT_ALREADY_COMPLETED', 409, 'Event is already completed');

import { AppError } from '../../common/errors/app-error';

export const TASK_NOT_FOUND = new AppError('TASK_NOT_FOUND', 404, 'Task not found');
export const TASK_ASSIGN_FORBIDDEN = new AppError('TASK_ASSIGN_FORBIDDEN', 403, 'You cannot assign this task');
export const TASK_INVALID_SCOPE = new AppError('TASK_INVALID_SCOPE', 400, 'Invalid task scope');
export const TASK_REMINDER_DUPLICATE = new AppError('TASK_REMINDER_DUPLICATE', 409, 'Reminder already exists');

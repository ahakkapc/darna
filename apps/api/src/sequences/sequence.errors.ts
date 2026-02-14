import { AppError } from '../common/errors/app-error';

export const TEMPLATE_UNKNOWN_VARIABLE = (varName: string) =>
  new AppError('TEMPLATE_UNKNOWN_VARIABLE', 400, `Unknown template variable: {{${varName}}}`);

export const TEMPLATE_CHANNEL_MISMATCH = () =>
  new AppError('TEMPLATE_CHANNEL_MISMATCH', 400, 'Template channel does not match step channel');

export const TEMPLATE_NOT_FOUND = () =>
  new AppError('TEMPLATE_NOT_FOUND', 404, 'Template not found');

export const SEQUENCE_INVALID_STEPS = (reason: string) =>
  new AppError('SEQUENCE_INVALID_STEPS', 400, `Invalid sequence steps: ${reason}`);

export const SEQUENCE_NOT_FOUND = () =>
  new AppError('SEQUENCE_NOT_FOUND', 404, 'Sequence not found');

export const SEQUENCE_NOT_ACTIVE = () =>
  new AppError('SEQUENCE_NOT_ACTIVE', 409, 'Sequence must be ACTIVE to start a run');

export const SEQUENCE_ALREADY_RUNNING = () =>
  new AppError('SEQUENCE_ALREADY_RUNNING', 409, 'A run for this sequence and lead is already active');

export const SEQUENCE_RUN_NOT_FOUND = () =>
  new AppError('SEQUENCE_RUN_NOT_FOUND', 404, 'Sequence run not found');

export const PROVIDER_NOT_CONFIGURED = (channel: string) =>
  new AppError('PROVIDER_NOT_CONFIGURED', 409, `No active ${channel} provider integration found`);

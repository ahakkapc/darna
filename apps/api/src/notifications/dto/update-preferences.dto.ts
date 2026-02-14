import { IsString, IsOptional, IsBoolean } from 'class-validator';

export const VALID_CATEGORIES = [
  'LEAD',
  'TASK',
  'CASE',
  'LISTING',
  'INBOX',
  'BILLING',
  'KYC',
  'SYSTEM',
] as const;

export type NotificationCategory = (typeof VALID_CATEGORIES)[number];

export class UpdatePreferencesDto {
  @IsString()
  category!: string;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;
}

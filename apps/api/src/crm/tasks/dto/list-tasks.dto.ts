import { IsOptional, IsString, IsNumberString, Matches } from 'class-validator';

export class ListTasksDto {
  @IsOptional()
  @IsString()
  scope?: string; // my | team | lead:<uuid>

  @IsOptional()
  @IsString()
  status?: string; // OPEN, IN_PROGRESS, DONE, CANCELED (comma-separated)

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  overdue?: string; // 'true'

  @IsOptional()
  @IsString()
  @Matches(/^(today|week|month)$/, { message: 'due must be today, week, or month' })
  due?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsNumberString()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

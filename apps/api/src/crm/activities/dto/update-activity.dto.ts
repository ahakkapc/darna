import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsObject,
} from 'class-validator';

export class UpdateActivityDto {
  @IsOptional()
  @IsEnum(['INTERNAL', 'MANAGER_ONLY'])
  visibility?: 'INTERNAL' | 'MANAGER_ONLY';

  @IsOptional()
  @IsDateString()
  happenedAt?: string | null;

  @IsOptional()
  @IsDateString()
  plannedAt?: string | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

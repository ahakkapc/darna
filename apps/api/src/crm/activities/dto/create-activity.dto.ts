import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  MinLength,
  IsObject,
} from 'class-validator';

export class CreateActivityDto {
  @IsEnum(['NOTE', 'CALL', 'SMS', 'EMAIL', 'VISIT'])
  type!: 'NOTE' | 'CALL' | 'SMS' | 'EMAIL' | 'VISIT';

  @IsOptional()
  @IsEnum(['INTERNAL', 'MANAGER_ONLY'])
  visibility?: 'INTERNAL' | 'MANAGER_ONLY';

  @IsOptional()
  @IsDateString()
  happenedAt?: string;

  @IsOptional()
  @IsDateString()
  plannedAt?: string;

  @IsOptional()
  @IsEnum(['OUTBOUND', 'INBOUND'])
  direction?: 'OUTBOUND' | 'INBOUND';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  relatedDocumentId?: string;
}

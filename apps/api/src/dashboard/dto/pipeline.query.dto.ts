import { IsOptional, IsIn, IsDateString, IsString } from 'class-validator';

export class PipelineQueryDto {
  @IsIn(['today', 'week', 'month', 'custom'])
  period!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsIn(['me', 'org', 'user'])
  scope!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

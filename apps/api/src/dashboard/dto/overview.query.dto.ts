import { IsString, IsOptional, IsIn, IsUUID, IsDateString } from 'class-validator';

export class OverviewQueryDto {
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

import { IsOptional, IsString, Length } from 'class-validator';

export class AdminKycDecisionDto {
  @IsOptional()
  @IsString()
  @Length(2, 500)
  reason?: string;

  @IsOptional()
  @IsString()
  @Length(2, 500)
  notes?: string;
}

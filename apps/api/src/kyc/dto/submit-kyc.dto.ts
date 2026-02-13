import { IsOptional, IsString, Length } from 'class-validator';

export class SubmitKycDto {
  @IsString()
  @Length(5, 64)
  registryNumber!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  registryCity?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Length(5, 30)
  contactPhone?: string;
}

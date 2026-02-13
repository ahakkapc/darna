import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class UpdateOrgProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  persona?: string;

  @IsOptional()
  @IsString()
  @Length(5, 30)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @Length(5, 64)
  registryNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  registryCity?: string;
}

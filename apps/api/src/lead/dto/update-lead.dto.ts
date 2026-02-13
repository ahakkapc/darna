import { IsString, IsOptional, IsEmail, MinLength } from 'class-validator';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

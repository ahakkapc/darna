import { IsString, MinLength, MaxLength, IsOptional, IsEmail } from 'class-validator';

export class CreateLeadFromThreadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

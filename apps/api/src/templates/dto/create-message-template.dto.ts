import { IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateMessageTemplateDto {
  @IsEnum(['WHATSAPP', 'EMAIL'])
  channel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

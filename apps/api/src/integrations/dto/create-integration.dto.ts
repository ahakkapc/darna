import { IsString, IsEnum, IsOptional, IsObject, MaxLength } from 'class-validator';

export class CreateIntegrationDto {
  @IsEnum(['META_LEADGEN', 'WHATSAPP_PROVIDER', 'EMAIL_PROVIDER', 'EMAIL_INBOUND', 'GENERIC_WEBHOOK'])
  type!: string;

  @IsEnum(['META_CLOUD', 'TWILIO', 'RESEND', 'SENDGRID', 'SMTP', 'GENERIC'])
  provider!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;
}

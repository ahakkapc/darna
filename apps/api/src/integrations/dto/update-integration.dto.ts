import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;
}

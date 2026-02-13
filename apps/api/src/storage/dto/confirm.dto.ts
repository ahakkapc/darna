import { IsString, IsOptional, IsUUID, IsEnum, ValidateNested, Matches } from 'class-validator';
import { Type } from 'class-transformer';

class ConfirmDocumentDto {
  @IsEnum(['IMAGE', 'PDF', 'OTHER'])
  kind!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(['PRIVATE'])
  visibility?: string;
}

class ConfirmLinkDto {
  @IsEnum(['LISTING', 'PROGRAM', 'LEAD', 'KYC', 'USER_PROFILE', 'OTHER'])
  targetType!: string;

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsString()
  tag?: string;
}

export class ConfirmDto {
  @IsUUID()
  uploadSessionId!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'sha256 must be 64 hex characters' })
  sha256!: string;

  @IsOptional()
  @IsString()
  etag?: string;

  @ValidateNested()
  @Type(() => ConfirmDocumentDto)
  document!: ConfirmDocumentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmLinkDto)
  link?: ConfirmLinkDto;
}

import { IsString, IsOptional, IsUUID, Matches } from 'class-validator';

export class NewVersionDto {
  @IsUUID()
  uploadSessionId!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'sha256 must be 64 hex characters' })
  sha256!: string;

  @IsOptional()
  @IsString()
  etag?: string;
}

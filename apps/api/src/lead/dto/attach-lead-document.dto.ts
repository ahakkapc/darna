import { IsString, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';

export class AttachLeadDocumentDto {
  @IsUUID()
  documentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'Tag must contain only alphanumeric, dash, or underscore characters' })
  tag?: string;
}

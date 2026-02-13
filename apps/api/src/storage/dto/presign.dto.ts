import { IsString, IsInt, Min, Max } from 'class-validator';

export class PresignDto {
  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  sizeBytes!: number;

  @IsString()
  originalFilename!: string;
}

import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class CompleteCalendarEventDto {
  @IsEnum(['COMPLETED', 'NO_SHOW'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultNote?: string;
}

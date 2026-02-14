import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkLostDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lostReason?: string;
}

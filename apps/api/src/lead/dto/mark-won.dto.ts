import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkWonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  wonNote?: string;
}

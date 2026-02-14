import { IsOptional, IsString } from 'class-validator';

export class ReadAllDto {
  @IsOptional()
  @IsString()
  category?: string;
}

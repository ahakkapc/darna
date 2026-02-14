import { IsOptional, IsIn, IsString } from 'class-validator';

export class FocusQueryDto {
  @IsIn(['me', 'org', 'user'])
  scope!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

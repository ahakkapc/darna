import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateRelationDto {
  @IsEnum(['LISTING', 'PROGRAM', 'LOT', 'OTHER'])
  relationType!: 'LISTING' | 'PROGRAM' | 'LOT' | 'OTHER';

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

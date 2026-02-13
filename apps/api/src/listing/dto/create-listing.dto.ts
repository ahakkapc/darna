import { IsEnum, IsInt, IsOptional, IsString, IsBoolean, IsUUID, Length, Min } from 'class-validator';

export class CreateListingDto {
  @IsString()
  dealType!: string;

  @IsString()
  type!: string;

  @IsString()
  @Length(2, 80)
  wilaya!: string;

  @IsOptional()
  @IsString()
  commune?: string;

  @IsOptional()
  @IsString()
  quartier?: string;

  @IsOptional()
  @IsString()
  addressLine?: string;

  @IsString()
  @Length(10, 120)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  priceDa!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  surfaceM2?: number;

  @IsOptional()
  @IsInt()
  rooms?: number;

  @IsOptional()
  @IsInt()
  floor?: number;

  @IsOptional()
  @IsBoolean()
  hasElevator?: boolean;

  @IsOptional()
  @IsBoolean()
  hasParking?: boolean;

  @IsOptional()
  @IsBoolean()
  hasBalcony?: boolean;

  @IsOptional()
  @IsBoolean()
  furnished?: boolean;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

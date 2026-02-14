import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListLeadsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(['NEW', 'TO_CONTACT', 'VISIT_SCHEDULED', 'OFFER_IN_PROGRESS', 'WON', 'LOST'])
  status?: string;

  @IsOptional()
  @IsEnum(['BUYER', 'TENANT', 'SELLER', 'LANDLORD', 'INVESTOR'])
  type?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  priority?: string;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  nextActionBefore?: string;

  @IsOptional()
  @IsString()
  includeDeleted?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

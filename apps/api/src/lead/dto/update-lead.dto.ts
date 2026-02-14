import {
  IsString,
  IsOptional,
  IsEmail,
  MinLength,
  MaxLength,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  ArrayMaxSize,
  Matches,
  IsDateString,
  IsObject,
} from 'class-validator';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['BUYER', 'TENANT', 'SELLER', 'LANDLORD', 'INVESTOR'])
  type?: 'BUYER' | 'TENANT' | 'SELLER' | 'LANDLORD' | 'INVESTOR';

  @IsOptional()
  @IsEnum(['NEW', 'TO_CONTACT', 'VISIT_SCHEDULED', 'OFFER_IN_PROGRESS', 'WON', 'LOST'])
  status?: 'NEW' | 'TO_CONTACT' | 'VISIT_SCHEDULED' | 'OFFER_IN_PROGRESS' | 'WON' | 'LOST';

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  wilaya?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  commune?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  quartier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  propertyType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  surfaceMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_-]{1,20}$/, { each: true, message: 'Each tag must match ^[a-z0-9_-]{1,20}$' })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  nextActionAt?: string;
}

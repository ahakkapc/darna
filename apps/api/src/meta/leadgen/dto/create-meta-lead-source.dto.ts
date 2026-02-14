import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMetaLeadSourceDto {
  @IsUUID()
  integrationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  pageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  formId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  formName?: string;

  @IsOptional()
  @IsEnum(['ROUND_ROBIN', 'MANAGER_ASSIGN', 'NONE'])
  routingStrategy?: 'ROUND_ROBIN' | 'MANAGER_ASSIGN' | 'NONE';

  @IsOptional()
  @IsUUID()
  defaultOwnerUserId?: string;

  @IsOptional()
  @IsObject()
  fieldMappingJson?: Record<string, string>;
}

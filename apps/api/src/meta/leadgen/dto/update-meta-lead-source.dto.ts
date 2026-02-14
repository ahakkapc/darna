import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsObject,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class UpdateMetaLeadSourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  formName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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

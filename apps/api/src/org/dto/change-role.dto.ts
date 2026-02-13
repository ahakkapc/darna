import { IsEnum } from 'class-validator';
import { OrgRole } from '@prisma/client';

export class ChangeRoleDto {
  @IsEnum(OrgRole)
  role!: OrgRole;
}

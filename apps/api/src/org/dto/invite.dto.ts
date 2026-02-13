import { IsEmail, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { OrgRole } from '@prisma/client';

export class InviteDto {
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  email!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;
}

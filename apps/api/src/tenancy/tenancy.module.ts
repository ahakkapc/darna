import { Module } from '@nestjs/common';
import { OrgContextGuard } from './org-context.guard';
import { OrgRoleGuard } from './org-role.guard';

@Module({
  providers: [OrgContextGuard, OrgRoleGuard],
  exports: [OrgContextGuard, OrgRoleGuard],
})
export class TenancyModule {}

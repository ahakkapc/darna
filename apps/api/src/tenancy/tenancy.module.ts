import { Module } from '@nestjs/common';
import { OrgContextGuard } from './org-context.guard';

@Module({
  providers: [OrgContextGuard],
  exports: [OrgContextGuard],
})
export class TenancyModule {}

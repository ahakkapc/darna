import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformRoleGuard, PlatformRoles } from '../common/guards/platform-role.guard';
import { AuditService } from './audit.service';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles('PLATFORM_ADMIN')
export class AuditAdminController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query('orgId') orgId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.query({
      orgId,
      action,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

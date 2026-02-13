import { Controller, Get, Post, Param, Query, UseGuards, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformRoleGuard } from '../common/guards/platform-role.guard';
import { PlatformRoles } from '../common/guards/platform-role.guard';
import { JobsService } from './jobs.service';
import { AppError } from '../common/errors/app-error';

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles('PLATFORM_ADMIN')
export class JobsAdminController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('orgId') orgId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.findAll({
      type,
      status,
      orgId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.jobsService.findOne(id);
    if (!job) throw new AppError('NOT_FOUND', 404, 'Job not found');
    return job;
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.jobsService.retry(id);
    if (!job) throw new AppError('NOT_FOUND', 404, 'Job not found or not FAILED');
    return { ok: true, jobRunId: job.id };
  }

  @Post('run/storage-gc')
  @HttpCode(200)
  async runStorageGc(@Query('orgId') orgId?: string) {
    if (!orgId) throw new AppError('VALIDATION_ERROR', 400, 'orgId is required');
    const result = await this.jobsService.enqueue('STORAGE_GC', {
      organizationId: orgId,
      mode: 'LIGHT',
    }, { organizationId: orgId, idempotencyKey: `gc:${orgId}:${new Date().toISOString().slice(0, 10)}` });
    return { ok: true, ...result };
  }
}

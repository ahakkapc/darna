import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../tenancy/org-context.guard';
import { OrgRoleGuard } from '../../tenancy/org-role.guard';
import { OrgRoles } from '../../tenancy/org-roles.decorator';
import { OrgId } from '../../tenancy/org-context.decorator';
import { InboundEventsService } from './inbound-events.service';

@Controller('integrations/inbound-events')
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRoleGuard)
@OrgRoles('OWNER', 'MANAGER')
export class InboundEventsController {
  constructor(private readonly inboundService: InboundEventsService) {}

  @Get()
  async list(
    @OrgId() orgId: string,
    @Query('sourceType') sourceType?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.inboundService.findAll(orgId, {
      sourceType,
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { ok: true, data };
  }

  @Get(':id')
  async findOne(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.inboundService.findOne(orgId, id);
    return { ok: true, data: item };
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retry(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.inboundService.retry(orgId, id);
    return { ok: true, data: null };
  }
}

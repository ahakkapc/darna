import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgRoleGuard } from '../tenancy/org-role.guard';
import { OrgRoles } from '../tenancy/org-roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { OrgId } from '../tenancy/org-context.decorator';
import { IntegrationsService } from './integrations.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRoleGuard)
@OrgRoles('OWNER', 'MANAGER')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  async list(
    @OrgId() orgId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const items = await this.integrationsService.findAll(orgId, { type, status });
    return { ok: true, data: { items } };
  }

  @Post()
  async create(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateIntegrationDto,
  ) {
    const item = await this.integrationsService.create(orgId, user.userId, dto);
    return { ok: true, data: item };
  }

  @Get(':id')
  async findOne(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.integrationsService.findOne(orgId, id);
    return { ok: true, data: item };
  }

  @Patch(':id')
  async update(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntegrationDto,
  ) {
    const item = await this.integrationsService.update(orgId, id, user.userId, dto);
    return { ok: true, data: item };
  }

  @Post(':id/disable')
  async disable(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.integrationsService.disable(orgId, id, user.userId);
    return { ok: true, data: item };
  }

  @Post(':id/enable')
  async enable(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.integrationsService.enable(orgId, id, user.userId);
    return { ok: true, data: item };
  }

  @Post(':id/health-check')
  async healthCheck(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.integrationsService.triggerHealthCheck(orgId, id);
    return { ok: true, data: result };
  }
}

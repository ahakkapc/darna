import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../tenancy/org-context.guard';
import { OrgId } from '../../tenancy/org-context.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { OrgRoleType } from './activities.rbac';

@Controller('crm')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('leads/:leadId/activities')
  async list(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('type') type?: string | string[],
    @Query('includeDeleted') includeDeleted?: string,
    @Query('visibility') visibility?: string,
  ) {
    const role = await this.getUserRole(orgId, user.userId);
    const typeArr = type ? (Array.isArray(type) ? type : [type]) : undefined;

    const result = await this.activitiesService.list(orgId, leadId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor: cursor || undefined,
      type: typeArr,
      includeDeleted: includeDeleted === 'true',
      visibility: visibility || undefined,
      role,
    });

    return { ok: true, data: result };
  }

  @Post('leads/:leadId/activities')
  async create(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateActivityDto,
  ) {
    const role = await this.getUserRole(orgId, user.userId);
    const result = await this.activitiesService.create(orgId, leadId, user.userId, role, dto);
    return { ok: true, data: result };
  }

  @Patch('activities/:activityId')
  @HttpCode(200)
  async update(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    const role = await this.getUserRole(orgId, user.userId);
    const result = await this.activitiesService.update(orgId, activityId, user.userId, role, dto);
    return { ok: true, data: result };
  }

  @Delete('activities/:activityId')
  @HttpCode(200)
  async remove(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('activityId', ParseUUIDPipe) activityId: string,
  ) {
    const role = await this.getUserRole(orgId, user.userId);
    const result = await this.activitiesService.softDelete(orgId, activityId, user.userId, role);
    return { ok: true, data: result };
  }

  private async getUserRole(orgId: string, userId: string): Promise<OrgRoleType> {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return (membership?.role as OrgRoleType) ?? 'VIEWER';
  }
}

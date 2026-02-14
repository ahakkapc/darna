import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { OverviewQueryDto } from './dto/overview.query.dto';
import { CollaboratorsQueryDto } from './dto/collaborators.query.dto';
import { PipelineQueryDto } from './dto/pipeline.query.dto';
import { FocusQueryDto } from './dto/focus.query.dto';
import { PrismaService } from '../prisma/prisma.service';

type OrgRole = 'OWNER' | 'MANAGER' | 'AGENT' | 'VIEWER';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, OrgContextGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  private async getRole(orgId: string, userId: string): Promise<OrgRole> {
    const m = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return (m?.role as OrgRole) ?? 'VIEWER';
  }

  @Get('overview')
  async overview(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: OverviewQueryDto,
  ) {
    const role = await this.getRole(orgId, user.userId);
    const data = await this.dashboardService.getOverview(orgId, user.userId, role, query);
    return { ok: true, data };
  }

  @Get('collaborators')
  async collaborators(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CollaboratorsQueryDto,
  ) {
    const role = await this.getRole(orgId, user.userId);
    const data = await this.dashboardService.getCollaborators(orgId, role, query);
    return { ok: true, data };
  }

  @Get('pipeline')
  async pipeline(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: PipelineQueryDto,
  ) {
    const role = await this.getRole(orgId, user.userId);
    const data = await this.dashboardService.getPipeline(orgId, user.userId, role, query);
    return { ok: true, data };
  }

  @Get('focus')
  async focus(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FocusQueryDto,
  ) {
    const role = await this.getRole(orgId, user.userId);
    const data = await this.dashboardService.getFocus(orgId, user.userId, role, query);
    return { ok: true, data };
  }

  @Get('exports/leads.csv')
  async exportLeadsCsv(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: OverviewQueryDto,
    @Res() res: Response,
  ) {
    const role = await this.getRole(orgId, user.userId);
    const csv = await this.dashboardService.exportLeadsCsv(orgId, role, {
      ...query,
      callerUserId: user.userId,
    });

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${dateStr}.csv"`);
    res.send(csv);
  }
}

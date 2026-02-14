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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { PlanningService } from './planning.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CancelCalendarEventDto } from './dto/cancel-calendar-event.dto';
import { CompleteCalendarEventDto } from './dto/complete-calendar-event.dto';

@Controller('planning')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}

  // POST /api/planning/events
  @Post('events')
  async create(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCalendarEventDto,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.create(orgId, dto, user.userId, role);
    return { ok: true, data };
  }

  // GET /api/planning/events
  @Get('events')
  async findAll(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('assignee') assignee?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.findAll(orgId, user.userId, role, {
      from, to, assignee, type, status, includeDeleted,
    });
    return { ok: true, data };
  }

  // GET /api/planning/events/:id
  @Get('events/:id')
  async findOne(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.findOne(orgId, id, user.userId, role);
    return { ok: true, data };
  }

  // PATCH /api/planning/events/:id
  @Patch('events/:id')
  async update(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.update(orgId, id, dto, user.userId, role);
    return { ok: true, data };
  }

  // POST /api/planning/events/:id/cancel
  @Post('events/:id/cancel')
  @HttpCode(200)
  async cancel(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCalendarEventDto,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.cancel(orgId, id, dto, user.userId, role);
    return { ok: true, data };
  }

  // POST /api/planning/events/:id/complete
  @Post('events/:id/complete')
  @HttpCode(200)
  async complete(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCalendarEventDto,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.complete(orgId, id, dto, user.userId, role);
    return { ok: true, data };
  }

  // DELETE /api/planning/events/:id
  @Delete('events/:id')
  async remove(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.remove(orgId, id, user.userId, role);
    return { ok: true, data };
  }

  // GET /api/planning/leads/:leadId/events
  @Get('leads/:leadId/events')
  async findByLead(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('leadId') leadId: string,
  ) {
    const role = await this.planningService.getUserRole(orgId, user.userId);
    const data = await this.planningService.findByLead(orgId, leadId, user.userId, role);
    return { ok: true, data };
  }
}

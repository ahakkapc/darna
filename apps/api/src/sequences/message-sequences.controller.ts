import { Controller, Get, Post, Patch, Put, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { MessageSequencesService } from './message-sequences.service';

@Controller('sequences')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class MessageSequencesController {
  constructor(private readonly svc: MessageSequencesService) {}

  @Post()
  @HttpCode(201)
  async create(
    @OrgId() orgId: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: { name: string; description?: string; defaultStartDelayMinutes?: number; stopOnReply?: boolean },
  ) {
    const item = await this.svc.create(orgId, dto, user.userId);
    return { ok: true, data: item };
  }

  @Get()
  async findAll(@OrgId() orgId: string, @Query('status') status?: string) {
    const items = await this.svc.findAll(orgId, { status });
    return { ok: true, data: { items } };
  }

  @Get(':id')
  async findOne(@OrgId() orgId: string, @Param('id') id: string) {
    const item = await this.svc.findOne(orgId, id);
    return { ok: true, data: item };
  }

  @Patch(':id')
  async update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: { name?: string; description?: string; defaultStartDelayMinutes?: number; stopOnReply?: boolean },
  ) {
    const item = await this.svc.update(orgId, id, dto, user.userId);
    return { ok: true, data: item };
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@OrgId() orgId: string, @Param('id') id: string) {
    const item = await this.svc.activate(orgId, id);
    return { ok: true, data: item };
  }

  @Post(':id/pause')
  @HttpCode(200)
  async pause(@OrgId() orgId: string, @Param('id') id: string) {
    const item = await this.svc.pause(orgId, id);
    return { ok: true, data: item };
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@OrgId() orgId: string, @Param('id') id: string) {
    const item = await this.svc.archive(orgId, id);
    return { ok: true, data: item };
  }

  @Put(':id/steps')
  async replaceSteps(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() body: { steps: Array<{ orderIndex: number; channel: string; templateId: string; delayMinutes: number; conditions?: unknown[]; createTaskJson?: unknown; notifyJson?: unknown }> },
  ) {
    const item = await this.svc.replaceSteps(orgId, id, body.steps);
    return { ok: true, data: item };
  }
}

@Controller('crm/leads')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class SequenceRunsController {
  constructor(private readonly svc: MessageSequencesService) {}

  @Post(':leadId/sequences/start')
  @HttpCode(201)
  async startRun(
    @OrgId() orgId: string,
    @Param('leadId') leadId: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { sequenceId: string },
  ) {
    const run = await this.svc.startRun(orgId, leadId, body.sequenceId, user.userId);
    return { ok: true, data: run };
  }

  @Post(':leadId/sequences/stop')
  @HttpCode(200)
  async stopRun(
    @OrgId() orgId: string,
    @Param('leadId') leadId: string,
    @Body() body: { sequenceRunId: string },
  ) {
    await this.svc.stopRun(orgId, leadId, body.sequenceRunId);
    return { ok: true, data: null };
  }

  @Get(':leadId/sequences')
  async listRuns(@OrgId() orgId: string, @Param('leadId') leadId: string) {
    const items = await this.svc.listRuns(orgId, leadId);
    return { ok: true, data: { items } };
  }
}

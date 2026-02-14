import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { InboxService } from './inbox.service';
import { SendMessageDto } from './dto/send-message.dto';
import { AssignThreadDto } from './dto/assign-thread.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { LinkLeadDto } from './dto/link-lead.dto';
import { CreateLeadFromThreadDto } from './dto/create-lead-from-thread.dto';

@Controller('inbox/threads')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  async listThreads(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('assigned') assigned?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    const data = await this.inboxService.listThreads(orgId, user.userId, role, {
      status, assigned, q, cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { ok: true, data };
  }

  @Get(':id')
  async getThread(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    const data = await this.inboxService.getThread(orgId, id, user.userId, role);
    return { ok: true, data };
  }

  @Get(':id/messages')
  async getMessages(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    const data = await this.inboxService.getMessages(
      orgId, id, user.userId, role, cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
    return { ok: true, data };
  }

  @Post(':id/messages')
  async sendMessage(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    const data = await this.inboxService.sendMessage(orgId, id, dto.text, user.userId, role);
    return { ok: true, data };
  }

  @Post(':id/assign')
  @HttpCode(200)
  async assign(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignThreadDto,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    await this.inboxService.assign(orgId, id, dto.userId, user.userId, role);
    return { ok: true, data: null };
  }

  @Post(':id/claim')
  @HttpCode(200)
  async claim(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.inboxService.claim(orgId, id, user.userId);
    return { ok: true, data: null };
  }

  @Post(':id/mark-read')
  @HttpCode(200)
  async markRead(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    await this.inboxService.markRead(orgId, id, user.userId, role);
    return { ok: true, data: null };
  }

  @Post(':id/status')
  @HttpCode(200)
  async changeStatus(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    await this.inboxService.changeStatus(orgId, id, dto.status, user.userId, role);
    return { ok: true, data: null };
  }

  @Post(':id/link-lead')
  @HttpCode(200)
  async linkLead(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkLeadDto,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    await this.inboxService.linkLead(orgId, id, dto.leadId, user.userId, role);
    return { ok: true, data: null };
  }

  @Post(':id/create-lead')
  async createLead(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadFromThreadDto,
  ) {
    const role = await this.inboxService.getUserRole(orgId, user.userId);
    const lead = await this.inboxService.createLeadFromThread(orgId, id, dto, user.userId, role);
    return { ok: true, data: lead };
  }
}

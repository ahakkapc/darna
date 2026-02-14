import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { MessageTemplatesService } from './message-templates.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@Controller('templates/messages')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class MessageTemplatesController {
  constructor(private readonly svc: MessageTemplatesService) {}

  @Post()
  @HttpCode(201)
  async create(
    @OrgId() orgId: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateMessageTemplateDto,
  ) {
    const item = await this.svc.create(orgId, dto, user.userId);
    return { ok: true, data: item };
  }

  @Get()
  async findAll(
    @OrgId() orgId: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
  ) {
    const items = await this.svc.findAll(orgId, { channel, status });
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
    @Body() dto: UpdateMessageTemplateDto,
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

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@OrgId() orgId: string, @Param('id') id: string) {
    const item = await this.svc.archive(orgId, id);
    return { ok: true, data: item };
  }
}

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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { MarkLostDto } from './dto/mark-lost.dto';
import { MarkWonDto } from './dto/mark-won.dto';
import { CreateRelationDto } from './dto/create-relation.dto';
import { AttachLeadDocumentDto } from './dto/attach-lead-document.dto';

@Controller('crm/leads')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  create(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadService.create(orgId, dto, user.userId);
  }

  @Get()
  async findAll(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListLeadsDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.findAll(orgId, user.userId, role, {
      q: query.q,
      status: query.status,
      type: query.type,
      priority: query.priority,
      owner: query.owner,
      nextActionBefore: query.nextActionBefore,
      includeDeleted: query.includeDeleted === 'true',
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get(':id')
  async findOne(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.findOne(orgId, id, user.userId, role);
  }

  @Patch(':id')
  async update(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.update(orgId, id, dto, user.userId, role);
  }

  @Post(':id/assign')
  async assign(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeadDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.assign(orgId, id, dto, user.userId, role);
  }

  @Post(':id/mark-lost')
  async markLost(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkLostDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.markLost(orgId, id, dto, user.userId, role);
  }

  @Post(':id/mark-won')
  async markWon(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkWonDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.markWon(orgId, id, dto, user.userId, role);
  }

  @Delete(':id')
  async remove(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.remove(orgId, id, user.userId, role);
  }

  @Get(':id/relations')
  async getRelations(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.getRelations(orgId, id, user.userId, role);
  }

  @Post(':id/relations')
  async createRelation(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRelationDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.createRelation(orgId, id, dto, user.userId, role);
  }

  @Get(':id/documents')
  async getDocuments(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.getDocuments(orgId, id, user.userId, role);
  }

  @Post(':id/documents')
  async attachDocument(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachLeadDocumentDto,
  ) {
    const role = await this.leadService.getUserRole(orgId, user.userId);
    return this.leadService.attachDocument(
      orgId, id, dto.documentId, dto.tag, user.userId, role,
    );
  }
}

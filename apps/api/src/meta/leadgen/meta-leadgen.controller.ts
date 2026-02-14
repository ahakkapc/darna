import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../tenancy/org-context.guard';
import { OrgRoleGuard } from '../../tenancy/org-role.guard';
import { OrgRoles } from '../../tenancy/org-roles.decorator';
import { OrgId } from '../../tenancy/org-context.decorator';
import { MetaLeadgenService } from './meta-leadgen.service';
import { CreateMetaLeadSourceDto } from './dto/create-meta-lead-source.dto';
import { UpdateMetaLeadSourceDto } from './dto/update-meta-lead-source.dto';

@Controller('meta/leadgen/sources')
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRoleGuard)
@OrgRoles('OWNER', 'MANAGER')
export class MetaLeadgenController {
  constructor(private readonly service: MetaLeadgenService) {}

  @Get()
  async list(@OrgId() orgId: string) {
    const data = await this.service.listSources(orgId);
    return { ok: true, data };
  }

  @Post()
  async create(@OrgId() orgId: string, @Body() dto: CreateMetaLeadSourceDto) {
    const data = await this.service.createSource(orgId, dto);
    return { ok: true, data };
  }

  @Get(':id')
  async findOne(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.getSource(orgId, id);
    return { ok: true, data };
  }

  @Patch(':id')
  async update(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMetaLeadSourceDto,
  ) {
    const data = await this.service.updateSource(orgId, id, dto);
    return { ok: true, data };
  }

  @Post(':id/backfill')
  @HttpCode(200)
  async backfill(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.triggerBackfill(orgId, id);
  }
}

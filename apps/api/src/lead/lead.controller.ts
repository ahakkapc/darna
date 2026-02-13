import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Controller('leads')
@UseGuards(OrgContextGuard)
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  create(@OrgId() orgId: string, @Body() dto: CreateLeadDto) {
    return this.leadService.create(orgId, dto);
  }

  @Get()
  findAll(@OrgId() orgId: string) {
    return this.leadService.findAll(orgId);
  }

  @Get(':id')
  findOne(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadService.findOne(orgId, id);
  }

  @Patch(':id')
  update(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(orgId, id, dto);
  }

  @Delete(':id')
  remove(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leadService.remove(orgId, id);
  }
}

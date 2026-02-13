import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { ListingService } from './listing.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { TransferListingDto } from './dto/transfer-listing.dto';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';

@Controller('listings')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class ListingController {
  constructor(
    private readonly listingService: ListingService,
    private readonly prisma: PrismaService,
  ) {}

  private async getRole(req: Request) {
    const userId = (req as any).user.userId;
    const orgId = (req as any).orgId;
    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    if (!membership) throw new AppError('ORG_FORBIDDEN', 403, 'Not a member');
    return { userId, orgId, role: membership.role };
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateListingDto) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.create(orgId, userId, role, dto);
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('dealType') dealType?: string,
    @Query('wilaya') wilaya?: string,
    @Query('q') q?: string,
  ) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.findAll(orgId, userId, role, { scope, status, dealType, wilaya, q });
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.findOne(orgId, userId, role, id);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.update(orgId, userId, role, id, dto);
  }

  @Post(':id/publish')
  async publish(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.publish(orgId, userId, role, id);
  }

  @Post(':id/pause')
  async pause(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.pause(orgId, userId, role, id);
  }

  @Post(':id/transfer')
  async transfer(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferListingDto,
  ) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.transfer(orgId, userId, role, id, dto.ownerUserId);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const { userId, orgId, role } = await this.getRole(req);
    return this.listingService.softDelete(orgId, userId, role, id);
  }
}

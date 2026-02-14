import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { OrgService } from './org.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { InviteDto } from './dto/invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UpdateOrgProfileDto } from './dto/update-org-profile.dto';

@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrgDto) {
    return this.orgService.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.orgService.listForUser(user.userId);
  }

  @Post(':orgId/invite')
  invite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: InviteDto,
  ) {
    return this.orgService.invite(user.userId, orgId, dto);
  }

  @Post('invites/accept')
  @HttpCode(200)
  acceptInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.orgService.acceptInvite(user.userId, dto.token);
  }

  @Get(':orgId/members')
  listMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.orgService.listMembers(user.userId, orgId);
  }

  @Patch(':orgId/members/:userId')
  changeRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.orgService.changeRole(user.userId, orgId, userId, dto);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, OrgContextGuard)
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
    @Body() dto: UpdateOrgProfileDto,
  ) {
    const orgId = (req as any).orgId as string;
    return this.orgService.updateProfile(user.userId, orgId, dto);
  }
}

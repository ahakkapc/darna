import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformRoleGuard, PlatformRoles } from '../common/guards/platform-role.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { ModerationService } from './moderation.service';
import { AdminKycDecisionDto } from '../kyc/dto/admin-kyc-decision.dto';

@Controller('admin/moderation')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles('PLATFORM_ADMIN', 'PLATFORM_REVIEWER')
export class ModerationAdminController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('queue')
  getQueue(@Query('status') status?: string) {
    return this.moderationService.adminGetQueue(status);
  }

  @Post(':listingId/approve')
  approve(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.moderationService.adminApprove(listingId, user.userId);
  }

  @Post(':listingId/reject')
  reject(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AdminKycDecisionDto,
  ) {
    return this.moderationService.adminReject(listingId, user.userId, dto.reason);
  }
}

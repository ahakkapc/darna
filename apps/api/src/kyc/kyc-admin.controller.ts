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
import { KycService } from './kyc.service';
import { AdminKycDecisionDto } from './dto/admin-kyc-decision.dto';

@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles('PLATFORM_ADMIN', 'PLATFORM_REVIEWER')
export class KycAdminController {
  constructor(private readonly kycService: KycService) {}

  @Get('queue')
  getQueue(@Query('status') status?: string) {
    return this.kycService.adminGetQueue(status);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.kycService.adminGetById(id);
  }

  @Post(':id/verify')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.kycService.adminVerify(id, user.userId);
  }

  @Post(':id/needs-changes')
  needsChanges(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AdminKycDecisionDto,
  ) {
    return this.kycService.adminNeedsChanges(id, user.userId, dto.reason);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AdminKycDecisionDto,
  ) {
    return this.kycService.adminReject(id, user.userId, dto.reason);
  }
}

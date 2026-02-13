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
import { SubscriptionService } from './subscription.service';
import { AdminPaymentDecisionDto } from './dto/admin-payment-decision.dto';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@PlatformRoles('PLATFORM_ADMIN', 'PLATFORM_REVIEWER')
export class SubscriptionAdminController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('queue')
  getQueue(@Query('status') status?: string) {
    return this.subscriptionService.adminGetPaymentQueue(status);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.subscriptionService.adminConfirmPayment(id, user.userId);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AdminPaymentDecisionDto,
  ) {
    return this.subscriptionService.adminRejectPayment(id, user.userId, dto.reason);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { SubscriptionService } from './subscription.service';
import { ChoosePlanDto } from './dto/choose-plan.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  getMe(@Req() req: Request) {
    return this.subscriptionService.getMe((req as any).orgId);
  }

  @Post('choose-plan')
  choosePlan(@Req() req: Request, @Body() dto: ChoosePlanDto) {
    return this.subscriptionService.choosePlan((req as any).orgId, dto);
  }

  @Post(':id/payments/offline')
  submitPayment(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitPaymentDto,
  ) {
    return this.subscriptionService.submitOfflinePayment((req as any).orgId, id, dto);
  }
}

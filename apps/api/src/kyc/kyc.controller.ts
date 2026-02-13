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
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';

@Controller('kyc')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('me')
  getMe(@Req() req: Request) {
    return this.kycService.getMe((req as any).orgId);
  }

  @Post('submit')
  submit(@Req() req: Request, @Body() dto: SubmitKycDto) {
    return this.kycService.submit((req as any).orgId, dto);
  }

  @Post('resubmit')
  resubmit(@Req() req: Request, @Body() dto: SubmitKycDto) {
    return this.kycService.resubmit((req as any).orgId, dto);
  }
}

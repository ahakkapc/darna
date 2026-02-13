import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OnboardingService } from './onboarding.service';
import { CompleteStepDto } from './dto/complete-step.dto';
import { StepBackDto } from './dto/step-back.dto';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('me')
  getMe(@Req() req: Request) {
    return this.onboardingService.getMe((req as any).orgId);
  }

  @Post('start')
  start(@Req() req: Request) {
    return this.onboardingService.start((req as any).orgId);
  }

  @Post('step/complete')
  completeStep(@Req() req: Request, @Body() dto: CompleteStepDto) {
    return this.onboardingService.completeStep((req as any).orgId, dto.step);
  }

  @Post('step/back')
  stepBack(@Req() req: Request, @Body() dto: StepBackDto) {
    return this.onboardingService.stepBack((req as any).orgId, dto.to);
  }

  @Post('complete')
  complete(@Req() req: Request) {
    return this.onboardingService.complete((req as any).orgId);
  }
}

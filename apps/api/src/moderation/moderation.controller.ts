import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { ModerationService } from './moderation.service';

@Controller('listings')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post(':id/submit-for-review')
  submitForReview(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.moderationService.submitForReview((req as any).orgId, id);
  }

  @Get(':id/moderation')
  getModeration(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.moderationService.getModeration((req as any).orgId, id);
  }
}

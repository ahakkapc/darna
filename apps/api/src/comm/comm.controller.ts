import { Controller, Get, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgId } from '../tenancy/org-context.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CommHubService } from './comm-hub.service';

@Controller('comm')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class CommController {
  constructor(private readonly commHub: CommHubService) {}

  @Get('events')
  @HttpCode(200)
  async listEvents(
    @OrgId() orgId: string,
    @CurrentUser() user: { userId: string },
    @Query('leadId') leadId?: string,
    @Query('channel') channel?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.commHub.listEvents(orgId, {
      leadId,
      channel,
      direction,
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { ok: true, data: result };
  }

  @Get('events/:id')
  @HttpCode(200)
  async getEvent(
    @OrgId() orgId: string,
    @Param('id') id: string,
  ) {
    const event = await this.commHub.getEvent(orgId, id);
    if (!event) return { ok: true, data: null };
    return { ok: true, data: event };
  }
}

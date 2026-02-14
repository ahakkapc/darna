import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { OrgId } from '../tenancy/org-context.decorator';
import { NotificationService } from './notification.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ReadAllDto } from './dto/read-all.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
    @Query() query: ListNotificationsDto,
  ) {
    const data = await this.notificationService.list(orgId, user.userId, {
      unreadOnly: query.unreadOnly,
      category: query.category,
      limit: query.limit,
      cursor: query.cursor,
    });
    return { ok: true, data };
  }

  @Get('unread-count')
  async unreadCount(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
  ) {
    const count = await this.notificationService.unreadCount(orgId, user.userId);
    return { ok: true, data: { count } };
  }

  @Post(':id/read')
  async markRead(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificationService.markRead(orgId, user.userId, id);
    return { ok: true, data: null };
  }

  @Post('read-all')
  async markReadAll(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
    @Body() dto: ReadAllDto,
  ) {
    await this.notificationService.markReadAll(orgId, user.userId, dto.category);
    return { ok: true, data: null };
  }

  @Delete(':id')
  async softDelete(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificationService.softDelete(orgId, user.userId, id);
    return { ok: true, data: null };
  }
}

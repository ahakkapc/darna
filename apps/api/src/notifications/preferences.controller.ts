import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { OrgId } from '../tenancy/org-context.decorator';
import { NotificationService } from './notification.service';
import { UpdatePreferencesDto, VALID_CATEGORIES } from './dto/update-preferences.dto';
import { NOTIFICATION_PREF_INVALID_CATEGORY } from './notification.errors';

@Controller('me/notification-preferences')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class PreferencesController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getPreferences(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
  ) {
    const items = await this.notificationService.getPreferences(orgId, user.userId);
    return { ok: true, data: { items } };
  }

  @Patch()
  async updatePreference(
    @CurrentUser() user: CurrentUserPayload,
    @OrgId() orgId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    if (!(VALID_CATEGORIES as readonly string[]).includes(dto.category)) {
      throw NOTIFICATION_PREF_INVALID_CATEGORY();
    }

    await this.notificationService.updatePreference(orgId, user.userId, dto.category, {
      emailEnabled: dto.emailEnabled,
      whatsappEnabled: dto.whatsappEnabled,
    });
    return { ok: true, data: null };
  }
}

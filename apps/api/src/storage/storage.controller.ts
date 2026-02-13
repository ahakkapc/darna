import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { OrgId } from '../tenancy/org-context.decorator';
import { StorageService } from './storage.service';
import { PresignDto } from './dto/presign.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { NewVersionDto } from './dto/new-version.dto';

@Controller('storage')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload/presign')
  async presign(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PresignDto,
  ) {
    const data = await this.storageService.presign(orgId, user.userId, dto);
    return { ok: true, data };
  }

  @Post('upload/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmDto,
  ) {
    const data = await this.storageService.confirm(orgId, user.userId, dto);
    return { ok: true, data };
  }

  @Post('documents/:documentId/new-version')
  @HttpCode(HttpStatus.OK)
  async newVersion(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('documentId') documentId: string,
    @Body() dto: NewVersionDto,
  ) {
    const data = await this.storageService.newVersion(orgId, user.userId, documentId, dto);
    return { ok: true, data };
  }

  @Get('documents/:documentId')
  async getDocument(
    @OrgId() orgId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.storageService.getDocument(orgId, documentId);
    return { ok: true, data };
  }

  @Get('documents/:documentId/download')
  async download(
    @OrgId() orgId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.storageService.download(orgId, documentId);
    return { ok: true, data };
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.OK)
  async deleteDocument(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.storageService.softDelete(orgId, user.userId, documentId, (user as any).orgRole ?? 'OWNER');
    return data;
  }
}

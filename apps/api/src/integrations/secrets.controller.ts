import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../tenancy/org-context.guard';
import { OrgRoleGuard } from '../tenancy/org-role.guard';
import { OrgRoles } from '../tenancy/org-roles.decorator';
import { OrgId } from '../tenancy/org-context.decorator';
import { SecretsService } from './secrets.service';
import { PutSecretDto } from './dto/put-secret.dto';

@Controller('integrations/:integrationId/secrets')
@UseGuards(JwtAuthGuard, OrgContextGuard, OrgRoleGuard)
@OrgRoles('OWNER', 'MANAGER')
export class SecretsController {
  constructor(private readonly secretsService: SecretsService) {}

  @Get()
  async listKeys(
    @OrgId() orgId: string,
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
  ) {
    const items = await this.secretsService.listKeys(orgId, integrationId);
    return { ok: true, data: { items } };
  }

  @Put(':key')
  @HttpCode(200)
  async putSecret(
    @OrgId() orgId: string,
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @Param('key') key: string,
    @Body() dto: PutSecretDto,
  ) {
    await this.secretsService.putSecret(orgId, integrationId, key, dto.value);
    return { ok: true, data: null };
  }

  @Delete(':key')
  @HttpCode(200)
  async deleteSecret(
    @OrgId() orgId: string,
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @Param('key') key: string,
  ) {
    await this.secretsService.deleteSecret(orgId, integrationId, key);
    return { ok: true, data: null };
  }
}

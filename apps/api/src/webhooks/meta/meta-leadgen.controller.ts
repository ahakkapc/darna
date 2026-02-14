import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  RawBodyRequest,
  Logger,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretsService } from '../../integrations/secrets.service';
import { InboundEventsService } from '../../integrations/inbound/inbound-events.service';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard';
import {
  verifyMetaSignature,
  isReplayAttack,
  maskWebhookPayload,
  WEBHOOK_SIGNATURE_MISSING,
  WEBHOOK_SIGNATURE_INVALID,
  WEBHOOK_REPLAY_DETECTED,
} from '../webhook-security';

@Controller('webhooks/meta/leadgen')
export class MetaLeadgenWebhookController {
  private readonly logger = new Logger('MetaLeadgenWebhook');

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly inboundService: InboundEventsService,
  ) {}

  // ─── GET handshake ──────────────────────────────────────
  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      return res.status(403).send('WEBHOOK_VERIFY_FAILED');
    }

    const integrations = await (this.prisma as any).integration.findMany({
      where: { type: 'META_LEADGEN', status: 'ACTIVE' },
      select: { id: true, organizationId: true },
    });

    for (const integ of integrations) {
      try {
        const storedToken = await this.secretsService.getDecrypted(
          integ.organizationId,
          integ.id,
          'verify_token',
        );
        if (storedToken && storedToken === verifyToken) {
          this.logger.log(`Webhook verified for integration ${integ.id}`);
          return res.status(200).type('text/plain').send(challenge);
        }
      } catch {
        // continue to next integration
      }
    }

    this.logger.warn('Webhook verify failed — no matching verify_token');
    return res.status(403).send('WEBHOOK_VERIFY_FAILED');
  }

  // ─── POST webhook ───────────────────────────────────────
  @Post()
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 100, windowSeconds: 60, keyFn: (req) => `webhook:meta:${req.ip}` })
  async receive(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody;

    // Body size limit (1MB)
    if (rawBody && rawBody.length > 1024 * 1024) {
      this.logger.warn('Meta webhook body too large', { size: rawBody.length });
      return { received: true }; // Silently accept per Meta spec
    }

    if (!rawBody) {
      this.logger.warn('No raw body available');
      return { received: true };
    }

    // Signature is now MANDATORY
    if (!signature) {
      this.logger.warn('Meta webhook missing signature - REJECTED');
      throw WEBHOOK_SIGNATURE_MISSING();
    }

    const body = JSON.parse(rawBody.toString('utf-8'));
    
    // Safe logging (mask PII)
    this.logger.debug('Meta webhook received', { payload: maskWebhookPayload(body) });

    const entries: Array<{ id: string; changes: any[] }> = body?.entry ?? [];

    for (const entry of entries) {
      const pageId = entry.id;
      const changes = entry.changes ?? [];

      for (const change of changes) {
        if (change.field !== 'leadgen') continue;
        const value = change.value;
        if (!value?.leadgen_id) continue;

        const leadgenId = String(value.leadgen_id);
        const formId = value.form_id ? String(value.form_id) : undefined;
        const createdTime = value.created_time;

        // Anti-replay check
        if (isReplayAttack(leadgenId, 'META_LEADGEN')) {
          this.logger.warn('Meta webhook replay detected', { leadgenId });
          continue; // Skip duplicate, don't fail the whole batch
        }

        await this.processLeadgenEvent(pageId, leadgenId, formId, createdTime, signature, rawBody);
      }
    }

    return { received: true };
  }

  private async processLeadgenEvent(
    pageId: string,
    leadgenId: string,
    formId: string | undefined,
    createdTime: number | undefined,
    signature: string | undefined,
    rawBody: Buffer,
  ): Promise<void> {
    // Resolve MetaLeadSource by pageId + formId
    let source: any = null;

    if (formId) {
      source = await (this.prisma as any).metaLeadSource.findFirst({
        where: { pageId, formId, isActive: true },
        include: { integration: { select: { id: true, organizationId: true, status: true } } },
      });
    }

    if (!source && pageId) {
      const sources = await (this.prisma as any).metaLeadSource.findMany({
        where: { pageId, isActive: true },
        include: { integration: { select: { id: true, organizationId: true, status: true } } },
      });
      if (sources.length === 1) {
        source = sources[0];
      } else {
        this.logger.warn(`Cannot resolve unique source for pageId=${pageId}, leadgenId=${leadgenId} (${sources.length} matches)`);
        return;
      }
    }

    if (!source || source.integration.status !== 'ACTIVE') {
      this.logger.warn(`No active source for pageId=${pageId}, leadgenId=${leadgenId}`);
      return;
    }

    const orgId = source.integration.organizationId;
    const integrationId = source.integration.id;

    // Validate signature - MANDATORY
    try {
      const appSecret = await this.secretsService.getDecrypted(orgId, integrationId, 'app_secret');
      if (!appSecret) {
        this.logger.error(`No app_secret configured for integration ${integrationId}`);
        return;
      }
      if (!verifyMetaSignature(rawBody, signature, appSecret)) {
        this.logger.warn(`Signature mismatch for leadgenId=${leadgenId}`, { integrationId });
        return;
      }
    } catch (err) {
      this.logger.error(`Signature validation error for integration ${integrationId}`, (err as Error).message);
      return;
    }

    // Create InboundEvent (idempotent by externalId)
    const leadgenIdHash = createHmac('sha256', 'pii-salt').update(leadgenId).digest('hex').slice(0, 16);
    try {
      const result = await this.inboundService.createEvent({
        orgId,
        sourceType: 'META_LEADGEN',
        provider: 'META_CLOUD',
        integrationId,
        externalId: leadgenId,
        payload: {
          pageId,
          formId: formId ?? null,
          created_time: createdTime ?? null,
          leadgenIdHash,
        },
        metaJson: { metaLeadSourceId: source.id },
      });

      if (result.duplicate) {
        this.logger.log(`Duplicate leadgen event: ${leadgenId}`);
      } else {
        this.logger.log(`Created inbound event ${result.id} for leadgenId=${leadgenId}`);
      }
    } catch (err) {
      this.logger.error(`Failed to create inbound event for leadgenId=${leadgenId}`, (err as Error).stack);
    }
  }
}

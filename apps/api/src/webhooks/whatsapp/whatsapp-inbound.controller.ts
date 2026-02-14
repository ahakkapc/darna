import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  Query,
  Logger,
  HttpCode,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SecretsService } from '../../integrations/secrets.service';
import { InboundEventsService } from '../../integrations/inbound/inbound-events.service';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard';
import {
  verifyWhatsAppSignature,
  isReplayAttack,
  maskWebhookPayload,
  WEBHOOK_SIGNATURE_MISSING,
  WEBHOOK_SIGNATURE_INVALID,
} from '../webhook-security';

@Controller('webhooks/whatsapp')
export class WhatsAppInboundController {
  private readonly logger = new Logger('WhatsAppInboundController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
    private readonly inboundEventsService: InboundEventsService,
  ) {}

  // ─── GET challenge verification ───────────────────────────
  @Get('inbound')
  async verifyChallenge(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      return res.status(403).send('WEBHOOK_VERIFY_FAILED');
    }

    // Find integration with matching verify_token
    const integrations = await this.prisma.integration.findMany({
      where: { type: 'WHATSAPP_PROVIDER', status: 'ACTIVE' },
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
          this.logger.log(`WhatsApp webhook verified for integration ${integ.id}`);
          return res.status(200).type('text/plain').send(challenge);
        }
      } catch {
        // continue to next integration
      }
    }

    this.logger.warn('WhatsApp webhook verify failed — no matching verify_token');
    return res.status(403).send('WEBHOOK_VERIFY_FAILED');
  }

  @Post('inbound')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 100, windowSeconds: 60, keyFn: (req) => `webhook:whatsapp:${req.ip}` })
  async handleInbound(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody;

    // Body size limit (1MB)
    if (rawBody && rawBody.length > 1024 * 1024) {
      this.logger.warn('WhatsApp webhook body too large', { size: rawBody.length });
      return res.status(200).json({ received: true });
    }

    // Signature is MANDATORY
    if (!signature) {
      this.logger.warn('WhatsApp webhook missing signature - REJECTED');
      throw WEBHOOK_SIGNATURE_MISSING();
    }

    const body = rawBody ? JSON.parse(rawBody.toString('utf-8')) : req.body;

    // Safe logging (mask PII)
    this.logger.debug('WhatsApp webhook received', { payload: maskWebhookPayload(body) });

    // Extract integration ID from body or WhatsApp Cloud API structure
    const integrationId = body.integrationId ?? this.extractIntegrationIdFromPayload(body);

    if (!integrationId) {
      this.logger.warn('WhatsApp inbound: missing integrationId');
      return res.status(400).json({ error: { code: 'MISSING_INTEGRATION_ID', message: 'integrationId required' } });
    }

    const integration = await this.prisma.integration.findFirst({
      where: {
        id: integrationId,
        type: 'WHATSAPP_PROVIDER',
        status: 'ACTIVE',
      },
    });

    if (!integration) {
      this.logger.warn('WhatsApp inbound: integration not found', { integrationId });
      return res.status(404).json({ error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' } });
    }

    const orgId = integration.organizationId;

    // Verify signature against app_secret
    try {
      const appSecret = await this.secretsService.getDecrypted(orgId, integration.id, 'app_secret');
      if (!appSecret) {
        this.logger.error(`No app_secret configured for integration ${integration.id}`);
        return res.status(401).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook not configured' } });
      }
      if (rawBody && !verifyWhatsAppSignature(rawBody, signature, appSecret)) {
        this.logger.warn('WhatsApp signature mismatch', { integrationId });
        throw WEBHOOK_SIGNATURE_INVALID();
      }
    } catch (err) {
      if ((err as any).code === 'WEBHOOK_SIGNATURE_INVALID') throw err;
      this.logger.error(`Signature validation error for integration ${integration.id}`, (err as Error).message);
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal error' } });
    }

    const providerMessageId = body.providerMessageId ?? body.MessageSid ?? body.messageId ?? this.extractMessageId(body);

    // Anti-replay check
    if (providerMessageId && isReplayAttack(providerMessageId, 'WHATSAPP')) {
      this.logger.warn('WhatsApp webhook replay detected', { providerMessageId });
      return res.status(200).json({ ok: true, data: { duplicate: true } });
    }

    try {
      const result = await this.inboundEventsService.createEvent({
        orgId,
        sourceType: 'WHATSAPP_INBOUND',
        provider: integration.provider as string,
        integrationId: integration.id,
        externalId: providerMessageId ?? undefined,
        payload: {
          fromPhoneE164: body.fromPhoneE164 ?? body.From ?? this.extractFromPhone(body),
          providerMessageId,
          text: body.text ?? body.Body ?? this.extractMessageText(body),
          timestamp: body.timestamp ?? new Date().toISOString(),
          integrationId: integration.id,
          displayName: body.displayName ?? body.ProfileName ?? null,
        },
      });

      this.logger.log('WhatsApp inbound event created', {
        eventId: result.id,
        duplicate: result.duplicate,
        orgId,
      });

      return res.status(200).json({ ok: true, data: { eventId: result.id, duplicate: result.duplicate } });
    } catch (e: any) {
      this.logger.error('WhatsApp inbound error', e);
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal error' } });
    }
  }

  // Helper to extract from WhatsApp Cloud API payload structure
  private extractIntegrationIdFromPayload(body: any): string | undefined {
    // WhatsApp Cloud API structure: entry[].changes[].value.metadata.phone_number_id
    // We store phone_number_id as external reference in integration
    const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    if (phoneNumberId) {
      // This would require a lookup by phoneNumberId - for now return undefined
      // In production, we'd have a mapping table or store it in integration config
    }
    return undefined;
  }

  private extractMessageId(body: any): string | undefined {
    return body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
  }

  private extractFromPhone(body: any): string | undefined {
    return body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  }

  private extractMessageText(body: any): string {
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    return message?.text?.body ?? message?.button?.text ?? '';
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { NotificationService } from '../notifications/notification.service';
import {
  InboundProcessorRegistry,
  InboundProcessor,
  InboundProcessResult,
} from '../integrations/runtime/inbound-processor.registry';
import { InboxService } from './inbox.service';
import { CommHubService } from '../comm/comm-hub.service';

@Injectable()
export class WhatsAppInboundProcessor implements InboundProcessor, OnModuleInit {
  private readonly logger = new Logger('WhatsAppInboundProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: InboundProcessorRegistry,
    private readonly notificationService: NotificationService,
    private readonly inboxService: InboxService,
    private readonly commHub: CommHubService,
  ) {}

  onModuleInit() {
    this.registry.register('WHATSAPP_INBOUND', this);
  }

  async process(ctx: { orgId: string; integrationId?: string }, event: any): Promise<InboundProcessResult> {
    const payload = event.payloadJson ?? {};
    const orgId = ctx.orgId;

    const fromPhone: string = payload.fromPhoneE164 ?? '';
    const providerMessageId: string = payload.providerMessageId ?? '';
    const text: string = payload.text ?? '';
    const displayName: string | null = payload.displayName ?? null;
    const integrationId: string | null = ctx.integrationId ?? payload.integrationId ?? null;

    if (!fromPhone) {
      return { success: false, errorCode: 'MISSING_PHONE', errorMsg: 'No fromPhoneE164 in payload' };
    }

    const phoneHash = InboxService.phoneHash(orgId, fromPhone);

    try {
      await withOrg(this.prisma, orgId, async (tx) => {
        // 1. Find or create thread
        let thread: any = await (tx as any).inboxThread.findFirst({
          where: {
            phoneHash,
            channel: 'WHATSAPP',
            ...(integrationId ? { integrationId } : {}),
          },
        });

        if (!thread) {
          thread = await (tx as any).inboxThread.create({
            data: {
              organizationId: orgId,
              channel: 'WHATSAPP',
              phoneHash,
              phoneE164: fromPhone,
              displayName,
              integrationId,
              status: 'OPEN',
              lastMessageAt: new Date(),
              lastMessagePreview: text.slice(0, 140),
              lastMessageBy: 'CUSTOMER',
              unreplied: true,
              unrepliedSince: new Date(),
            },
          });
        }

        // 2. Idempotence: check providerMessageId
        if (providerMessageId) {
          const existing = await (tx as any).inboxMessage.findFirst({
            where: { providerMessageId },
          });
          if (existing) {
            this.logger.debug(`Duplicate message: ${providerMessageId}`);
            return;
          }
        }

        // 3. Create message
        const message = await (tx as any).inboxMessage.create({
          data: {
            organizationId: orgId,
            threadId: thread.id,
            direction: 'INBOUND',
            status: 'RECEIVED',
            providerMessageId: providerMessageId || null,
            bodyText: text,
            occurredAt: new Date(),
          },
        });

        // 4. Update thread
        const updateData: any = {
          lastMessageAt: new Date(),
          lastMessagePreview: text.slice(0, 140),
          lastMessageBy: 'CUSTOMER',
          unreplied: true,
        };

        if (!thread.unrepliedSince) {
          updateData.unrepliedSince = new Date();
        }

        if (thread.assignedToUserId) {
          updateData.unreadCount = (thread.unreadCount ?? 0) + 1;
        }

        if (displayName && !thread.displayName) {
          updateData.displayName = displayName;
        }

        // Re-open if CLOSED
        if (thread.status === 'CLOSED') {
          updateData.status = 'OPEN';
        }

        await (tx as any).inboxThread.update({
          where: { id: thread.id },
          data: updateData,
        });

        // 5. CRM sync via CommHub: create CommEvent + LeadActivity if thread has lead
        if (thread.leadId) {
          this.commHub.recordInboundWhatsApp({
            organizationId: orgId,
            leadId: thread.leadId,
            inboundEventId: event.id ?? undefined,
            inboxThreadId: thread.id,
            inboxMessageId: message.id,
            providerMessageId: providerMessageId || `inbox:in:${message.id}`,
            occurredAt: new Date(),
            preview: text.slice(0, 140),
            metaJson: { integrationId, phoneHash },
          }).catch((e: any) => this.logger.warn('CommHub inbound failed', e));

          // 5b. Opt-out detection
          const OPT_OUT_RE = /^(stop|arret|arrêt|désabonner|desabonner|ne plus me contacter)\b/i;
          if (OPT_OUT_RE.test(text.trim())) {
            this.commHub.setOptOut(orgId, thread.leadId, 'WHATSAPP', 'USER_REQUEST_STOP')
              .catch((e: any) => this.logger.warn('Opt-out failed', e));
          }
        }

        // 6. Notifications
        if (thread.assignedToUserId) {
          this.notificationService.notifyUsers({
            organizationId: orgId,
            userIds: [thread.assignedToUserId],
            templateKey: 'inbox.new.message',
            meta: {
              threadId: thread.id,
              displayName: thread.displayName ?? 'Unknown',
              preview: text.slice(0, 80),
            },
          }).catch(() => {});
        } else {
          // Notify managers about unassigned thread
          const managers = await this.prisma.orgMembership.findMany({
            where: { orgId, role: { in: ['OWNER', 'MANAGER'] } },
            select: { userId: true },
          });
          const managerIds = managers.map((m) => m.userId);
          if (managerIds.length > 0) {
            this.notificationService.notifyUsers({
              organizationId: orgId,
              userIds: managerIds,
              templateKey: 'inbox.new.message',
              meta: {
                threadId: thread.id,
                displayName: thread.displayName ?? 'Unknown',
                preview: text.slice(0, 80),
                unassigned: true,
              },
            }).catch(() => {});
          }
        }
      });

      return { success: true };
    } catch (e: any) {
      this.logger.error('WhatsApp inbound processing failed', e);
      return {
        success: false,
        errorCode: 'PROCESSING_FAILED',
        errorMsg: e.message?.slice(0, 200),
        retriable: true,
      };
    }
  }
}

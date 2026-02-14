import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';

@Injectable()
export class LeadActivityBridgeService {
  private readonly logger = new Logger('LeadActivityBridgeService');

  constructor(private readonly prisma: PrismaService) {}

  async createFromCommEvent(
    orgId: string,
    commEvent: {
      id: string;
      channel: string;
      direction: string;
      status: string;
      leadId: string;
      preview?: string | null;
      inboxThreadId?: string | null;
      inboxMessageId?: string | null;
      providerMessageId?: string | null;
    },
    userId?: string | null,
  ): Promise<void> {
    const activityType =
      commEvent.direction === 'INBOUND' ? 'WHATSAPP_INBOUND' : 'WHATSAPP_SENT';
    const title =
      commEvent.direction === 'INBOUND' ? 'WhatsApp reçu' : 'WhatsApp envoyé';

    try {
      const existing = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).leadActivity.findFirst({
          where: {
            leadId: commEvent.leadId,
            payloadJson: { path: ['commEventId'], equals: commEvent.id },
          },
          select: { id: true },
        }),
      );
      if (existing) return;

      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).leadActivity.create({
          data: {
            organizationId: orgId,
            leadId: commEvent.leadId,
            type: activityType,
            direction: commEvent.direction,
            title,
            body: commEvent.preview?.slice(0, 140) ?? null,
            createdByUserId: userId ?? null,
            happenedAt: new Date(),
            payloadJson: {
              commEventId: commEvent.id,
              channel: commEvent.channel,
              direction: commEvent.direction,
              status: commEvent.status,
              threadId: commEvent.inboxThreadId ?? null,
              inboxMessageId: commEvent.inboxMessageId ?? null,
              providerMessageId: commEvent.providerMessageId ?? null,
            },
          },
        }),
      );
    } catch (e: any) {
      this.logger.warn('Failed to create LeadActivity from CommEvent', {
        commEventId: commEvent.id,
        error: e.message?.slice(0, 200),
      });
    }
  }

  async createOptOutActivity(
    orgId: string,
    leadId: string,
    channel: string,
    reason: string,
  ): Promise<void> {
    try {
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).leadActivity.create({
          data: {
            organizationId: orgId,
            leadId,
            type: 'OPT_OUT',
            title: `Opt-out ${channel}`,
            body: reason,
            happenedAt: new Date(),
            payloadJson: { channel, reason },
          },
        }),
      );
    } catch (e: any) {
      this.logger.warn('Failed to create OPT_OUT activity', { error: e.message?.slice(0, 200) });
    }
  }

  async updateActivityStatus(
    orgId: string,
    commEventId: string,
    newStatus: string,
  ): Promise<void> {
    try {
      const activity: any = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).leadActivity.findFirst({
          where: {
            payloadJson: { path: ['commEventId'], equals: commEventId },
          },
          select: { id: true, payloadJson: true },
        }),
      );
      if (!activity) return;

      const payload = (activity.payloadJson as Record<string, unknown>) ?? {};
      payload.status = newStatus;

      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).leadActivity.update({
          where: { id: activity.id },
          data: { payloadJson: payload },
        }),
      );
    } catch (e: any) {
      this.logger.warn('Failed to update LeadActivity status', {
        commEventId,
        error: e.message?.slice(0, 200),
      });
    }
  }
}

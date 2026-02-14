import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { JobsService } from '../jobs/jobs.service';
import { LeadActivityBridgeService } from './lead-activity-bridge.service';

export interface RecordInboundInput {
  organizationId: string;
  leadId: string;
  inboundEventId?: string;
  inboxThreadId?: string;
  inboxMessageId?: string;
  providerMessageId: string;
  occurredAt?: Date;
  preview?: string;
  metaJson?: Record<string, unknown>;
}

export interface RecordOutboundQueuedInput {
  organizationId: string;
  leadId: string;
  outboundJobId: string;
  inboxThreadId?: string;
  inboxMessageId?: string;
  dedupeKey: string;
  preview?: string;
  metaJson?: Record<string, unknown>;
}

export interface BackfillInput {
  organizationId: string;
  threadId: string;
  leadId: string;
  userId?: string;
}

const BACKFILL_SYNC_LIMIT = 200;

@Injectable()
export class CommHubService {
  private readonly logger = new Logger('CommHubService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: LeadActivityBridgeService,
    private readonly jobsService: JobsService,
  ) {}

  /* ─── Record inbound WhatsApp ─────────────────────── */

  async recordInboundWhatsApp(input: RecordInboundInput): Promise<string> {
    const orgId = input.organizationId;

    const commEvent: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).commEvent.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          direction: 'INBOUND',
          status: 'RECEIVED',
          occurredAt: input.occurredAt ?? new Date(),
          leadId: input.leadId,
          inboundEventId: input.inboundEventId ?? null,
          inboxThreadId: input.inboxThreadId ?? null,
          inboxMessageId: input.inboxMessageId ?? null,
          providerMessageId: input.providerMessageId,
          preview: input.preview?.slice(0, 140) ?? null,
          metaJson: (input.metaJson as Prisma.InputJsonValue) ?? undefined,
        },
      }),
    );

    this.bridge
      .createFromCommEvent(orgId, commEvent)
      .catch((e) => this.logger.warn('Bridge inbound failed', { error: e.message }));

    return commEvent.id;
  }

  /* ─── Record outbound queued ──────────────────────── */

  async recordOutboundQueued(input: RecordOutboundQueuedInput): Promise<string> {
    const orgId = input.organizationId;

    const commEvent: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).commEvent.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          status: 'QUEUED',
          occurredAt: new Date(),
          leadId: input.leadId,
          outboundJobId: input.outboundJobId,
          inboxThreadId: input.inboxThreadId ?? null,
          inboxMessageId: input.inboxMessageId ?? null,
          dedupeKey: input.dedupeKey,
          preview: input.preview?.slice(0, 140) ?? null,
          metaJson: (input.metaJson as Prisma.InputJsonValue) ?? undefined,
        },
      }),
    );

    this.bridge
      .createFromCommEvent(orgId, commEvent)
      .catch((e) => this.logger.warn('Bridge outbound failed', { error: e.message }));

    return commEvent.id;
  }

  /* ─── Update outbound status by job ───────────────── */

  async updateOutboundStatusByJob(
    orgId: string,
    outboundJobId: string,
    newStatus: string,
    providerMessageId?: string,
    errorCode?: string,
    errorMsg?: string,
  ): Promise<void> {
    const commEvent: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).commEvent.findFirst({ where: { outboundJobId } }),
    );

    if (!commEvent) return;

    const updateData: Record<string, unknown> = { status: newStatus };

    if (providerMessageId && !commEvent.providerMessageId) {
      updateData.providerMessageId = providerMessageId;
    }

    if (errorCode || errorMsg) {
      const meta = (commEvent.metaJson as Record<string, unknown>) ?? {};
      meta.lastErrorCode = errorCode;
      meta.lastErrorMsg = errorMsg?.slice(0, 500);
      updateData.metaJson = meta;
    }

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).commEvent.update({
        where: { id: commEvent.id },
        data: updateData,
      }),
    );

    this.bridge
      .updateActivityStatus(orgId, commEvent.id, newStatus)
      .catch((e) => this.logger.warn('Bridge status update failed', { error: e.message }));

    if (commEvent.inboxMessageId) {
      this.updateInboxMessageStatus(orgId, commEvent.inboxMessageId, newStatus).catch((e) =>
        this.logger.warn('InboxMessage status update failed', { error: e.message }),
      );
    }
  }

  /* ─── Backfill on link-lead ───────────────────────── */

  async backfillThread(input: BackfillInput): Promise<void> {
    const { organizationId, threadId, leadId, userId } = input;

    const count = (await withOrg(this.prisma, organizationId, (tx) =>
      (tx as any).inboxMessage.count({ where: { threadId } }),
    )) as number;

    if (count > BACKFILL_SYNC_LIMIT) {
      await this.jobsService.enqueue(
        'COMM_BACKFILL_THREAD',
        { organizationId, threadId, leadId, userId },
        { idempotencyKey: `comm-backfill:${threadId}`, organizationId },
      );
      this.logger.log(`Backfill enqueued as job threadId=${threadId} count=${count}`);
      return;
    }

    await this.backfillThreadSync(organizationId, threadId, leadId, userId);
  }

  async backfillThreadSync(
    orgId: string,
    threadId: string,
    leadId: string,
    userId?: string,
  ): Promise<void> {
    const messages: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxMessage.findMany({
        where: { threadId },
        orderBy: { occurredAt: 'asc' },
        take: 500,
      }),
    );

    for (const msg of messages) {
      try {
        const direction: string = msg.direction;
        const isInbound = direction === 'INBOUND';

        const providerMsgId = isInbound ? (msg.providerMessageId ?? null) : null;
        const dedupeKey = isInbound
          ? (msg.providerMessageId ? null : `inbox:in:${msg.id}`)
          : `inbox:out:${msg.id}`;

        const commEvent: any = await withOrg(this.prisma, orgId, (tx) =>
          (tx as any).commEvent.create({
            data: {
              organizationId: orgId,
              channel: 'WHATSAPP',
              direction: isInbound ? 'INBOUND' : 'OUTBOUND',
              status: isInbound ? 'RECEIVED' : (msg.status ?? 'SENT'),
              occurredAt: msg.occurredAt ?? new Date(),
              leadId,
              inboxThreadId: threadId,
              inboxMessageId: msg.id,
              providerMessageId: providerMsgId,
              dedupeKey,
              preview: msg.bodyText?.slice(0, 140) ?? null,
            },
          }),
        );

        await this.bridge.createFromCommEvent(
          orgId,
          commEvent,
          msg.createdByUserId ?? userId,
        );
      } catch (e: any) {
        if (e?.code === 'P2002') continue;
        this.logger.warn('Backfill message failed', {
          messageId: msg.id,
          error: e.message?.slice(0, 200),
        });
      }
    }
  }

  /* ─── Opt-out helpers ─────────────────────────────── */

  async checkOptOut(orgId: string, leadId: string, channel: string): Promise<boolean> {
    const lead: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).lead.findFirst({
        where: { id: leadId, recordStatus: 'ACTIVE' },
        select: { doNotContact: true, doNotContactChannelsJson: true },
      }),
    );
    if (!lead) return false;
    if (lead.doNotContact) return true;
    const channels = lead.doNotContactChannelsJson as Record<string, boolean> | null;
    if (channels && channels[channel.toLowerCase()] === true) return true;
    return false;
  }

  async setOptOut(
    orgId: string,
    leadId: string,
    channel: string,
    reason: string,
  ): Promise<void> {
    const lead: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).lead.findFirst({
        where: { id: leadId, recordStatus: 'ACTIVE' },
        select: { doNotContactChannelsJson: true },
      }),
    );
    if (!lead) return;

    const channels = (lead.doNotContactChannelsJson as Record<string, boolean>) ?? {};
    channels[channel.toLowerCase()] = true;

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).lead.update({
        where: { id: leadId },
        data: {
          doNotContact: true,
          doNotContactChannelsJson: channels,
          doNotContactReason: reason,
          doNotContactAt: new Date(),
        },
      }),
    );

    this.bridge
      .createOptOutActivity(orgId, leadId, channel, reason)
      .catch((e) => this.logger.warn('Opt-out activity failed', { error: e.message }));
  }

  /* ─── List events (monitoring) ────────────────────── */

  async listEvents(
    orgId: string,
    filters?: {
      leadId?: string;
      channel?: string;
      direction?: string;
      status?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = Math.min(filters?.limit ?? 20, 100);
    const where: Record<string, unknown> = {};

    if (filters?.leadId) where.leadId = filters.leadId;
    if (filters?.channel) where.channel = filters.channel;
    if (filters?.direction) where.direction = filters.direction;
    if (filters?.status) where.status = filters.status;

    let cursorObj: any;
    if (filters?.cursor) {
      try {
        cursorObj = JSON.parse(Buffer.from(filters.cursor, 'base64').toString());
      } catch {}
    }

    const items: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).commEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit + 1,
        ...(cursorObj ? { cursor: { id: cursorObj.id }, skip: 1 } : {}),
      }),
    );

    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ id: page[page.length - 1].id })).toString('base64')
      : null;

    return { items: page, page: { limit, hasMore, nextCursor } };
  }

  async getEvent(orgId: string, eventId: string) {
    const event: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).commEvent.findFirst({ where: { id: eventId } }),
    );
    return event ?? null;
  }

  /* ─── Internal helpers ────────────────────────────── */

  private async updateInboxMessageStatus(
    orgId: string,
    inboxMessageId: string,
    newStatus: string,
  ): Promise<void> {
    const statusMap: Record<string, string> = {
      SENT: 'SENT',
      DELIVERED: 'DELIVERED',
      FAILED: 'FAILED',
    };
    const mapped = statusMap[newStatus];
    if (!mapped) return;

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxMessage.update({
        where: { id: inboxMessageId },
        data: { status: mapped },
      }),
    );
  }
}

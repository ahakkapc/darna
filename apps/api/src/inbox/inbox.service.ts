import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { OutboundJobsService } from '../integrations/outbound/outbound-jobs.service';
import { NotificationService } from '../notifications/notification.service';
import { ActivitiesService } from '../crm/activities/activities.service';
import {
  INBOX_THREAD_NOT_FOUND,
  INBOX_ACCESS_DENIED,
  INBOX_THREAD_ALREADY_ASSIGNED,
  INBOX_THREAD_CLOSED,
  INBOX_INVALID_STATUS,
} from './inbox.errors';
import { CommHubService } from '../comm/comm-hub.service';
import { LEAD_OPTED_OUT_CHANNEL } from '../comm/comm.errors';

@Injectable()
export class InboxService {
  private readonly logger = new Logger('InboxService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundJobsService: OutboundJobsService,
    private readonly notificationService: NotificationService,
    private readonly activitiesService: ActivitiesService,
    private readonly commHub: CommHubService,
  ) {}

  /* ─── Role resolution ────────────────────────────────── */

  async getUserRole(orgId: string, userId: string): Promise<string> {
    const m = await this.prisma.orgMembership.findFirst({
      where: { orgId, userId },
      select: { role: true },
    });
    return m?.role ?? 'VIEWER';
  }

  /* ─── RBAC helpers ──────────────────────────────────── */

  private buildVisibilityWhere(role: string, userId: string): Record<string, unknown> {
    if (role === 'OWNER' || role === 'MANAGER') return {};
    return { assignedToUserId: userId };
  }

  private canViewThread(role: string, userId: string, thread: any): boolean {
    if (role === 'OWNER' || role === 'MANAGER') return true;
    return thread.assignedToUserId === userId;
  }

  /* ─── List threads ──────────────────────────────────── */

  async listThreads(
    orgId: string,
    userId: string,
    role: string,
    filters?: {
      status?: string;
      assigned?: string;
      q?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = Math.min(filters?.limit ?? 20, 100);
    const where: any = { ...this.buildVisibilityWhere(role, userId) };

    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters?.assigned === 'me') {
      where.assignedToUserId = userId;
    } else if (filters?.assigned === 'unassigned') {
      where.assignedToUserId = null;
    }

    if (filters?.q) {
      where.OR = [
        { displayName: { contains: filters.q, mode: 'insensitive' } },
        { phoneHash: { contains: filters.q } },
      ];
    }

    let cursorObj: any;
    if (filters?.cursor) {
      try { cursorObj = JSON.parse(Buffer.from(filters.cursor, 'base64').toString()); } catch {}
    }

    const items: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
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

  /* ─── Get thread detail ─────────────────────────────── */

  async getThread(orgId: string, threadId: string, userId: string, role: string) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();

    const messages: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxMessage.findMany({
        where: { threadId },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
    );

    let leadSummary = null;
    if (thread.leadId) {
      const lead: any = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).lead.findFirst({
          where: { id: thread.leadId, recordStatus: 'ACTIVE' },
          select: { id: true, fullName: true, status: true, ownerUserId: true, phone: true },
        }),
      );
      if (lead) leadSummary = lead;
    }

    return { thread, messages: messages.reverse(), leadSummary };
  }

  /* ─── Get thread messages (cursor paginated) ────────── */

  async getMessages(orgId: string, threadId: string, userId: string, role: string, cursor?: string, limit?: number) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();

    const take = Math.min(limit ?? 50, 100);
    let cursorObj: any;
    if (cursor) {
      try { cursorObj = JSON.parse(Buffer.from(cursor, 'base64').toString()); } catch {}
    }

    const items: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxMessage.findMany({
        where: { threadId },
        orderBy: { occurredAt: 'desc' },
        take: take + 1,
        ...(cursorObj ? { cursor: { id: cursorObj.id }, skip: 1 } : {}),
      }),
    );

    const hasMore = items.length > take;
    const page = items.slice(0, take);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ id: page[page.length - 1].id })).toString('base64')
      : null;

    return { items: page.reverse(), page: { limit: take, hasMore, nextCursor } };
  }

  /* ─── Assign (manager) ──────────────────────────────── */

  async assign(orgId: string, threadId: string, targetUserId: string, actorUserId: string, role: string) {
    if (role !== 'OWNER' && role !== 'MANAGER') throw INBOX_ACCESS_DENIED();

    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (thread.assignedToUserId) throw INBOX_THREAD_ALREADY_ASSIGNED();

    const membership = await this.prisma.orgMembership.findFirst({
      where: { orgId, userId: targetUserId },
    });
    if (!membership) throw INBOX_ACCESS_DENIED();

    await withOrg(this.prisma, orgId, async (tx) => {
      await (tx as any).inboxThread.update({
        where: { id: threadId },
        data: { assignedToUserId: targetUserId, assignedAt: new Date() },
      });
      await (tx as any).inboxThreadActivity.create({
        data: {
          organizationId: orgId,
          threadId,
          type: 'ASSIGNED',
          payloadJson: { userId: targetUserId, by: actorUserId },
          createdByUserId: actorUserId,
        },
      });
    });

    this.notificationService.notifyUsers({
      organizationId: orgId,
      userIds: [targetUserId],
      templateKey: 'inbox.thread.assigned',
      meta: { threadId, displayName: thread.displayName ?? 'Unknown' },
    }).catch(() => {});
  }

  /* ─── Claim (collab self-assign) ────────────────────── */

  async claim(orgId: string, threadId: string, userId: string) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (thread.assignedToUserId) throw INBOX_THREAD_ALREADY_ASSIGNED();

    await withOrg(this.prisma, orgId, async (tx) => {
      await (tx as any).inboxThread.update({
        where: { id: threadId },
        data: { assignedToUserId: userId, assignedAt: new Date() },
      });
      await (tx as any).inboxThreadActivity.create({
        data: {
          organizationId: orgId,
          threadId,
          type: 'ASSIGNED',
          payloadJson: { userId, selfClaim: true },
          createdByUserId: userId,
        },
      });
    });
  }

  /* ─── Mark read ─────────────────────────────────────── */

  async markRead(orgId: string, threadId: string, userId: string, role: string) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.update({
        where: { id: threadId },
        data: { lastReadAt: new Date(), unreadCount: 0 },
      }),
    );
  }

  /* ─── Change status ─────────────────────────────────── */

  async changeStatus(orgId: string, threadId: string, newStatus: string, userId: string, role: string) {
    if (!['OPEN', 'PENDING', 'CLOSED'].includes(newStatus)) throw INBOX_INVALID_STATUS();

    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();

    const oldStatus = thread.status;
    await withOrg(this.prisma, orgId, async (tx) => {
      const updateData: any = { status: newStatus };
      if (newStatus === 'CLOSED') {
        updateData.unreplied = false;
        updateData.unrepliedSince = null;
      }
      await (tx as any).inboxThread.update({ where: { id: threadId }, data: updateData });
      await (tx as any).inboxThreadActivity.create({
        data: {
          organizationId: orgId,
          threadId,
          type: 'STATUS_CHANGED',
          payloadJson: { from: oldStatus, to: newStatus },
          createdByUserId: userId,
        },
      });
    });
  }

  /* ─── Link lead ─────────────────────────────────────── */

  async linkLead(orgId: string, threadId: string, leadId: string, userId: string, role: string) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();

    const lead: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).lead.findFirst({ where: { id: leadId, recordStatus: 'ACTIVE' } }),
    );
    if (!lead) throw INBOX_THREAD_NOT_FOUND();

    await withOrg(this.prisma, orgId, async (tx) => {
      await (tx as any).inboxThread.update({ where: { id: threadId }, data: { leadId } });
      await (tx as any).inboxThreadActivity.create({
        data: {
          organizationId: orgId,
          threadId,
          type: 'LEAD_LINKED',
          payloadJson: { leadId },
          createdByUserId: userId,
        },
      });
    });

    this.commHub.backfillThread({
      organizationId: orgId, threadId, leadId, userId,
    }).catch((e) => this.logger.error('CommHub backfill failed', e));
  }

  /* ─── Create lead from thread ───────────────────────── */

  async createLeadFromThread(
    orgId: string,
    threadId: string,
    data: { fullName: string; email?: string },
    userId: string,
    role: string,
  ) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();

    const ownerUserId = thread.assignedToUserId ?? userId;

    const lead: any = await withOrg(this.prisma, orgId, async (tx) => {
      const created = await (tx as any).lead.create({
        data: {
          organizationId: orgId,
          fullName: data.fullName,
          email: data.email ?? null,
          phone: thread.phoneE164 ?? null,
          sourceType: 'WHATSAPP_INBOX',
          ownerUserId,
          createdByUserId: userId,
        },
      });

      await (tx as any).inboxThread.update({ where: { id: threadId }, data: { leadId: created.id } });
      await (tx as any).inboxThreadActivity.create({
        data: {
          organizationId: orgId,
          threadId,
          type: 'LEAD_LINKED',
          payloadJson: { leadId: created.id, created: true },
          createdByUserId: userId,
        },
      });

      return created;
    });

    this.commHub.backfillThread({
      organizationId: orgId, threadId, leadId: lead.id, userId,
    }).catch((e) => this.logger.error('CommHub backfill failed', e));

    return lead;
  }

  /* ─── Send message ──────────────────────────────────── */

  async sendMessage(orgId: string, threadId: string, text: string, userId: string, role: string) {
    const thread: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxThread.findFirst({ where: { id: threadId } }),
    );
    if (!thread) throw INBOX_THREAD_NOT_FOUND();
    if (!this.canViewThread(role, userId, thread)) throw INBOX_THREAD_NOT_FOUND();
    if (thread.status === 'CLOSED') throw INBOX_THREAD_CLOSED();

    // Opt-out enforcement
    if (thread.leadId) {
      const optedOut = await this.commHub.checkOptOut(orgId, thread.leadId, 'whatsapp');
      if (optedOut) throw LEAD_OPTED_OUT_CHANNEL();
    }

    const message: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxMessage.create({
        data: {
          organizationId: orgId,
          threadId,
          direction: 'OUTBOUND',
          status: 'QUEUED',
          bodyText: text,
          createdByUserId: userId,
          occurredAt: new Date(),
        },
      }),
    );

    const dedupeKey = `wa:thread:${threadId}:msg:${message.id}`;
    const jobResult = await this.outboundJobsService.createJob({
      orgId,
      type: 'WHATSAPP_MESSAGE',
      provider: 'TWILIO',
      integrationId: thread.integrationId ?? undefined,
      dedupeKey,
      payload: {
        threadId,
        messageId: message.id,
        toPhone: thread.phoneE164,
        text,
      },
    });

    // Record in CommHub if thread has lead
    if (thread.leadId) {
      this.commHub.recordOutboundQueued({
        organizationId: orgId,
        leadId: thread.leadId,
        outboundJobId: jobResult.id,
        inboxThreadId: threadId,
        inboxMessageId: message.id,
        dedupeKey,
        preview: text.slice(0, 140),
      }).catch((e) => this.logger.warn('CommHub outbound record failed', e));
    }

    return { message, jobId: jobResult.id };
  }

  /* ─── CRM Sync: create LeadActivity for inbox message ─ */

  async createMessageActivity(
    orgId: string,
    leadId: string,
    messageId: string,
    direction: 'INBOUND' | 'OUTBOUND',
    preview: string,
    threadId: string,
    userId?: string,
  ) {
    try {
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).leadActivity.create({
          data: {
            organizationId: orgId,
            leadId,
            type: direction === 'INBOUND' ? 'SMS' : 'SMS',
            direction: direction,
            title: direction === 'INBOUND' ? 'WhatsApp reçu' : 'WhatsApp envoyé',
            body: preview.slice(0, 140),
            createdByUserId: userId ?? null,
            happenedAt: new Date(),
            payloadJson: { threadId, messageId, channel: 'WHATSAPP' },
          },
        }),
      );
    } catch (e) {
      this.logger.warn('Failed to create message activity', e);
    }
  }

  /* ─── Backfill activities when lead is linked ───────── */

  async backfillActivities(orgId: string, threadId: string, leadId: string, userId: string) {
    const messages: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboxMessage.findMany({
        where: { threadId },
        orderBy: { occurredAt: 'asc' },
        take: 200,
      }),
    );

    for (const msg of messages) {
      await this.createMessageActivity(
        orgId,
        leadId,
        msg.id,
        msg.direction,
        msg.bodyText ?? '',
        threadId,
        msg.createdByUserId ?? userId,
      );
    }
  }

  /* ─── Hash helper ───────────────────────────────────── */

  static phoneHash(orgId: string, phone: string): string {
    const normalized = phone.replace(/[^0-9+]/g, '');
    return createHash('sha256').update(`${orgId}:${normalized}`).digest('hex');
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { AppError } from '../common/errors/app-error';
import { JobsService } from '../jobs/jobs.service';
import { renderTemplate, getTemplateDefinition } from './templates';
import {
  VALID_CATEGORIES,
  NotificationCategory,
} from './dto/update-preferences.dto';
import {
  NOTIFICATION_NOT_FOUND,
  FEATURE_NOT_AVAILABLE,
  PHONE_NOT_VERIFIED,
} from './notification.errors';

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  category: NotificationCategory;
  templateKey: string;
  meta: Record<string, unknown>;
  linkUrlOverride?: string;
  priorityOverride?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  dedupeWindowSec?: number;
}

export interface NotifyUsersInput {
  organizationId: string;
  userIds: string[];
  templateKey: string;
  meta?: Record<string, unknown>;
  overrides?: {
    title?: string;
    body?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    linkUrl?: string;
    channels?: ('IN_APP' | 'EMAIL' | 'WHATSAPP')[];
    category?: string;
  };
  dedupe?: { key: string; windowSeconds: number };
}

export interface CursorPage<T> {
  items: T[];
  page: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async notifyUsers(input: NotifyUsersInput): Promise<{ created: number; skipped: number; notificationIds: string[] }> {
    const def = getTemplateDefinition(input.templateKey);
    if (!def) {
      this.logger.warn(`notifyUsers: unknown template ${input.templateKey}`);
      return { created: 0, skipped: 0, notificationIds: [] };
    }

    const category = (input.overrides?.category ?? def.category) as NotificationCategory;
    const meta = input.meta ?? {};
    const dedupeWindowSec = input.dedupe?.windowSeconds ?? def.dedupeWindowSeconds;

    let created = 0;
    let skipped = 0;
    const notificationIds: string[] = [];

    for (const userId of input.userIds) {
      const result = await this.createNotification({
        orgId: input.organizationId,
        userId,
        category,
        templateKey: input.templateKey,
        meta,
        linkUrlOverride: input.overrides?.linkUrl,
        priorityOverride: input.overrides?.priority,
        dedupeWindowSec,
      });

      if (result.deduplicated) {
        skipped++;
      } else {
        created++;
        notificationIds.push(result.id);
      }
    }

    return { created, skipped, notificationIds };
  }

  async createNotification(input: CreateNotificationInput): Promise<{ id: string; deduplicated: boolean }> {
    const {
      orgId,
      userId,
      category,
      templateKey,
      meta,
      linkUrlOverride,
      priorityOverride,
      dedupeWindowSec = 600,
    } = input;

    const rendered = renderTemplate(templateKey, { orgId, userId, meta });
    if (!rendered) {
      this.logger.warn(`Unknown template key: ${templateKey}`);
      return { id: '', deduplicated: false };
    }

    const title = rendered.title;
    const body = rendered.body ?? null;
    const linkUrl = linkUrlOverride ?? rendered.linkUrl ?? null;
    const priority = priorityOverride ?? rendered.priority ?? 'NORMAL';

    const dedupeKey = this.computeDedupeKey(templateKey, category, meta, userId);

    return withOrg(this.prisma, orgId, async (tx) => {
      if (dedupeKey) {
        const windowStart = new Date(Date.now() - dedupeWindowSec * 1000);
        const existing = await tx.notification.findFirst({
          where: {
            organizationId: orgId,
            userId,
            dedupeKey,
            createdAt: { gte: windowStart },
            recordStatus: 'ACTIVE',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          return { id: existing.id, deduplicated: true };
        }
      }

      const prefs = await this.resolvePreferences(tx, orgId, userId, category);

      const safeMetaJson = this.sanitizeMeta(meta);

      const notification = await tx.notification.create({
        data: {
          organizationId: orgId,
          userId,
          category,
          priority: priority as any,
          templateKey,
          title,
          body,
          linkUrl,
          metaJson: safeMetaJson as any,
          dedupeKey,
          dedupeWindowSec,
        },
      });

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true },
      });

      const dispatchPayload = safeMetaJson as any;

      if (prefs.emailEnabled && user?.email) {
        const emailDedupeKey = dedupeKey
          ? createHash('sha256').update(`${dedupeKey}:EMAIL`).digest('hex')
          : undefined;
        const dispatch = await tx.notificationDispatch.create({
          data: {
            organizationId: orgId,
            notificationId: notification.id,
            channel: 'EMAIL',
            state: 'PENDING',
            to: user.email,
            templateKey,
            payloadJson: dispatchPayload,
            dedupeKey: emailDedupeKey,
          },
        });
        this.jobsService
          .enqueue('NOTIFY_EMAIL', {
            organizationId: orgId,
            dispatchId: dispatch.id,
          }, {
            idempotencyKey: `email:${dispatch.id}`,
            organizationId: orgId,
          })
          .catch((err) => this.logger.error(`Failed to enqueue NOTIFY_EMAIL: ${err.message}`));
      }

      if (prefs.whatsappEnabled && user?.phone) {
        const waDedupeKey = dedupeKey
          ? createHash('sha256').update(`${dedupeKey}:WHATSAPP`).digest('hex')
          : undefined;
        const dispatch = await tx.notificationDispatch.create({
          data: {
            organizationId: orgId,
            notificationId: notification.id,
            channel: 'WHATSAPP',
            state: 'PENDING',
            to: user.phone,
            templateKey,
            payloadJson: dispatchPayload,
            dedupeKey: waDedupeKey,
          },
        });
        this.jobsService
          .enqueue('NOTIFY_WHATSAPP', {
            organizationId: orgId,
            dispatchId: dispatch.id,
          }, {
            idempotencyKey: `whatsapp:${dispatch.id}`,
            organizationId: orgId,
          })
          .catch((err) => this.logger.error(`Failed to enqueue NOTIFY_WHATSAPP: ${err.message}`));
      }

      return { id: notification.id, deduplicated: false };
    });
  }

  async list(
    orgId: string,
    userId: string,
    opts: {
      unreadOnly?: boolean;
      category?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<CursorPage<any>> {
    const limit = Math.min(opts.limit ?? 20, 50);

    const where: any = {
      organizationId: orgId,
      userId,
      recordStatus: 'ACTIVE',
    };

    if (opts.unreadOnly) {
      where.readAt = null;
    }
    if (opts.category) {
      where.category = opts.category;
    }

    let cursorFilter: any = undefined;
    if (opts.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(opts.cursor, 'base64').toString('utf-8'));
        cursorFilter = {
          OR: [
            { createdAt: { lt: new Date(decoded.createdAt) } },
            {
              createdAt: new Date(decoded.createdAt),
              id: { lt: decoded.id },
            },
          ],
        };
      } catch {
        throw new AppError('INVALID_CURSOR', 400, 'Invalid cursor');
      }
    }

    const finalWhere = cursorFilter ? { AND: [where, cursorFilter] } : where;

    const items = await withOrg(this.prisma, orgId, (tx) =>
      tx.notification.findMany({
        where: finalWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
    );

    const hasMore = items.length > limit;
    const page = items.slice(0, limit);

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
      ).toString('base64');
    }

    return {
      items: page.map((n) => this.toDto(n)),
      page: {
        limit,
        cursor: opts.cursor ?? null,
        nextCursor,
        hasMore,
      },
    };
  }

  async markRead(orgId: string, userId: string, notificationId: string) {
    const result = await withOrg(this.prisma, orgId, async (tx) => {
      const notif = await tx.notification.findFirst({
        where: {
          id: notificationId,
          organizationId: orgId,
          userId,
          recordStatus: 'ACTIVE',
        },
      });
      if (!notif) return null;
      if (notif.readAt) return notif;
      return tx.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
    });
    if (!result) throw NOTIFICATION_NOT_FOUND();
    return { ok: true };
  }

  async markReadAll(orgId: string, userId: string, category?: string) {
    await withOrg(this.prisma, orgId, (tx) => {
      const where: any = {
        organizationId: orgId,
        userId,
        recordStatus: 'ACTIVE',
        readAt: null,
      };
      if (category) where.category = category;
      return tx.notification.updateMany({
        where,
        data: { readAt: new Date() },
      });
    });
    return { ok: true };
  }

  async softDelete(orgId: string, userId: string, notificationId: string) {
    const result = await withOrg(this.prisma, orgId, async (tx) => {
      const notif = await tx.notification.findFirst({
        where: {
          id: notificationId,
          organizationId: orgId,
          userId,
          recordStatus: 'ACTIVE',
        },
      });
      if (!notif) return null;
      return tx.notification.update({
        where: { id: notificationId },
        data: {
          recordStatus: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      });
    });
    if (!result) throw NOTIFICATION_NOT_FOUND();
    return { ok: true };
  }

  async getPreferences(orgId: string, userId: string) {
    const prefs = await withOrg(this.prisma, orgId, (tx) =>
      tx.notificationPreference.findMany({
        where: { organizationId: orgId, userId },
        orderBy: { category: 'asc' },
      }),
    );

    const prefMap = new Map(prefs.map((p) => [p.category, p]));
    return VALID_CATEGORIES.map((cat) => {
      const p = prefMap.get(cat);
      return {
        category: cat,
        inAppEnabled: p?.inAppEnabled ?? true,
        emailEnabled: p?.emailEnabled ?? false,
        whatsappEnabled: p?.whatsappEnabled ?? false,
      };
    });
  }

  async updatePreference(
    orgId: string,
    userId: string,
    category: string,
    data: { emailEnabled?: boolean; whatsappEnabled?: boolean },
  ) {
    if (data.whatsappEnabled === true) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, phoneVerifiedAt: true },
      });
      if (!user?.phone || !user.phoneVerifiedAt) {
        throw PHONE_NOT_VERIFIED();
      }
    }

    return withOrg(this.prisma, orgId, (tx) =>
      tx.notificationPreference.upsert({
        where: {
          organizationId_userId_category: {
            organizationId: orgId,
            userId,
            category,
          },
        },
        create: {
          organizationId: orgId,
          userId,
          category,
          inAppEnabled: true,
          emailEnabled: data.emailEnabled ?? false,
          whatsappEnabled: data.whatsappEnabled ?? false,
        },
        update: {
          ...(data.emailEnabled !== undefined && { emailEnabled: data.emailEnabled }),
          ...(data.whatsappEnabled !== undefined && { whatsappEnabled: data.whatsappEnabled }),
        },
      }),
    );
  }

  async unreadCount(orgId: string, userId: string): Promise<number> {
    return withOrg(this.prisma, orgId, (tx) =>
      tx.notification.count({
        where: {
          organizationId: orgId,
          userId,
          recordStatus: 'ACTIVE',
          readAt: null,
        },
      }),
    );
  }

  private computeDedupeKey(
    templateKey: string,
    category: string,
    meta: Record<string, unknown>,
    userId: string,
  ): string {
    const stableIds = Object.entries(meta)
      .filter(([k]) => k.endsWith('Id'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => String(v))
      .join(':');

    const raw = `${templateKey}:${category}:${stableIds}:${userId}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  private sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (
        typeof value === 'string' &&
        (key.toLowerCase().includes('email') ||
          key.toLowerCase().includes('phone') ||
          key.toLowerCase().includes('password'))
      ) {
        continue;
      }
      safe[key] = value;
    }
    return safe;
  }

  private async resolvePreferences(
    tx: any,
    orgId: string,
    userId: string,
    category: string,
  ) {
    const pref = await tx.notificationPreference.findUnique({
      where: {
        organizationId_userId_category: {
          organizationId: orgId,
          userId,
          category,
        },
      },
    });

    if (pref) {
      return {
        inAppEnabled: pref.inAppEnabled,
        emailEnabled: pref.emailEnabled,
        whatsappEnabled: pref.whatsappEnabled,
      };
    }

    await tx.notificationPreference.create({
      data: {
        organizationId: orgId,
        userId,
        category,
        inAppEnabled: true,
        emailEnabled: false,
        whatsappEnabled: false,
      },
    });

    return { inAppEnabled: true, emailEnabled: false, whatsappEnabled: false };
  }

  private toDto(n: any) {
    return {
      id: n.id,
      category: n.category,
      priority: n.priority,
      templateKey: n.templateKey,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }
}

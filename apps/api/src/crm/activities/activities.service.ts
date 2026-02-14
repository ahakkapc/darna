import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { withOrg } from '../../tenancy/with-org';
import { AppError } from '../../common/errors/app-error';
import { validatePayloadByType } from './activities.validation';
import {
  OrgRoleType,
  canCreateActivityType,
  assertCanUpdate,
  assertCanDelete,
} from './activities.rbac';
import { toActivityDto, ActivityDto } from './activities.mapper';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

export interface CursorPage {
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger('ActivitiesService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    orgId: string,
    leadId: string,
    params: {
      limit?: number;
      cursor?: string;
      type?: string[];
      includeDeleted?: boolean;
      visibility?: string;
      role: OrgRoleType;
    },
  ): Promise<{ items: ActivityDto[]; page: CursorPage }> {
    await this.assertLeadExists(orgId, leadId);

    const limit = Math.min(50, Math.max(1, params.limit ?? 20));

    const where: Record<string, unknown> = { leadId };
    if (params.type && params.type.length > 0) {
      where.type = { in: params.type };
    }
    if (!params.includeDeleted || (params.role !== 'OWNER' && params.role !== 'MANAGER')) {
      where.recordStatus = 'ACTIVE';
    }
    if (params.visibility) {
      where.visibility = params.visibility;
    }
    if (params.role === 'VIEWER') {
      where.visibility = 'INTERNAL';
    }

    let cursorFilter: Record<string, unknown> | undefined;
    if (params.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(params.cursor, 'base64').toString('utf-8'));
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
        throw new AppError('VALIDATION_ERROR', 400, 'Invalid cursor');
      }
    }

    const finalWhere = cursorFilter ? { AND: [where, cursorFilter] } : where;

    const rows: any[] = await withOrg(this.prisma, orgId, (tx) =>
      tx.leadActivity.findMany({
        where: finalWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
    ) as any[];

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
      ).toString('base64');
    }

    return {
      items: items.map(toActivityDto),
      page: {
        limit,
        cursor: params.cursor ?? null,
        nextCursor,
        hasMore,
      },
    };
  }

  async create(
    orgId: string,
    leadId: string,
    userId: string,
    role: OrgRoleType,
    dto: CreateActivityDto,
  ): Promise<{ id: string }> {
    if (dto.type === 'SYSTEM_EVENT' as any) {
      throw new AppError('ACTIVITY_TYPE_FORBIDDEN', 403, 'SYSTEM_EVENT cannot be created via API');
    }

    if (!canCreateActivityType(role, dto.type)) {
      throw new AppError('ACTIVITY_TYPE_FORBIDDEN', 403, `Role ${role} cannot create ${dto.type} activities`);
    }

    validatePayloadByType(dto.type, dto.body, dto.direction, dto.payload);

    const activity = await withOrg(this.prisma, orgId, async (tx) => {
      await this.assertLeadExistsTx(tx, leadId);
      return tx.leadActivity.create({
        data: {
          organizationId: orgId,
          leadId,
          type: dto.type,
          visibility: dto.visibility ?? 'INTERNAL',
          createdByUserId: userId,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : null,
          plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null,
          direction: dto.direction ?? null,
          title: dto.title ?? null,
          body: dto.body ?? null,
          payloadJson: dto.payload ? (dto.payload as any) : undefined,
          relatedDocumentId: dto.relatedDocumentId ?? null,
        },
      });
    });

    this.audit.log({
      orgId,
      userId,
      actorRole: 'ORG',
      action: 'LEAD_ACTIVITY_CREATED',
      targetType: 'LEAD_ACTIVITY',
      targetId: activity.id,
      metaJson: { leadId, type: dto.type },
    }).catch(() => {});

    return { id: activity.id };
  }

  async update(
    orgId: string,
    activityId: string,
    userId: string,
    role: OrgRoleType,
    dto: UpdateActivityDto,
  ): Promise<{ updated: boolean }> {
    const activity = await withOrg(this.prisma, orgId, (tx) =>
      tx.leadActivity.findUnique({ where: { id: activityId } }),
    ) as any;
    if (!activity) {
      throw new AppError('NOT_FOUND', 404, 'Activity not found');
    }

    assertCanUpdate(role, userId, activity);

    const data: Record<string, unknown> = {};
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    if (dto.happenedAt !== undefined) data.happenedAt = dto.happenedAt ? new Date(dto.happenedAt) : null;
    if (dto.plannedAt !== undefined) data.plannedAt = dto.plannedAt ? new Date(dto.plannedAt) : null;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.payload !== undefined) data.payloadJson = dto.payload;

    await withOrg(this.prisma, orgId, (tx) =>
      tx.leadActivity.update({ where: { id: activityId }, data }),
    );

    this.audit.log({
      orgId,
      userId,
      actorRole: 'ORG',
      action: 'LEAD_ACTIVITY_UPDATED',
      targetType: 'LEAD_ACTIVITY',
      targetId: activityId,
      metaJson: { leadId: activity.leadId, type: activity.type },
    }).catch(() => {});

    return { updated: true };
  }

  async softDelete(
    orgId: string,
    activityId: string,
    userId: string,
    role: OrgRoleType,
  ): Promise<{ deleted: boolean }> {
    const activity = await withOrg(this.prisma, orgId, (tx) =>
      tx.leadActivity.findUnique({ where: { id: activityId } }),
    ) as any;
    if (!activity) {
      throw new AppError('NOT_FOUND', 404, 'Activity not found');
    }

    assertCanDelete(role, userId, activity);

    await withOrg(this.prisma, orgId, (tx) =>
      tx.leadActivity.update({
        where: { id: activityId },
        data: {
          recordStatus: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      }),
    );

    this.audit.log({
      orgId,
      userId,
      actorRole: 'ORG',
      action: 'LEAD_ACTIVITY_DELETED',
      targetType: 'LEAD_ACTIVITY',
      targetId: activityId,
      metaJson: { leadId: activity.leadId, type: activity.type },
    }).catch(() => {});

    return { deleted: true };
  }

  async createSystemEvent(
    tx: any,
    orgId: string,
    leadId: string,
    userId: string | null,
    event: string,
    from: Record<string, unknown>,
    to: Record<string, unknown>,
    body?: string,
  ): Promise<void> {
    await tx.leadActivity.create({
      data: {
        organizationId: orgId,
        leadId,
        type: 'SYSTEM_EVENT',
        visibility: 'INTERNAL',
        createdByUserId: userId,
        happenedAt: new Date(),
        payloadJson: { event, from, to },
        body: body ?? null,
      },
    });
  }

  private async assertLeadExists(orgId: string, leadId: string): Promise<void> {
    const lead = await withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    );
    if (!lead) {
      throw new AppError('NOT_FOUND', 404, 'Lead not found');
    }
  }

  private async assertLeadExistsTx(tx: any, leadId: string): Promise<void> {
    const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) {
      throw new AppError('NOT_FOUND', 404, 'Lead not found');
    }
  }
}

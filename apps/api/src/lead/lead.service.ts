import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { withOrg } from '../tenancy/with-org';
import { ActivitiesService } from '../crm/activities/activities.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { MarkLostDto } from './dto/mark-lost.dto';
import { MarkWonDto } from './dto/mark-won.dto';
import { CreateRelationDto } from './dto/create-relation.dto';
import {
  OrgRoleType,
  buildVisibilityWhere,
  assertLeadVisible,
  filterUpdateFields,
  assertCanAssign,
  assertCanDelete,
  assertCanMarkLostWon,
} from './lead.rbac';

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ActivitiesService))
    private readonly activitiesService: ActivitiesService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────
  async create(orgId: string, dto: CreateLeadDto, userId: string) {
    return withOrg(this.prisma, orgId, async (tx) => {
      const lead = await tx.lead.create({
        data: {
          organizationId: orgId,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          type: dto.type ?? 'BUYER',
          priority: dto.priority ?? 'MEDIUM',
          ownerUserId: null,
          createdByUserId: userId,
          budgetMin: dto.budgetMin ?? null,
          budgetMax: dto.budgetMax ?? null,
          wilaya: dto.wilaya ?? null,
          commune: dto.commune ?? null,
          quartier: dto.quartier ?? null,
          propertyType: dto.propertyType ?? null,
          surfaceMin: dto.surfaceMin ?? null,
          notes: dto.notes ?? null,
          sourceType: dto.sourceType ?? 'MANUAL',
          sourceRefJson: (dto.sourceRefJson as Prisma.InputJsonValue) ?? undefined,
          tagsJson: dto.tags ?? undefined,
          nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
        },
      });

      await this.activitiesService.createSystemEvent(
        tx, orgId, lead.id, userId,
        'LEAD_CREATED',
        {},
        { status: 'NEW', type: lead.type },
      );

      this.fireLeadNewNotification(orgId, lead.id, lead.fullName, userId).catch(() => {});

      return lead;
    });
  }

  // ─── LIST (cursor pagination + filters + RBAC visibility) ──
  async findAll(
    orgId: string,
    userId: string,
    role: OrgRoleType,
    params: {
      q?: string;
      status?: string;
      type?: string;
      priority?: string;
      owner?: string;
      nextActionBefore?: string;
      includeDeleted?: boolean;
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const where: Record<string, unknown> = {};

    // RBAC visibility
    const vis = buildVisibilityWhere(role, userId);
    if (vis) Object.assign(where, vis);

    // Soft delete filter
    if (!params.includeDeleted || (role !== 'OWNER' && role !== 'MANAGER')) {
      where.recordStatus = 'ACTIVE';
    }

    // Filters
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.priority) where.priority = params.priority;
    if (params.owner === 'unassigned') {
      where.ownerUserId = null;
    } else if (params.owner === 'me') {
      where.ownerUserId = userId;
    } else if (params.owner) {
      where.ownerUserId = params.owner;
    }
    if (params.nextActionBefore) {
      where.nextActionAt = { lte: new Date(params.nextActionBefore) };
    }
    if (params.q) {
      where.OR = [
        { fullName: { contains: params.q, mode: 'insensitive' } },
        { phone: { contains: params.q } },
        { email: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    // Cursor pagination
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

    const rows = await withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findMany({
        where: finalWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          type: true,
          status: true,
          priority: true,
          ownerUserId: true,
          nextActionAt: true,
          recordStatus: true,
          createdAt: true,
          updatedAt: true,
        },
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
      items,
      page: { limit, cursor: params.cursor ?? null, nextCursor, hasMore },
    };
  }

  // ─── FIND ONE (full DTO + RBAC visibility) ─────────────────
  async findOne(orgId: string, id: string, userId: string, role: OrgRoleType) {
    const lead = await withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findUnique({ where: { id } }),
    ) as any;

    if (!lead) {
      throw new AppError('LEAD_NOT_FOUND', 404, 'Lead not found');
    }

    assertLeadVisible(role, userId, lead);
    return lead;
  }

  // ─── UPDATE (RBAC field filtering + hooks) ─────────────────
  async update(
    orgId: string,
    id: string,
    dto: UpdateLeadDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const existing = await this.findOne(orgId, id, userId, role);

    // Build data from DTO
    const rawData: Record<string, unknown> = {};
    if (dto.fullName !== undefined) rawData.fullName = dto.fullName;
    if (dto.phone !== undefined) rawData.phone = dto.phone;
    if (dto.email !== undefined) rawData.email = dto.email;
    if (dto.type !== undefined) rawData.type = dto.type;
    if (dto.status !== undefined) rawData.status = dto.status;
    if (dto.priority !== undefined) rawData.priority = dto.priority;
    if (dto.budgetMin !== undefined) rawData.budgetMin = dto.budgetMin;
    if (dto.budgetMax !== undefined) rawData.budgetMax = dto.budgetMax;
    if (dto.wilaya !== undefined) rawData.wilaya = dto.wilaya;
    if (dto.commune !== undefined) rawData.commune = dto.commune;
    if (dto.quartier !== undefined) rawData.quartier = dto.quartier;
    if (dto.propertyType !== undefined) rawData.propertyType = dto.propertyType;
    if (dto.surfaceMin !== undefined) rawData.surfaceMin = dto.surfaceMin;
    if (dto.notes !== undefined) rawData.notes = dto.notes;
    if (dto.tags !== undefined) rawData.tagsJson = dto.tags;
    if (dto.nextActionAt !== undefined) rawData.nextActionAt = dto.nextActionAt ? new Date(dto.nextActionAt) : null;

    // RBAC field filter (throws if forbidden fields)
    filterUpdateFields(role, rawData);

    return withOrg(this.prisma, orgId, async (tx) => {
      // Status transition logic for wonAt/lostAt/statusChangedAt
      if (dto.status && dto.status !== (existing as any).status) {
        rawData.statusChangedAt = new Date();
        if (dto.status !== 'WON') rawData.wonAt = null;
        if (dto.status !== 'LOST') rawData.lostAt = null;
        if (dto.status === 'WON') { rawData.wonAt = new Date(); rawData.lostAt = null; }
        if (dto.status === 'LOST') { rawData.lostAt = new Date(); rawData.wonAt = null; }
      }

      const updated = await tx.lead.update({ where: { id }, data: rawData });

      // Status change event
      if (dto.status && dto.status !== (existing as any).status) {
        await this.activitiesService.createSystemEvent(
          tx, orgId, id, userId,
          'STATUS_CHANGED',
          { status: (existing as any).status },
          { status: dto.status },
          `Status changed to ${dto.status}`,
        );
      }

      return updated;
    });
  }

  // ─── ASSIGN (MANAGER only) ─────────────────────────────────
  async assign(
    orgId: string,
    id: string,
    dto: AssignLeadDto,
    userId: string,
    role: OrgRoleType,
  ) {
    assertCanAssign(role);

    const existing = await this.findOne(orgId, id, userId, role);
    const newOwner = dto.ownerUserId ?? null;

    // Validate new owner is member of org
    if (newOwner) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: newOwner, orgId } },
      });
      if (!membership) {
        throw new AppError('OWNER_NOT_MEMBER', 400, 'Target user is not a member of this organization');
      }
    }

    return withOrg(this.prisma, orgId, async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { ownerUserId: newOwner },
      });

      await this.activitiesService.createSystemEvent(
        tx, orgId, id, userId,
        'OWNER_ASSIGNED',
        { ownerUserId: (existing as any).ownerUserId ?? null },
        { ownerUserId: newOwner },
      );

      if (newOwner && newOwner !== userId) {
        this.notificationService.notifyUsers({
          organizationId: orgId,
          userIds: [newOwner],
          templateKey: 'lead.assigned',
          meta: { leadId: id, leadName: (existing as any).fullName, assignedBy: userId },
        }).catch(() => {});
      }

      return updated;
    });
  }

  // ─── MARK LOST ─────────────────────────────────────────────
  async markLost(
    orgId: string,
    id: string,
    dto: MarkLostDto,
    userId: string,
    role: OrgRoleType,
  ) {
    assertCanMarkLostWon(role);
    const existing = await this.findOne(orgId, id, userId, role);

    return withOrg(this.prisma, orgId, async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: 'LOST',
          lostReason: dto.lostReason ?? null,
          lostAt: new Date(),
          wonAt: null,
          statusChangedAt: new Date(),
        },
      });

      await this.activitiesService.createSystemEvent(
        tx, orgId, id, userId,
        'MARKED_LOST',
        { status: (existing as any).status },
        { status: 'LOST', lostReason: dto.lostReason ?? null },
        'Lead marked as lost',
      );

      this.fireLeadStatusNotification(orgId, id, (existing as any).fullName, userId, 'lead.markLost').catch(() => {});

      return updated;
    });
  }

  // ─── MARK WON ──────────────────────────────────────────────
  async markWon(
    orgId: string,
    id: string,
    dto: MarkWonDto,
    userId: string,
    role: OrgRoleType,
  ) {
    assertCanMarkLostWon(role);
    const existing = await this.findOne(orgId, id, userId, role);

    return withOrg(this.prisma, orgId, async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: 'WON',
          wonNote: dto.wonNote ?? null,
          wonAt: new Date(),
          lostAt: null,
          statusChangedAt: new Date(),
        },
      });

      await this.activitiesService.createSystemEvent(
        tx, orgId, id, userId,
        'MARKED_WON',
        { status: (existing as any).status },
        { status: 'WON', wonNote: dto.wonNote ?? null },
        'Lead marked as won',
      );

      this.fireLeadStatusNotification(orgId, id, (existing as any).fullName, userId, 'lead.markWon').catch(() => {});

      return updated;
    });
  }

  // ─── SOFT DELETE ────────────────────────────────────────────
  async remove(
    orgId: string,
    id: string,
    userId: string,
    role: OrgRoleType,
  ) {
    const existing = await this.findOne(orgId, id, userId, role);
    assertCanDelete(role, userId, existing as any);

    return withOrg(this.prisma, orgId, async (tx) => {
      await tx.lead.update({
        where: { id },
        data: {
          recordStatus: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      });

      await this.activitiesService.createSystemEvent(
        tx, orgId, id, userId,
        'LEAD_DELETED',
        { recordStatus: 'ACTIVE' },
        { recordStatus: 'DELETED' },
      );

      return { deleted: true };
    });
  }

  // ─── RELATIONS ──────────────────────────────────────────────
  async createRelation(
    orgId: string,
    leadId: string,
    dto: CreateRelationDto,
    userId: string,
    role: OrgRoleType,
  ) {
    await this.findOne(orgId, leadId, userId, role);

    return withOrg(this.prisma, orgId, (tx) =>
      tx.leadRelation.create({
        data: {
          organizationId: orgId,
          leadId,
          relationType: dto.relationType,
          targetId: dto.targetId,
          label: dto.label ?? null,
        },
      }),
    );
  }

  async getRelations(
    orgId: string,
    leadId: string,
    userId: string,
    role: OrgRoleType,
  ) {
    await this.findOne(orgId, leadId, userId, role);

    return withOrg(this.prisma, orgId, (tx) =>
      tx.leadRelation.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  // ─── DOCUMENTS (via DocumentLink) ──────────────────────────
  async getDocuments(
    orgId: string,
    leadId: string,
    userId: string,
    role: OrgRoleType,
  ) {
    await this.findOne(orgId, leadId, userId, role);

    return withOrg(this.prisma, orgId, (tx) =>
      tx.documentLink.findMany({
        where: { targetType: 'LEAD', targetId: leadId },
        include: { document: { select: { id: true, title: true, kind: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async attachDocument(
    orgId: string,
    leadId: string,
    documentId: string,
    tag: string | undefined,
    userId: string,
    role: OrgRoleType,
  ) {
    await this.findOne(orgId, leadId, userId, role);

    const doc = await withOrg(this.prisma, orgId, (tx) =>
      tx.document.findUnique({ where: { id: documentId }, select: { id: true } }),
    );
    if (!doc) {
      throw new AppError('DOCUMENT_NOT_FOUND', 404, 'Document not found');
    }

    return withOrg(this.prisma, orgId, (tx) =>
      tx.documentLink.create({
        data: {
          organizationId: orgId,
          documentId,
          targetType: 'LEAD',
          targetId: leadId,
          tag: tag ?? null,
        },
      }),
    );
  }

  // ─── Helpers ────────────────────────────────────────────────
  async getUserRole(orgId: string, userId: string): Promise<OrgRoleType> {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return (membership?.role as OrgRoleType) ?? 'VIEWER';
  }

  private async fireLeadNewNotification(
    orgId: string,
    leadId: string,
    leadName: string,
    createdByUserId: string,
  ): Promise<void> {
    const managers = await this.prisma.orgMembership.findMany({
      where: { orgId, role: { in: ['OWNER', 'MANAGER'] } },
      select: { userId: true },
    });
    const userIds = managers.map((m) => m.userId).filter((uid) => uid !== createdByUserId);
    if (userIds.length === 0) return;
    await this.notificationService.notifyUsers({
      organizationId: orgId,
      userIds,
      templateKey: 'lead.new',
      meta: { leadId, leadName, createdBy: createdByUserId },
    });
  }

  private async fireLeadStatusNotification(
    orgId: string,
    leadId: string,
    leadName: string,
    actorUserId: string,
    templateKey: string,
  ): Promise<void> {
    const managers = await this.prisma.orgMembership.findMany({
      where: { orgId, role: { in: ['OWNER', 'MANAGER'] } },
      select: { userId: true },
    });
    const userIds = managers.map((m) => m.userId).filter((uid) => uid !== actorUserId);
    if (userIds.length === 0) return;
    await this.notificationService.notifyUsers({
      organizationId: orgId,
      userIds,
      templateKey,
      meta: { leadId, leadName },
    });
  }
}

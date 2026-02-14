import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { TasksService } from '../crm/tasks/tasks.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { CancelCalendarEventDto } from './dto/cancel-calendar-event.dto';
import { CompleteCalendarEventDto } from './dto/complete-calendar-event.dto';
import {
  OrgRoleType,
  buildEventVisibilityWhere,
  assertEventVisible,
  assertCanCreateEvent,
  assertCanUpdateEvent,
  assertCanCancelOrComplete,
  assertCanDeleteEvent,
} from './planning.access';
import {
  EVENT_TIME_CONFLICT,
  EVENT_INVALID_RANGE,
  EVENT_DURATION_TOO_LONG,
  PERIOD_TOO_LARGE,
  ASSIGNEE_NOT_MEMBER,
  EVENT_NOT_FOUND,
  EVENT_ALREADY_CANCELED,
  EVENT_ALREADY_COMPLETED,
} from './planning.errors';

const MAX_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_PERIOD_DAYS = 90;

@Injectable()
export class PlanningService {
  private readonly logger = new Logger('PlanningService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
  ) {}

  async getUserRole(orgId: string, userId: string): Promise<OrgRoleType> {
    const m = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    if (!m) throw new AppError('NOT_FOUND', 404, 'Not a member');
    return m.role as OrgRoleType;
  }

  // ─── CREATE ─────────────────────────────────────────────────
  async create(
    orgId: string,
    dto: CreateCalendarEventDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.validateDateRange(startAt, endAt);

    // RBAC: assignee check
    assertCanCreateEvent(role, userId, dto.assigneeUserId);

    // Validate assignee is org member
    await this.assertOrgMember(orgId, dto.assigneeUserId);

    // Validate lead access if provided
    if (dto.leadId) {
      await this.assertLeadExists(orgId, dto.leadId);
    }

    // Overlap check
    await this.checkOverlap(orgId, dto.assigneeUserId, startAt, endAt, null);

    return withOrg(this.prisma, orgId, async (tx) => {
      const event = await tx.calendarEvent.create({
        data: {
          organizationId: orgId,
          type: dto.type as any,
          title: dto.title,
          description: dto.description ?? null,
          startAt,
          endAt,
          timezone: dto.timezone ?? 'Africa/Algiers',
          assigneeUserId: dto.assigneeUserId,
          createdByUserId: userId,
          leadId: dto.leadId ?? null,
          listingId: dto.listingId ?? null,
          targetType: dto.targetType ?? null,
          targetId: dto.targetId ?? null,
          wilaya: dto.wilaya ?? null,
          commune: dto.commune ?? null,
          quartier: dto.quartier ?? null,
          addressLine: dto.addressLine ?? null,
          visibility: (dto.visibility as any) ?? 'INTERNAL',
        },
      });

      // Timeline: write system event if leadId
      if (dto.leadId) {
        await this.writeTimelineEvent(tx, orgId, dto.leadId, userId, 'EVENT_SCHEDULED', {
          eventId: event.id,
          eventType: dto.type,
          assigneeUserId: dto.assigneeUserId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          targetType: dto.targetType ?? null,
          targetId: dto.targetId ?? null,
        });
      }

      // AutoTask: create task for VISIT/SIGNING
      let autoTaskId: string | null = null;
      const autoTaskEnabled = dto.autoTask?.enabled !== false;
      if ((dto.type === 'VISIT' || dto.type === 'SIGNING') && autoTaskEnabled && dto.leadId) {
        const remindMinutes = dto.autoTask?.remindMinutesBefore ?? 60;
        const taskPrefix = dto.type === 'VISIT' ? '[Visite]' : '[RDV]';
        const task = await this.createAutoTask(
          tx, orgId, dto.leadId, `${taskPrefix} ${dto.title}`,
          startAt, remindMinutes, dto.assigneeUserId, userId,
        );
        autoTaskId = task.id;
        await tx.calendarEvent.update({
          where: { id: event.id },
          data: { autoTaskId },
        });
      }

      this.audit.log({
        orgId, userId, actorRole: 'ORG',
        action: 'CALENDAR_EVENT_CREATED',
        targetType: 'CALENDAR_EVENT', targetId: event.id,
        metaJson: { type: dto.type, leadId: dto.leadId },
      }).catch(() => {});

      return { id: event.id, autoTaskId };
    });
  }

  // ─── LIST ───────────────────────────────────────────────────
  async findAll(
    orgId: string,
    userId: string,
    role: OrgRoleType,
    params: {
      from: string;
      to: string;
      assignee?: string;
      type?: string;
      status?: string;
      includeDeleted?: string;
    },
  ) {
    const from = new Date(params.from);
    const to = new Date(params.to);

    // Validate period
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_PERIOD_DAYS) throw PERIOD_TOO_LARGE();
    if (from >= to) throw EVENT_INVALID_RANGE();

    const visibilityWhere = buildEventVisibilityWhere(role, userId, params.assignee);

    const where: Record<string, unknown> = {
      ...visibilityWhere,
      startAt: { lt: to },
      endAt: { gt: from },
    };

    if (params.type) {
      where.type = { in: params.type.split(',') };
    }
    if (params.status) {
      where.status = { in: params.status.split(',') };
    }

    const includeDeleted = params.includeDeleted === 'true' && (role === 'OWNER' || role === 'MANAGER');
    if (!includeDeleted) {
      where.recordStatus = 'ACTIVE';
    }

    const items = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findMany({
        where,
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          startAt: true,
          endAt: true,
          timezone: true,
          assigneeUserId: true,
          leadId: true,
          wilaya: true,
          commune: true,
          quartier: true,
          autoTaskId: true,
          recordStatus: true,
        },
      }),
    );

    return { items };
  }

  // ─── FIND ONE ───────────────────────────────────────────────
  async findOne(
    orgId: string,
    eventId: string,
    userId: string,
    role: OrgRoleType,
  ) {
    const event = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findUnique({
        where: { id: eventId },
        include: {
          lead: { select: { id: true, fullName: true, phone: true } },
        },
      }),
    ) as any;

    if (!event) throw EVENT_NOT_FOUND();
    assertEventVisible(role, userId, event);

    return event;
  }

  // ─── UPDATE ─────────────────────────────────────────────────
  async update(
    orgId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const event = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findUnique({ where: { id: eventId } }),
    ) as any;

    if (!event || event.recordStatus === 'DELETED') throw EVENT_NOT_FOUND();
    assertCanUpdateEvent(role, userId, event, dto as any);

    // If assignee changes, validate new assignee is org member
    if (dto.assigneeUserId && dto.assigneeUserId !== event.assigneeUserId) {
      await this.assertOrgMember(orgId, dto.assigneeUserId);
    }

    const newStartAt = dto.startAt ? new Date(dto.startAt) : event.startAt;
    const newEndAt = dto.endAt ? new Date(dto.endAt) : event.endAt;
    const datesChanged = dto.startAt !== undefined || dto.endAt !== undefined;

    if (datesChanged) {
      this.validateDateRange(newStartAt, newEndAt);
      const assignee = dto.assigneeUserId ?? event.assigneeUserId;
      await this.checkOverlap(orgId, assignee, newStartAt, newEndAt, eventId);
    }

    return withOrg(this.prisma, orgId, async (tx) => {
      const data: Record<string, unknown> = { updatedByUserId: userId };
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.startAt !== undefined) data.startAt = newStartAt;
      if (dto.endAt !== undefined) data.endAt = newEndAt;
      if (dto.timezone !== undefined) data.timezone = dto.timezone;
      if (dto.assigneeUserId !== undefined) data.assigneeUserId = dto.assigneeUserId;
      if (dto.wilaya !== undefined) data.wilaya = dto.wilaya;
      if (dto.commune !== undefined) data.commune = dto.commune;
      if (dto.quartier !== undefined) data.quartier = dto.quartier;
      if (dto.addressLine !== undefined) data.addressLine = dto.addressLine;
      if (dto.visibility !== undefined) data.visibility = dto.visibility;
      if (dto.type !== undefined) data.type = dto.type;

      const updated = await tx.calendarEvent.update({
        where: { id: eventId },
        data,
      });

      // Timeline: EVENT_RESCHEDULED if dates changed, EVENT_UPDATED otherwise
      if (event.leadId) {
        const kind = datesChanged ? 'EVENT_RESCHEDULED' : 'EVENT_UPDATED';
        await this.writeTimelineEvent(tx, orgId, event.leadId, userId, kind, {
          eventId,
          eventType: updated.type,
          assigneeUserId: updated.assigneeUserId,
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
        });
      }

      // AutoTask sync
      if (event.autoTaskId && datesChanged) {
        await this.updateAutoTaskDates(tx, orgId, event.autoTaskId, newStartAt, dto.autoTask?.remindMinutesBefore ?? 60);
      }
      if (event.autoTaskId && dto.title) {
        const taskPrefix = (updated.type === 'VISIT') ? '[Visite]' : '[RDV]';
        await tx.task.update({
          where: { id: event.autoTaskId },
          data: { title: `${taskPrefix} ${dto.title}` },
        }).catch(() => {});
      }

      // AutoTask enable/disable
      if (dto.autoTask?.enabled === false && event.autoTaskId) {
        await tx.task.update({
          where: { id: event.autoTaskId },
          data: { status: 'CANCELED' },
        });
        await tx.calendarEvent.update({
          where: { id: eventId },
          data: { autoTaskId: null },
        });
      }
      if (dto.autoTask?.enabled === true && !event.autoTaskId && event.leadId) {
        const type = dto.type ?? event.type;
        if (type === 'VISIT' || type === 'SIGNING') {
          const remindMinutes = dto.autoTask?.remindMinutesBefore ?? 60;
          const taskPrefix = type === 'VISIT' ? '[Visite]' : '[RDV]';
          const task = await this.createAutoTask(
            tx, orgId, event.leadId, `${taskPrefix} ${updated.title}`,
            newStartAt, remindMinutes, updated.assigneeUserId, userId,
          );
          await tx.calendarEvent.update({
            where: { id: eventId },
            data: { autoTaskId: task.id },
          });
        }
      }

      this.audit.log({
        orgId, userId, actorRole: 'ORG',
        action: 'CALENDAR_EVENT_UPDATED',
        targetType: 'CALENDAR_EVENT', targetId: eventId,
      }).catch(() => {});

      return { updated: true };
    });
  }

  // ─── CANCEL ─────────────────────────────────────────────────
  async cancel(
    orgId: string,
    eventId: string,
    dto: CancelCalendarEventDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const event = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findUnique({ where: { id: eventId } }),
    ) as any;

    if (!event || event.recordStatus === 'DELETED') throw EVENT_NOT_FOUND();
    if (event.status === 'CANCELED') throw EVENT_ALREADY_CANCELED();
    assertCanCancelOrComplete(role, userId, event);

    return withOrg(this.prisma, orgId, async (tx) => {
      await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          status: 'CANCELED',
          cancelReason: dto.reason,
          canceledAt: new Date(),
          updatedByUserId: userId,
        },
      });

      if (event.leadId) {
        await this.writeTimelineEvent(tx, orgId, event.leadId, userId, 'EVENT_CANCELED', {
          eventId,
          eventType: event.type,
          reason: dto.reason,
        });
      }

      // Cancel auto task
      if (event.autoTaskId) {
        await tx.task.update({
          where: { id: event.autoTaskId },
          data: { status: 'CANCELED' },
        }).catch(() => {});
      }

      this.audit.log({
        orgId, userId, actorRole: 'ORG',
        action: 'CALENDAR_EVENT_CANCELED',
        targetType: 'CALENDAR_EVENT', targetId: eventId,
      }).catch(() => {});

      return { canceled: true };
    });
  }

  // ─── COMPLETE ───────────────────────────────────────────────
  async complete(
    orgId: string,
    eventId: string,
    dto: CompleteCalendarEventDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const event = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findUnique({ where: { id: eventId } }),
    ) as any;

    if (!event || event.recordStatus === 'DELETED') throw EVENT_NOT_FOUND();
    if (event.status === 'COMPLETED' || event.status === 'NO_SHOW') throw EVENT_ALREADY_COMPLETED();
    if (event.status === 'CANCELED') throw EVENT_ALREADY_CANCELED();
    assertCanCancelOrComplete(role, userId, event);

    return withOrg(this.prisma, orgId, async (tx) => {
      await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          status: dto.status as any,
          resultNote: dto.resultNote ?? null,
          completedAt: new Date(),
          updatedByUserId: userId,
        },
      });

      const kind = dto.status === 'COMPLETED' ? 'EVENT_COMPLETED' : 'EVENT_NO_SHOW';
      if (event.leadId) {
        await this.writeTimelineEvent(tx, orgId, event.leadId, userId, kind, {
          eventId,
          eventType: event.type,
          resultNote: dto.resultNote ?? null,
        });
      }

      // Complete auto task
      if (event.autoTaskId) {
        const taskStatus = dto.status === 'COMPLETED' ? 'DONE' : 'CANCELED';
        await tx.task.update({
          where: { id: event.autoTaskId },
          data: { status: taskStatus, completedAt: dto.status === 'COMPLETED' ? new Date() : undefined },
        }).catch(() => {});
      }

      this.audit.log({
        orgId, userId, actorRole: 'ORG',
        action: 'CALENDAR_EVENT_COMPLETED',
        targetType: 'CALENDAR_EVENT', targetId: eventId,
        metaJson: { status: dto.status },
      }).catch(() => {});

      return { completed: true };
    });
  }

  // ─── SOFT DELETE ────────────────────────────────────────────
  async remove(
    orgId: string,
    eventId: string,
    userId: string,
    role: OrgRoleType,
  ) {
    assertCanDeleteEvent(role);

    const event = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findUnique({ where: { id: eventId } }),
    ) as any;

    if (!event || event.recordStatus === 'DELETED') throw EVENT_NOT_FOUND();

    return withOrg(this.prisma, orgId, async (tx) => {
      await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          recordStatus: 'DELETED',
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      });

      this.audit.log({
        orgId, userId, actorRole: 'ORG',
        action: 'CALENDAR_EVENT_DELETED',
        targetType: 'CALENDAR_EVENT', targetId: eventId,
      }).catch(() => {});

      return { deleted: true };
    });
  }

  // ─── LEAD EVENTS ───────────────────────────────────────────
  async findByLead(
    orgId: string,
    leadId: string,
    userId: string,
    role: OrgRoleType,
  ) {
    await this.assertLeadExists(orgId, leadId);

    const visibilityWhere = buildEventVisibilityWhere(role, userId);

    const items = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findMany({
        where: {
          leadId,
          recordStatus: 'ACTIVE',
          status: { in: ['SCHEDULED'] },
          startAt: { gte: new Date() },
          ...visibilityWhere,
        },
        orderBy: { startAt: 'asc' },
        take: 20,
        select: {
          id: true, type: true, status: true, title: true,
          startAt: true, endAt: true, assigneeUserId: true,
          wilaya: true, commune: true, quartier: true,
        },
      }),
    );

    return { items };
  }

  // ─── HELPERS ────────────────────────────────────────────────
  private validateDateRange(startAt: Date, endAt: Date): void {
    if (startAt >= endAt) throw EVENT_INVALID_RANGE();
    if (endAt.getTime() - startAt.getTime() > MAX_DURATION_MS) throw EVENT_DURATION_TOO_LONG();
  }

  private async checkOverlap(
    orgId: string,
    assigneeUserId: string,
    startAt: Date,
    endAt: Date,
    excludeEventId: string | null,
  ): Promise<void> {
    const where: Record<string, unknown> = {
      assigneeUserId,
      status: { not: 'CANCELED' },
      recordStatus: 'ACTIVE',
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    };
    if (excludeEventId) {
      where.id = { not: excludeEventId };
    }

    const conflict = await withOrg(this.prisma, orgId, (tx) =>
      tx.calendarEvent.findFirst({
        where,
        select: { id: true, startAt: true, endAt: true },
      }),
    );

    if (conflict) {
      throw EVENT_TIME_CONFLICT(
        conflict.id,
        conflict.startAt.toISOString(),
        conflict.endAt.toISOString(),
      );
    }
  }

  private async assertOrgMember(orgId: string, userId: string): Promise<void> {
    const m = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    if (!m) throw ASSIGNEE_NOT_MEMBER();
  }

  private async assertLeadExists(orgId: string, leadId: string): Promise<void> {
    const lead = await withOrg(this.prisma, orgId, (tx) =>
      tx.lead.findUnique({ where: { id: leadId }, select: { id: true } }),
    );
    if (!lead) throw new AppError('NOT_FOUND', 404, 'Lead not found');
  }

  private async writeTimelineEvent(
    tx: any,
    orgId: string,
    leadId: string,
    userId: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.leadActivity.create({
      data: {
        organizationId: orgId,
        leadId,
        type: 'SYSTEM_EVENT',
        visibility: 'INTERNAL',
        createdByUserId: userId,
        happenedAt: new Date(),
        payloadJson: { event: kind, ...payload },
        body: null,
      },
    });
  }

  private async createAutoTask(
    tx: any,
    orgId: string,
    leadId: string,
    title: string,
    startAt: Date,
    remindMinutesBefore: number,
    assigneeUserId: string,
    createdByUserId: string,
  ) {
    const dueAt = startAt;
    const remindAt = new Date(startAt.getTime() - remindMinutesBefore * 60 * 1000);
    const now = new Date();

    const task = await tx.task.create({
      data: {
        organizationId: orgId,
        leadId,
        title,
        priority: 'HIGH',
        dueAt,
        assigneeUserId,
        createdByUserId,
      },
    });

    // Create reminder only if remindAt is in the future
    if (remindAt > now) {
      await tx.taskReminder.create({
        data: {
          organizationId: orgId,
          taskId: task.id,
          remindAt,
          dedupeKey: `cal-reminder:${task.id}:${remindMinutesBefore}:${dueAt.toISOString()}`,
        },
      });
    }

    return task;
  }

  private async updateAutoTaskDates(
    tx: any,
    orgId: string,
    taskId: string,
    newStartAt: Date,
    remindMinutesBefore: number,
  ): Promise<void> {
    // Update task dueAt
    await tx.task.update({
      where: { id: taskId },
      data: { dueAt: newStartAt },
    }).catch(() => {});

    // Cancel old reminders and create new one
    await tx.taskReminder.updateMany({
      where: { taskId, status: 'SCHEDULED' },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });

    const remindAt = new Date(newStartAt.getTime() - remindMinutesBefore * 60 * 1000);
    if (remindAt > new Date()) {
      await tx.taskReminder.create({
        data: {
          organizationId: orgId,
          taskId,
          remindAt,
          dedupeKey: `cal-reminder:${taskId}:${remindMinutesBefore}:${newStartAt.toISOString()}`,
        },
      });
    }
  }
}

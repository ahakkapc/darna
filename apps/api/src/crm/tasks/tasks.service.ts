import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { withOrg } from '../../tenancy/with-org';
import { NotificationService } from '../../notifications/notification.service';
import { LeadService } from '../../lead/lead.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import {
  OrgRoleType,
  buildTaskVisibilityWhere,
  assertTaskVisible,
  assertCanCreateTask,
  assertCanAssignTask,
  filterTaskUpdateFields,
  assertCanDeleteTask,
} from './tasks.access';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => LeadService))
    private readonly leadService: LeadService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────
  async create(
    orgId: string,
    leadId: string,
    dto: CreateTaskDto,
    userId: string,
    role: OrgRoleType,
  ) {
    // Verify lead is accessible
    await this.leadService.findOne(orgId, leadId, userId, role);

    // Determine assignee
    let assigneeUserId = dto.assigneeUserId ?? null;
    if (!assigneeUserId) {
      // Default: lead owner or task creator
      const lead = await withOrg(this.prisma, orgId, (tx) =>
        tx.lead.findUnique({ where: { id: leadId }, select: { ownerUserId: true } }),
      ) as { ownerUserId: string | null } | null;
      assigneeUserId = lead?.ownerUserId ?? userId;
    }

    // RBAC check
    assertCanCreateTask(role, userId, assigneeUserId);

    // Validate assignee is org member
    if (assigneeUserId) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: assigneeUserId, orgId } },
      });
      if (!membership) {
        throw new AppError('OWNER_NOT_MEMBER', 400, 'Assignee is not a member of this organization');
      }
    }

    return withOrg(this.prisma, orgId, async (tx) => {
      const task = await tx.task.create({
        data: {
          organizationId: orgId,
          leadId,
          title: dto.title,
          description: dto.description ?? null,
          priority: (dto.priority as any) ?? 'MEDIUM',
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          assigneeUserId,
          createdByUserId: userId,
          tagsJson: dto.tags ?? undefined,
        },
      });

      // Create reminders if dueAt is set
      if (task.dueAt) {
        await this.createReminders(tx, orgId, task.id, task.dueAt);
      }

      // Notification to assignee
      if (assigneeUserId && assigneeUserId !== userId) {
        this.notificationService.notifyUsers({
          organizationId: orgId,
          userIds: [assigneeUserId],
          templateKey: 'task.assigned',
          meta: { taskId: task.id, leadId, taskTitle: task.title },
        }).catch(() => {});
      }

      return { ok: true, data: { id: task.id } };
    });
  }

  // ─── LIST (cursor pagination + scope + filters) ─────────────
  async findAll(
    orgId: string,
    userId: string,
    role: OrgRoleType,
    params: {
      scope?: string;
      status?: string;
      priority?: string;
      overdue?: string;
      due?: string;
      q?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const scope = params.scope ?? 'my';

    const where: Record<string, unknown> = { recordStatus: 'ACTIVE' };

    // Scope handling
    if (scope.startsWith('lead:')) {
      const scopeLeadId = scope.substring(5);
      // Verify lead is accessible
      await this.leadService.findOne(orgId, scopeLeadId, userId, role);
      where.leadId = scopeLeadId;
      // AGENT/VIEWER: manager sees all tasks on that lead
      if (role !== 'OWNER' && role !== 'MANAGER') {
        // Show tasks on lead but respect visibility
        Object.assign(where, {
          OR: [
            { assigneeUserId: userId },
            { assigneeUserId: null },
          ],
        });
      }
    } else {
      const vis = buildTaskVisibilityWhere(role, userId, scope);
      if (vis) Object.assign(where, vis);
    }

    // Filters
    if (params.status) {
      const statuses = params.status.split(',').map((s) => s.trim());
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (params.priority) where.priority = params.priority;

    if (params.overdue === 'true') {
      where.dueAt = { lt: new Date() };
      where.status = { in: ['OPEN', 'IN_PROGRESS'] };
    }

    if (params.due) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let endDate: Date;
      if (params.due === 'today') {
        endDate = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      } else if (params.due === 'week') {
        endDate = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        endDate = new Date(startOfDay.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
      where.dueAt = { gte: startOfDay, lt: endDate };
    }

    if (params.q) {
      where.title = { contains: params.q, mode: 'insensitive' };
    }

    // Cursor pagination
    let cursorFilter: Record<string, unknown> | undefined;
    if (params.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(params.cursor, 'base64').toString('utf-8'));
        cursorFilter = {
          OR: [
            { updatedAt: { lt: new Date(decoded.updatedAt) } },
            { updatedAt: new Date(decoded.updatedAt), id: { lt: decoded.id } },
          ],
        };
      } catch {
        throw new AppError('VALIDATION_ERROR', 400, 'Invalid cursor');
      }
    }

    const finalWhere = cursorFilter ? { AND: [where, cursorFilter] } : where;

    const rows = await withOrg(this.prisma, orgId, (tx) =>
      tx.task.findMany({
        where: finalWhere,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          leadId: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          assigneeUserId: true,
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
        JSON.stringify({ updatedAt: last.updatedAt.toISOString(), id: last.id }),
      ).toString('base64');
    }

    return { items, page: { limit, cursor: params.cursor ?? null, nextCursor, hasMore } };
  }

  // ─── FIND ONE ──────────────────────────────────────────────
  async findOne(orgId: string, id: string, userId: string, role: OrgRoleType) {
    const task = await withOrg(this.prisma, orgId, (tx) =>
      tx.task.findUnique({
        where: { id },
        include: {
          reminders: {
            where: { status: 'SCHEDULED' },
            orderBy: { remindAt: 'asc' },
          },
          lead: { select: { ownerUserId: true } },
        },
      }),
    ) as any;

    if (!task) throw new AppError('TASK_NOT_FOUND', 404, 'Task not found');

    assertTaskVisible(role, userId, task);
    return task;
  }

  // ─── UPDATE ─────────────────────────────────────────────────
  async update(
    orgId: string,
    id: string,
    dto: UpdateTaskDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const existing = await this.findOne(orgId, id, userId, role);

    const rawData: Record<string, unknown> = {};
    if (dto.title !== undefined) rawData.title = dto.title;
    if (dto.description !== undefined) rawData.description = dto.description;
    if (dto.priority !== undefined) rawData.priority = dto.priority;
    if (dto.status !== undefined) rawData.status = dto.status;
    if (dto.dueAt !== undefined) rawData.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.tags !== undefined) rawData.tagsJson = dto.tags;

    // RBAC field filter
    filterTaskUpdateFields(role, userId, existing, rawData);

    // Status → DONE: set completedAt, cancel reminders
    if (dto.status === 'DONE' || dto.status === 'CANCELED') {
      if (dto.status === 'DONE') rawData.completedAt = new Date();
    }

    return withOrg(this.prisma, orgId, async (tx) => {
      const updated = await tx.task.update({ where: { id }, data: rawData });

      // Cancel reminders on DONE/CANCELED
      if (dto.status === 'DONE' || dto.status === 'CANCELED') {
        await tx.taskReminder.updateMany({
          where: { taskId: id, status: 'SCHEDULED' },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
      }

      // Recalc reminders on dueAt change
      if (dto.dueAt !== undefined && dto.dueAt !== (existing.dueAt?.toISOString() ?? null)) {
        // Cancel old SCHEDULED reminders
        await tx.taskReminder.updateMany({
          where: { taskId: id, status: 'SCHEDULED' },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
        // Create new if dueAt is set
        if (updated.dueAt) {
          await this.createReminders(tx, orgId, id, updated.dueAt);
        }
      }

      return updated;
    });
  }

  // ─── ASSIGN ─────────────────────────────────────────────────
  async assign(
    orgId: string,
    id: string,
    dto: AssignTaskDto,
    userId: string,
    role: OrgRoleType,
  ) {
    const existing = await this.findOne(orgId, id, userId, role);
    const newAssignee = dto.assigneeUserId ?? null;

    assertCanAssignTask(role, userId, newAssignee);

    // Validate assignee is org member
    if (newAssignee) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: newAssignee, orgId } },
      });
      if (!membership) {
        throw new AppError('OWNER_NOT_MEMBER', 400, 'Assignee is not a member of this organization');
      }
    }

    return withOrg(this.prisma, orgId, async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: { assigneeUserId: newAssignee },
      });

      // Notification to new assignee
      if (newAssignee && newAssignee !== userId && newAssignee !== existing.assigneeUserId) {
        this.notificationService.notifyUsers({
          organizationId: orgId,
          userIds: [newAssignee],
          templateKey: 'task.assigned',
          meta: { taskId: id, leadId: existing.leadId, taskTitle: existing.title },
        }).catch(() => {});
      }

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
    assertCanDeleteTask(role, userId, existing);

    return withOrg(this.prisma, orgId, async (tx) => {
      await tx.task.update({
        where: { id },
        data: { recordStatus: 'DELETED', deletedAt: new Date(), deletedByUserId: userId },
      });

      // Cancel reminders
      await tx.taskReminder.updateMany({
        where: { taskId: id, status: 'SCHEDULED' },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });

      return { deleted: true };
    });
  }

  // ─── HELPERS ────────────────────────────────────────────────
  async getUserRole(orgId: string, userId: string): Promise<OrgRoleType> {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return (membership?.role as OrgRoleType) ?? 'VIEWER';
  }

  // Create reminders for dueAt - 24h and dueAt - 1h
  private async createReminders(
    tx: any,
    orgId: string,
    taskId: string,
    dueAt: Date,
  ): Promise<void> {
    const now = new Date();
    const offsets = [
      { label: '24h', ms: 24 * 60 * 60 * 1000 },
      { label: '1h', ms: 60 * 60 * 1000 },
    ];

    for (const offset of offsets) {
      const remindAt = new Date(dueAt.getTime() - offset.ms);
      if (remindAt <= now) continue; // too late to remind

      const dedupeKey = `reminder:${taskId}:${offset.label}:${dueAt.toISOString()}`;

      try {
        await tx.taskReminder.create({
          data: {
            organizationId: orgId,
            taskId,
            remindAt,
            dedupeKey,
          },
        });
      } catch (err: any) {
        // Unique constraint violation → skip
        if (err?.code === 'P2002') continue;
        throw err;
      }
    }
  }

  // ─── TICK: process reminders + overdue (called by worker) ──
  async processOrgTick(orgId: string): Promise<{ remindersSent: number; overduesSent: number }> {
    const now = new Date();
    let remindersSent = 0;
    let overduesSent = 0;

    // 1) Process due reminders
    const dueReminders = await withOrg(this.prisma, orgId, (tx) =>
      tx.taskReminder.findMany({
        where: {
          status: 'SCHEDULED',
          remindAt: { lte: now },
        },
        take: 100,
        include: {
          task: {
            select: {
              id: true,
              title: true,
              leadId: true,
              assigneeUserId: true,
              status: true,
              recordStatus: true,
            },
          },
        },
      }),
    ) as any[];

    for (const reminder of dueReminders) {
      // Skip if task is done/canceled/deleted
      if (
        reminder.task.recordStatus === 'DELETED' ||
        reminder.task.status === 'DONE' ||
        reminder.task.status === 'CANCELED'
      ) {
        await withOrg(this.prisma, orgId, (tx) =>
          tx.taskReminder.update({
            where: { id: reminder.id },
            data: { status: 'CANCELED', canceledAt: now },
          }),
        );
        continue;
      }

      if (reminder.task.assigneeUserId) {
        await this.notificationService.notifyUsers({
          organizationId: orgId,
          userIds: [reminder.task.assigneeUserId],
          templateKey: 'task.reminder',
          meta: {
            taskId: reminder.task.id,
            leadId: reminder.task.leadId,
            taskTitle: reminder.task.title,
          },
        });
        remindersSent++;
      }

      await withOrg(this.prisma, orgId, (tx) =>
        tx.taskReminder.update({
          where: { id: reminder.id },
          data: { status: 'SENT', sentAt: now },
        }),
      );
    }

    // 2) Process overdue tasks
    const overdueTasks = await withOrg(this.prisma, orgId, (tx) =>
      tx.task.findMany({
        where: {
          recordStatus: 'ACTIVE',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { lt: now },
          assigneeUserId: { not: null },
        },
        take: 100,
        select: {
          id: true,
          title: true,
          leadId: true,
          assigneeUserId: true,
          priority: true,
        },
      }),
    ) as any[];

    const todayBucket = now.toISOString().split('T')[0]; // YYYY-MM-DD

    for (const task of overdueTasks) {
      if (!task.assigneeUserId) continue;

      // Use dateBucketId in meta so computeDedupeKey changes daily
      const result = await this.notificationService.notifyUsers({
        organizationId: orgId,
        userIds: [task.assigneeUserId],
        templateKey: 'task.overdue',
        meta: {
          taskId: task.id,
          leadId: task.leadId,
          taskTitle: task.title,
          dateBucketId: todayBucket,
        },
        dedupe: { key: `task.overdue:${task.id}:${task.assigneeUserId}`, windowSeconds: 86400 },
      });

      if (result.created > 0) overduesSent++;
    }

    return { remindersSent, overduesSent };
  }
}

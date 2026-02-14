import { AppError } from '../../common/errors/app-error';

export type OrgRoleType = 'OWNER' | 'MANAGER' | 'AGENT' | 'VIEWER';

// ─── Task Visibility ────────────────────────────────────────
// MANAGER (OWNER/MANAGER): sees all org tasks
// AGENT (COLLAB): sees tasks where assigneeUserId=me OR tasks on leads visible to them (own + pool)
// VIEWER (ASSISTANT): sees tasks where assigneeUserId=me only

export function buildTaskVisibilityWhere(
  role: OrgRoleType,
  userId: string,
  scope: string,
): Record<string, unknown> | undefined {
  if (scope === 'my') {
    return { assigneeUserId: userId };
  }
  if (scope === 'team') {
    if (role !== 'OWNER' && role !== 'MANAGER') {
      throw new AppError('ROLE_FORBIDDEN', 403, 'Only managers can view team tasks');
    }
    return undefined; // all org tasks
  }
  // scope=lead:<id> handled separately
  if (role === 'OWNER' || role === 'MANAGER') return undefined;
  if (role === 'VIEWER') {
    return { assigneeUserId: userId };
  }
  // AGENT: own + tasks on leads they can see (own + pool)
  return {
    OR: [
      { assigneeUserId: userId },
      { lead: { OR: [{ ownerUserId: userId }, { ownerUserId: null }] } },
    ],
  };
}

export function assertTaskVisible(
  role: OrgRoleType,
  userId: string,
  task: { assigneeUserId: string | null; recordStatus: string; lead?: { ownerUserId: string | null } },
): void {
  if (task.recordStatus === 'DELETED') {
    throw new AppError('TASK_NOT_FOUND', 404, 'Task not found');
  }
  if (role === 'OWNER' || role === 'MANAGER') return;

  if (role === 'VIEWER') {
    if (task.assigneeUserId !== userId) {
      throw new AppError('TASK_NOT_FOUND', 404, 'Task not found');
    }
    return;
  }

  // AGENT: can see if assignee=me, or lead is visible (own/pool)
  if (task.assigneeUserId === userId) return;
  const leadOwner = task.lead?.ownerUserId ?? null;
  if (leadOwner === userId || leadOwner === null) return;

  throw new AppError('TASK_NOT_FOUND', 404, 'Task not found');
}

// ─── Create permission ──────────────────────────────────────
// MANAGER/AGENT: can create on accessible lead
// VIEWER: can create only assigned to self
export function assertCanCreateTask(
  role: OrgRoleType,
  userId: string,
  assigneeUserId: string | undefined | null,
): void {
  if (role === 'OWNER' || role === 'MANAGER') return;

  if (role === 'AGENT') {
    // COLLAB can only assign to themselves
    if (assigneeUserId && assigneeUserId !== userId) {
      throw new AppError('TASK_ASSIGN_FORBIDDEN', 403, 'Agents can only assign tasks to themselves');
    }
    return;
  }

  // VIEWER: must be assigned to self
  if (role === 'VIEWER') {
    if (assigneeUserId && assigneeUserId !== userId) {
      throw new AppError('TASK_ASSIGN_FORBIDDEN', 403, 'Assistants can only create tasks assigned to themselves');
    }
    return;
  }
}

// ─── Assign permission ──────────────────────────────────────
// MANAGER: assign anyone
// AGENT: assign to self only
// VIEWER: forbidden
export function assertCanAssignTask(
  role: OrgRoleType,
  userId: string,
  newAssigneeUserId: string | null | undefined,
): void {
  if (role === 'OWNER' || role === 'MANAGER') return;
  if (role === 'VIEWER') {
    throw new AppError('TASK_ASSIGN_FORBIDDEN', 403, 'Assistants cannot reassign tasks');
  }
  // AGENT: can only assign to self
  if (newAssigneeUserId && newAssigneeUserId !== userId) {
    throw new AppError('TASK_ASSIGN_FORBIDDEN', 403, 'Agents can only assign tasks to themselves');
  }
}

// ─── Update permission (field-level) ────────────────────────
// MANAGER: all fields
// AGENT: if assignee=me → all except assigneeUserId; else 404 (checked by visibility)
// VIEWER: if assignee=me → status + description only

const VIEWER_ALLOWED_TASK_FIELDS = new Set(['status', 'description']);

export function filterTaskUpdateFields(
  role: OrgRoleType,
  userId: string,
  task: { assigneeUserId: string | null },
  dto: Record<string, unknown>,
): void {
  if (role === 'OWNER' || role === 'MANAGER') return;

  if (role === 'AGENT') {
    if (task.assigneeUserId !== userId) {
      throw new AppError('TASK_NOT_FOUND', 404, 'Task not found');
    }
    const forbidden = Object.keys(dto).filter((k) => k === 'assigneeUserId');
    if (forbidden.length > 0) {
      throw new AppError('ROLE_FORBIDDEN', 403, 'Agents cannot change assignee via PATCH');
    }
    return;
  }

  // VIEWER
  if (task.assigneeUserId !== userId) {
    throw new AppError('TASK_NOT_FOUND', 404, 'Task not found');
  }
  const viewerForbidden = Object.keys(dto).filter((k) => !VIEWER_ALLOWED_TASK_FIELDS.has(k));
  if (viewerForbidden.length > 0) {
    throw new AppError('ROLE_FORBIDDEN', 403, `Assistants can only modify: ${[...VIEWER_ALLOWED_TASK_FIELDS].join(', ')}`);
  }
}

// ─── Delete permission ──────────────────────────────────────
// MANAGER: yes
// AGENT: yes if createdByUserId==me AND assigneeUserId==me
// VIEWER: no
export function assertCanDeleteTask(
  role: OrgRoleType,
  userId: string,
  task: { createdByUserId: string | null; assigneeUserId: string | null },
): void {
  if (role === 'OWNER' || role === 'MANAGER') return;
  if (role === 'VIEWER') {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Assistants cannot delete tasks');
  }
  // AGENT
  if (task.createdByUserId !== userId || task.assigneeUserId !== userId) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Can only delete tasks you created and are assigned to');
  }
}

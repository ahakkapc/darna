import { AppError } from '../common/errors/app-error';

export type OrgRoleType = 'OWNER' | 'MANAGER' | 'AGENT' | 'VIEWER';

function isManager(role: OrgRoleType): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

// ─── Event Visibility ─────────────────────────────────────────
// MANAGER: sees all org events
// AGENT/VIEWER: sees only assigneeUserId = me
//   Exception: MANAGER_ONLY visibility is still visible to assignee
export function buildEventVisibilityWhere(
  role: OrgRoleType,
  userId: string,
  assigneeFilter?: string,
): Record<string, unknown> | undefined {
  if (isManager(role)) {
    if (assigneeFilter && assigneeFilter !== 'me') {
      return { assigneeUserId: assigneeFilter };
    }
    if (assigneeFilter === 'me') {
      return { assigneeUserId: userId };
    }
    return undefined; // all org events
  }
  // AGENT/VIEWER: force own events only
  return { assigneeUserId: userId };
}

export function assertEventVisible(
  role: OrgRoleType,
  userId: string,
  event: { assigneeUserId: string; recordStatus: string },
): void {
  if (event.recordStatus === 'DELETED') {
    throw new AppError('NOT_FOUND', 404, 'Event not found');
  }
  if (isManager(role)) return;
  if (event.assigneeUserId !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Event not found');
  }
}

// ─── Create permission ────────────────────────────────────────
// MANAGER: can create for any org member
// AGENT/VIEWER: can only create assigned to self
export function assertCanCreateEvent(
  role: OrgRoleType,
  userId: string,
  assigneeUserId: string,
): void {
  if (isManager(role)) return;
  if (assigneeUserId !== userId) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'You can only create events assigned to yourself');
  }
}

// ─── Update permission ────────────────────────────────────────
// MANAGER: all fields
// AGENT/VIEWER: only if assignee=me; cannot change assignee
export function assertCanUpdateEvent(
  role: OrgRoleType,
  userId: string,
  event: { assigneeUserId: string },
  dto: Record<string, unknown>,
): void {
  if (isManager(role)) return;
  if (event.assigneeUserId !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Event not found');
  }
  if (dto.assigneeUserId !== undefined) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Only managers can change the assignee');
  }
}

// ─── Cancel / Complete permission ─────────────────────────────
export function assertCanCancelOrComplete(
  role: OrgRoleType,
  userId: string,
  event: { assigneeUserId: string },
): void {
  if (isManager(role)) return;
  if (event.assigneeUserId !== userId) {
    throw new AppError('NOT_FOUND', 404, 'Event not found');
  }
}

// ─── Delete permission ────────────────────────────────────────
// Manager only
export function assertCanDeleteEvent(role: OrgRoleType): void {
  if (!isManager(role)) {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Only managers can delete events');
  }
}

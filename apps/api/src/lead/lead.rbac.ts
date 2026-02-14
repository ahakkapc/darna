import { AppError } from '../common/errors/app-error';

export type OrgRoleType = 'OWNER' | 'MANAGER' | 'AGENT' | 'VIEWER';

// ─── Visibility ─────────────────────────────────────────────
// OWNER/MANAGER: see all org leads
// AGENT (COLLAB): see own (ownerUserId=me) + pool (ownerUserId IS NULL)
// VIEWER (ASSISTANT): same as AGENT
export function buildVisibilityWhere(
  role: OrgRoleType,
  userId: string,
): Record<string, unknown> | undefined {
  if (role === 'OWNER' || role === 'MANAGER') return undefined;
  return {
    OR: [
      { ownerUserId: userId },
      { ownerUserId: null },
    ],
  };
}

export function assertLeadVisible(
  role: OrgRoleType,
  userId: string,
  lead: { ownerUserId: string | null; recordStatus: string },
): void {
  if (lead.recordStatus === 'DELETED') {
    throw new AppError('LEAD_NOT_FOUND', 404, 'Lead not found');
  }
  if (role === 'OWNER' || role === 'MANAGER') return;
  if (lead.ownerUserId !== null && lead.ownerUserId !== userId) {
    throw new AppError('LEAD_NOT_FOUND', 404, 'Lead not found');
  }
}

// ─── PATCH field-level permissions ──────────────────────────
// OWNER/MANAGER: all fields except organizationId
// AGENT (COLLAB): status, priority, notes, nextActionAt, tags, criteria (budget*, wilaya, commune, quartier, propertyType, surfaceMin)
// VIEWER (ASSISTANT): notes, nextActionAt only

const AGENT_ALLOWED_FIELDS = new Set([
  'status',
  'priority',
  'notes',
  'nextActionAt',
  'tags',
  'budgetMin',
  'budgetMax',
  'wilaya',
  'commune',
  'quartier',
  'propertyType',
  'surfaceMin',
]);

const VIEWER_ALLOWED_FIELDS = new Set([
  'notes',
  'nextActionAt',
]);

export function filterUpdateFields(
  role: OrgRoleType,
  dto: Record<string, unknown>,
): Record<string, unknown> {
  if (role === 'OWNER' || role === 'MANAGER') return dto;

  const allowed = role === 'AGENT' ? AGENT_ALLOWED_FIELDS : VIEWER_ALLOWED_FIELDS;
  const forbidden = Object.keys(dto).filter((k) => !allowed.has(k));
  if (forbidden.length > 0) {
    throw new AppError(
      'ROLE_FORBIDDEN',
      403,
      `Role ${role} cannot modify: ${forbidden.join(', ')}`,
    );
  }
  return dto;
}

// ─── Assign permission ──────────────────────────────────────
// Only OWNER/MANAGER can assign
export function assertCanAssign(role: OrgRoleType): void {
  if (role !== 'OWNER' && role !== 'MANAGER') {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Only managers can assign leads');
  }
}

// ─── Soft-delete permission ─────────────────────────────────
// OWNER/MANAGER: yes
// AGENT: only if createdByUserId==me AND ownerUserId==me
// VIEWER: no
export function assertCanDelete(
  role: OrgRoleType,
  userId: string,
  lead: { createdByUserId: string | null; ownerUserId: string | null },
): void {
  if (role === 'OWNER' || role === 'MANAGER') return;
  if (role === 'VIEWER') {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Viewers cannot delete leads');
  }
  if (role === 'AGENT') {
    if (lead.createdByUserId !== userId || lead.ownerUserId !== userId) {
      throw new AppError('ROLE_FORBIDDEN', 403, 'Can only delete leads you created and own');
    }
    return;
  }
  throw new AppError('ROLE_FORBIDDEN', 403, 'Insufficient permissions');
}

// ─── Mark Lost/Won ──────────────────────────────────────────
// OWNER/MANAGER: yes always
// AGENT: only if visible (checked before)
// VIEWER: no
export function assertCanMarkLostWon(role: OrgRoleType): void {
  if (role === 'VIEWER') {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Viewers cannot mark leads as lost/won');
  }
}

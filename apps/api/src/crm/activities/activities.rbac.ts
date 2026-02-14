import { AppError } from '../../common/errors/app-error';

export type OrgRoleType = 'OWNER' | 'MANAGER' | 'AGENT' | 'VIEWER';

export function canCreateActivityType(role: OrgRoleType, activityType: string): boolean {
  if (role === 'OWNER' || role === 'MANAGER') return true;
  if (role === 'AGENT') return true;
  if (role === 'VIEWER') {
    return activityType === 'NOTE' || activityType === 'CALL';
  }
  return false;
}

export function assertCanUpdate(
  role: OrgRoleType,
  userId: string,
  activity: { createdByUserId: string | null; type: string; recordStatus: string },
): void {
  if (activity.recordStatus === 'DELETED') {
    throw new AppError('NOT_FOUND', 404, 'Activity not found');
  }
  if (activity.type === 'SYSTEM_EVENT') {
    throw new AppError('ACTIVITY_UPDATE_FORBIDDEN', 403, 'Cannot update SYSTEM_EVENT');
  }
  if (role === 'OWNER' || role === 'MANAGER') return;
  if (role === 'AGENT') {
    if (activity.createdByUserId !== userId) {
      throw new AppError('NOT_FOUND', 404, 'Activity not found');
    }
    return;
  }
  if (role === 'VIEWER') {
    if (activity.type !== 'NOTE' || activity.createdByUserId !== userId) {
      throw new AppError('NOT_FOUND', 404, 'Activity not found');
    }
    return;
  }
  throw new AppError('NOT_FOUND', 404, 'Activity not found');
}

export function assertCanDelete(
  role: OrgRoleType,
  userId: string,
  activity: { createdByUserId: string | null; type: string; recordStatus: string },
): void {
  if (activity.recordStatus === 'DELETED') {
    throw new AppError('NOT_FOUND', 404, 'Activity not found');
  }
  if (activity.type === 'SYSTEM_EVENT') {
    throw new AppError('ACTIVITY_DELETE_FORBIDDEN', 403, 'Cannot delete SYSTEM_EVENT');
  }
  if (role === 'VIEWER') {
    throw new AppError('ROLE_FORBIDDEN', 403, 'Viewers cannot delete activities');
  }
  if (role === 'OWNER' || role === 'MANAGER') return;
  if (role === 'AGENT') {
    if (activity.createdByUserId !== userId) {
      throw new AppError('NOT_FOUND', 404, 'Activity not found');
    }
    return;
  }
  throw new AppError('NOT_FOUND', 404, 'Activity not found');
}

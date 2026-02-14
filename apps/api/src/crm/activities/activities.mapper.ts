export interface ActivityDto {
  id: string;
  type: string;
  visibility: string;
  createdAt: string;
  happenedAt: string | null;
  plannedAt: string | null;
  direction: string | null;
  createdByUserId: string | null;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  recordStatus: string;
}

export function toActivityDto(row: any): ActivityDto {
  return {
    id: row.id,
    type: row.type,
    visibility: row.visibility,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    happenedAt: row.happenedAt instanceof Date ? row.happenedAt.toISOString() : row.happenedAt ?? null,
    plannedAt: row.plannedAt instanceof Date ? row.plannedAt.toISOString() : row.plannedAt ?? null,
    direction: row.direction ?? null,
    createdByUserId: row.createdByUserId ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    payload: row.payloadJson ?? null,
    recordStatus: row.recordStatus,
  };
}

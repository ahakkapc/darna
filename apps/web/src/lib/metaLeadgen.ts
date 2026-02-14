import { http } from './http';

export interface MetaLeadSource {
  id: string;
  organizationId: string;
  integrationId: string;
  pageId: string;
  pageName: string | null;
  formId: string;
  formName: string | null;
  isActive: boolean;
  routingStrategy: 'ROUND_ROBIN' | 'MANAGER_ASSIGN' | 'NONE';
  defaultOwnerUserId: string | null;
  fieldMappingJson: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMetaLeadSourceInput {
  integrationId: string;
  pageId: string;
  pageName?: string;
  formId: string;
  formName?: string;
  routingStrategy?: 'ROUND_ROBIN' | 'MANAGER_ASSIGN' | 'NONE';
  defaultOwnerUserId?: string;
  fieldMappingJson?: Record<string, string>;
}

export interface UpdateMetaLeadSourceInput {
  pageName?: string;
  formName?: string;
  isActive?: boolean;
  routingStrategy?: 'ROUND_ROBIN' | 'MANAGER_ASSIGN' | 'NONE';
  defaultOwnerUserId?: string;
  fieldMappingJson?: Record<string, string>;
}

export interface InboundEvent {
  id: string;
  sourceType: string;
  provider: string;
  integrationId: string | null;
  externalId: string | null;
  status: string;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMsg: string | null;
  payloadJson: Record<string, unknown> | null;
  metaJson: Record<string, unknown> | null;
  receivedAt: string;
  processedAt: string | null;
  createdAt: string;
}

export interface InboundEventsPage {
  items: InboundEvent[];
  page: { limit: number; cursor: string | null; nextCursor: string | null; hasMore: boolean };
}

export const metaLeadgenApi = {
  listSources: () =>
    http.get<{ items: MetaLeadSource[] }>('/meta/leadgen/sources'),

  getSource: (id: string) =>
    http.get<MetaLeadSource>(`/meta/leadgen/sources/${id}`),

  createSource: (data: CreateMetaLeadSourceInput) =>
    http.post<MetaLeadSource>('/meta/leadgen/sources', data),

  updateSource: (id: string, data: UpdateMetaLeadSourceInput) =>
    http.patch<MetaLeadSource>(`/meta/leadgen/sources/${id}`, data),

  triggerBackfill: (id: string) =>
    http.post<{ enqueued: boolean }>(`/meta/leadgen/sources/${id}/backfill`),

  listInboundEvents: (params?: { sourceType?: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.sourceType) qs.set('sourceType', params.sourceType);
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return http.get<InboundEventsPage>(`/integrations/inbound-events${q ? `?${q}` : ''}`);
  },

  retryInboundEvent: (id: string) =>
    http.post<void>(`/integrations/inbound-events/${id}/retry`),
};

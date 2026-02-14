import { http } from './http';

/* ─── Types ───────────────────────────────────────────── */

export interface MessageTemplate {
  id: string;
  organizationId: string;
  channel: 'WHATSAPP' | 'EMAIL';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  name: string;
  subject?: string;
  body: string;
  variablesJson?: { used: string[] };
  version: number;
  createdByUserId?: string;
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceStep {
  id: string;
  orderIndex: number;
  channel: 'WHATSAPP' | 'EMAIL';
  templateId: string;
  template?: MessageTemplate;
  delayMinutes: number;
  conditionsJson?: Array<{ key: string; params?: Record<string, unknown> }>;
  createTaskJson?: Record<string, unknown>;
  notifyJson?: Record<string, unknown>;
}

export interface MessageSequence {
  id: string;
  organizationId: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  name: string;
  description?: string;
  defaultStartDelayMinutes: number;
  stopOnReply: boolean;
  steps?: SequenceStep[];
  createdAt: string;
  updatedAt: string;
}

export interface SequenceRunStep {
  id: string;
  orderIndex: number;
  status: 'PENDING' | 'SCHEDULED' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELED';
  scheduledAt?: string;
  sentAt?: string;
  outboundJobId?: string;
  lastErrorCode?: string;
  lastErrorMsg?: string;
}

export interface SequenceRun {
  id: string;
  sequenceId: string;
  leadId: string;
  status: 'RUNNING' | 'COMPLETED' | 'CANCELED' | 'FAILED';
  startedAt: string;
  stoppedAt?: string;
  nextStepIndex: number;
  nextStepAt?: string;
  sequence?: { id: string; name: string };
  runSteps?: SequenceRunStep[];
  createdAt: string;
}

/* ─── Templates API ───────────────────────────────────── */

export const templatesApi = {
  list: (params?: { channel?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    return http.get<{ items: MessageTemplate[] }>(`/templates/messages${q ? `?${q}` : ''}`);
  },
  get: (id: string) => http.get<MessageTemplate>(`/templates/messages/${id}`),
  create: (data: { channel: string; name: string; subject?: string; body: string }) =>
    http.post<MessageTemplate>('/templates/messages', data),
  update: (id: string, data: { name?: string; subject?: string; body?: string }) =>
    http.patch<MessageTemplate>(`/templates/messages/${id}`, data),
  activate: (id: string) => http.post<MessageTemplate>(`/templates/messages/${id}/activate`),
  archive: (id: string) => http.post<MessageTemplate>(`/templates/messages/${id}/archive`),
};

/* ─── Sequences API ───────────────────────────────────── */

export const sequencesApi = {
  list: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    return http.get<{ items: MessageSequence[] }>(`/sequences${q ? `?${q}` : ''}`);
  },
  get: (id: string) => http.get<MessageSequence>(`/sequences/${id}`),
  create: (data: { name: string; description?: string; defaultStartDelayMinutes?: number; stopOnReply?: boolean }) =>
    http.post<MessageSequence>('/sequences', data),
  update: (id: string, data: { name?: string; description?: string; defaultStartDelayMinutes?: number; stopOnReply?: boolean }) =>
    http.patch<MessageSequence>(`/sequences/${id}`, data),
  activate: (id: string) => http.post<MessageSequence>(`/sequences/${id}/activate`),
  pause: (id: string) => http.post<MessageSequence>(`/sequences/${id}/pause`),
  archive: (id: string) => http.post<MessageSequence>(`/sequences/${id}/archive`),
  replaceSteps: (id: string, steps: Array<{ orderIndex: number; channel: string; templateId: string; delayMinutes: number; conditions?: unknown[]; createTaskJson?: unknown; notifyJson?: unknown }>) =>
    http.put<MessageSequence>(`/sequences/${id}/steps`, { steps }),
};

/* ─── Runs API (under /crm/leads/:id/sequences) ──────── */

export const runsApi = {
  list: (leadId: string) =>
    http.get<{ items: SequenceRun[] }>(`/crm/leads/${leadId}/sequences`),
  start: (leadId: string, sequenceId: string) =>
    http.post<SequenceRun>(`/crm/leads/${leadId}/sequences/start`, { sequenceId }),
  stop: (leadId: string, sequenceRunId: string) =>
    http.post<null>(`/crm/leads/${leadId}/sequences/stop`, { sequenceRunId }),
};

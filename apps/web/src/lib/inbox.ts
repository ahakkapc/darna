import { http } from './http';

/* ─── Types ───────────────────────────────────────────── */

export interface InboxThread {
  id: string;
  organizationId: string;
  channel: string;
  phoneHash: string;
  phoneE164?: string;
  displayName?: string;
  leadId?: string;
  listingId?: string;
  status: 'OPEN' | 'PENDING' | 'CLOSED';
  assignedToUserId?: string;
  assignedAt?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageBy?: 'CUSTOMER' | 'AGENT';
  unreadCount: number;
  lastReadAt?: string;
  unreplied: boolean;
  unrepliedSince?: string;
  integrationId?: string;
  slaBreachedAt?: string;
  slaEscalatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'RECEIVED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';
  occurredAt: string;
  providerMessageId?: string;
  bodyText?: string;
  mediaJson?: unknown;
  metaJson?: unknown;
  createdByUserId?: string;
  sentBySystem: boolean;
}

export interface LeadSummary {
  id: string;
  fullName: string;
  status: string;
  ownerUserId?: string;
  phone?: string;
}

export interface ThreadDetail {
  thread: InboxThread;
  messages: InboxMessage[];
  leadSummary: LeadSummary | null;
}

export interface CursorPage {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

/* ─── API Client ──────────────────────────────────────── */

function qs(params?: Record<string, string>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

export const inboxApi = {
  listThreads: (params?: Record<string, string>) =>
    http.get<{ items: InboxThread[]; page: CursorPage }>(`/inbox/threads${qs(params)}`),

  getThread: (id: string) =>
    http.get<ThreadDetail>(`/inbox/threads/${id}`),

  getMessages: (id: string, params?: Record<string, string>) =>
    http.get<{ items: InboxMessage[]; page: CursorPage }>(`/inbox/threads/${id}/messages${qs(params)}`),

  sendMessage: (threadId: string, text: string) =>
    http.post<{ message: InboxMessage; jobId: string }>(`/inbox/threads/${threadId}/messages`, { text }),

  assign: (threadId: string, userId: string) =>
    http.post(`/inbox/threads/${threadId}/assign`, { userId }),

  claim: (threadId: string) =>
    http.post(`/inbox/threads/${threadId}/claim`),

  markRead: (threadId: string) =>
    http.post(`/inbox/threads/${threadId}/mark-read`),

  changeStatus: (threadId: string, status: string) =>
    http.post(`/inbox/threads/${threadId}/status`, { status }),

  linkLead: (threadId: string, leadId: string) =>
    http.post(`/inbox/threads/${threadId}/link-lead`, { leadId }),

  createLead: (threadId: string, data: { fullName: string; email?: string }) =>
    http.post(`/inbox/threads/${threadId}/create-lead`, data),
};

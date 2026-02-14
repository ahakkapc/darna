export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function getOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeOrgId');
}

async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const orgId = getOrgId();
  if (orgId) headers['x-org-id'] = orgId;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  }

  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: {} }));
    const err = json.error ?? {};
    const code = err.code ?? `HTTP_${res.status}`;
    const message = err.message ?? res.statusText;
    const requestId = json.requestId ?? err.requestId;
    throw new ApiError(res.status, code, message, requestId);
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json();

  // Auto-unwrap backend { ok, data } envelope
  if (json !== null && typeof json === 'object' && 'ok' in json) {
    if (json.ok === true && 'data' in json) {
      return json.data as T;
    }
    if (json.ok === false && json.error) {
      const err = json.error;
      throw new ApiError(
        res.status,
        err.code ?? 'UNKNOWN',
        err.message ?? 'Erreur inconnue',
        json.requestId ?? err.requestId,
      );
    }
  }

  return json as T;
}

export const http = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
};

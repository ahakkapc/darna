const BASE = '/api';

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const activeOrg = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (activeOrg) {
    headers['x-org-id'] = activeOrg;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, ...body };
  }

  return res.json() as Promise<T>;
}

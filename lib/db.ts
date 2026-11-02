import 'server-only';

// Minimal Supabase (PostgREST) client over fetch. Server only: uses the service role key,
// which must never be exposed with a NEXT_PUBLIC_ prefix.

function base() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DbError('Database is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).', 503);
  return { url: url.replace(/\/+$/, ''), key };
}

export class DbError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

async function request<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { url, key } = base();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new DbError(`Database error ${res.status}: ${text.slice(0, 300)}`, res.status === 409 ? 409 : 500);
  return (text ? JSON.parse(text) : null) as T;
}

export function rpc<T>(fn: string, args: Record<string, unknown> = {}) {
  return request<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

export function select<T>(table: string, query: string) {
  return request<T[]>(`${table}?${query}`, { method: 'GET' });
}

export async function insert<T>(table: string, row: Record<string, unknown>) {
  const rows = await request<T[]>(table, { method: 'POST', body: JSON.stringify(row), prefer: 'return=representation' });
  return rows[0];
}

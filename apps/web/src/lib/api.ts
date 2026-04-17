export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

interface RequestOpts extends RequestInit {
  idempotencyKey?: string;
}

function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('jwt');
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const problem = await res.json().catch(() => ({}));
    throw new Error(problem.title ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// JSON over /api with the session token when there is one.
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

let tokenFn: () => string | null = () => null;
let onUnauthorized: () => void = () => undefined;

export function setAuth(token: () => string | null, unauthorized: () => void): void {
  tokenFn = token;
  onUnauthorized = unauthorized;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const t = init.auth === false ? null : tokenFn();
  if (t) headers.authorization = `Bearer ${t}`;
  let r: Response;
  try {
    r = await fetch('/api' + path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok) {
    if (r.status === 401 && t) onUnauthorized();
    throw new ApiError(r.status, j?.error ?? 'server');
  }
  return j as T;
}

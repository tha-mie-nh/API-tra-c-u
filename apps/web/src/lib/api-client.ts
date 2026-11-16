import type { LoginResponse } from '@shared/index';
import { getAccessToken, useAuthStore } from './auth-store';

/** Same-origin base — the Vite dev proxy (vite.config.ts) forwards `/api/*`
 * to the backend so no CORS/credentials wiring is needed in dev; the prod
 * build is served behind the same reverse proxy as the API (Phase 09). */
const API_BASE = '/api/v1';

/** One `error.details[]` entry from a 422 validation failure (Phase 05
 * `QueryService`) — `path` is a dot-joined field name, mapped back onto the
 * dynamic search form's fields in Phase 07 (features/query/query-error-message.ts). */
export interface ApiErrorDetail {
  path: string;
  message: string;
}

/** Typed error parsed from the backend's `{ error: { code, message, requestId, details? } }`
 * envelope (see reference-api-specification.md "Conventions"). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly details?: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, requestId: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error body (e.g. proxy/network failure) — fall through to generic message
  }
  const errorField =
    body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { code?: string; message?: string; requestId?: string; details?: ApiErrorDetail[] } }).error
      : undefined;
  return new ApiError(
    res.status,
    errorField?.code ?? 'ERROR',
    errorField?.message ?? res.statusText ?? 'Unexpected error',
    errorField?.requestId ?? '',
    errorField?.details,
  );
}

/** Unique per request. `crypto.randomUUID` only exists in secure contexts (https/localhost) and the app is
 * served over plain http inside the intranet, so build the id from `getRandomValues`, which is always there. */
function newRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `web-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function buildHeaders(hasBody: boolean, requestId: string): Headers {
  const headers = new Headers();
  headers.set('X-Request-Id', requestId);
  if (hasBody) headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

// Single-flight refresh: concurrent 401s share one in-flight `/auth/refresh`
// call instead of each firing their own (see phase-06 Risk Assessment).
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return null;
        const data = (await res.json()) as LoginResponse;
        useAuthStore.getState().setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      }
    })();
  }
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/** `/auth/login` and `/auth/refresh` never go through the 401 -> refresh -> retry
 * loop: a 401 there is a real credential/session failure, not an expired
 * access token, and retrying `/auth/refresh` on its own 401 would loop forever. */
function isAuthEndpoint(path: string): boolean {
  return path === '/auth/login' || path === '/auth/refresh';
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: ApiFetchOptions, allowRetry: boolean): Promise<T> {
  const hasBody = options.body !== undefined;
  const method = options.method ?? 'GET';
  const requestId = newRequestId();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: buildHeaders(hasBody, requestId),
      credentials: 'include',
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    // The request never reached (or never came back from) the server — the backend has no log line for it,
    // so the browser console is the only trace. Frontend logs warn/error only.
    console.error(`[api] network error ${method} ${path} requestId=${requestId}: ${(err as Error).message}`);
    throw err;
  }

  if (res.status === 401 && allowRetry && !isAuthEndpoint(path)) {
    console.warn(`[api] 401 on ${method} ${path} requestId=${requestId} — refreshing session and retrying once`);
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(path, options, false);
    console.error(`[api] session refresh failed after 401 on ${method} ${path} requestId=${requestId} — signing out`);
    useAuthStore.getState().clearSession();
    throw await parseError(res);
  }

  if (!res.ok) {
    const error = await parseError(res);
    console.warn(`[api] ${res.status} ${method} ${path} code=${error.code} requestId=${error.requestId || requestId}`);
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Typed fetch wrapper: attaches `Authorization`, sends credentials for the
 * refresh cookie, and single-flight-refreshes+retries once on 401. */
export function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return request<T>(path, options, true);
}

/** Binary response plus headers (e.g. `Content-Disposition` filename for CSV). */
export interface ApiBlobResult {
  blob: Blob;
  headers: Headers;
}

/**
 * Fetches a binary endpoint (image proxy `GET /query/:code/image/:recordId[/thumb]`,
 * CSV export) as a `Blob`, with the same Authorization/refresh-retry semantics
 * as `apiFetch`. A plain `<img src>` / `<a href>` cannot carry the in-memory
 * Bearer token, so images use `URL.createObjectURL(blob)` and downloads use
 * a blob link — never a raw MinIO URL (reference-config-schema.md Security).
 */
async function requestBlob(path: string, allowRetry: boolean): Promise<ApiBlobResult> {
  const res = await fetch(`${API_BASE}${path}`, { headers: buildHeaders(false, newRequestId()), credentials: 'include' });

  if (res.status === 401 && allowRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) return requestBlob(path, false);
    useAuthStore.getState().clearSession();
    throw await parseError(res);
  }

  if (!res.ok) throw await parseError(res);
  return { blob: await res.blob(), headers: res.headers };
}

export function apiFetchBlob(path: string): Promise<ApiBlobResult> {
  return requestBlob(path, true);
}

export async function apiFetchImageBlob(path: string): Promise<Blob> {
  return (await requestBlob(path, true)).blob;
}

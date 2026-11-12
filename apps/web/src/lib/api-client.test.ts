import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth-store';
import { apiFetch, apiFetchBlob, apiFetchImageBlob, ApiError } from './api-client';

/**
 * Covers phase-06 success criteria: "Concurrent 401s trigger exactly one
 * `/auth/refresh` call" + the 401 -> refresh -> retry-once -> logout flow.
 * `fetch` is mocked directly (no MSW) to keep this fast/dependency-light —
 * KISS given the small surface being tested.
 */
describe('apiFetch', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'stale-token', user: null, status: 'authenticated' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('single-flights a refresh across concurrent 401s and retries each request once', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'fresh-token', expiresIn: 900, user: {} }), {
          status: 200,
        });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      if (auth === 'Bearer stale-token') {
        return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'expired', requestId: 'r1' } }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([apiFetch('/datasources'), apiFetch('/history')]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('clears the session and rethrows when refresh itself fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) return new Response(null, { status: 401 });
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'expired', requestId: 'r1' } }),
        { status: 401 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/datasources')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('does not attempt a refresh for /auth/login 401s (real credential failure)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'bad', requestId: 'r1' } }), {
          status: 401,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiFetchBlob', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'stale-token', user: null, status: 'authenticated' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns blob + headers, retrying once after refresh on 401', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'fresh-token', expiresIn: 900, user: {} }), { status: 200 });
      }
      if (new Headers(init?.headers).get('Authorization') === 'Bearer stale-token') {
        return new Response(null, { status: 401 });
      }
      return new Response('a,b\r\n', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="x.csv"' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { blob, headers } = await apiFetchBlob('/history/export.csv?status=failed');
    expect(await blob.text()).toBe('a,b\r\n');
    expect(headers.get('Content-Disposition')).toContain('x.csv');
  });

  it('throws ApiError on non-2xx; apiFetchImageBlob still returns a plain Blob', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/bad')
          ? new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'no', requestId: 'r' } }), { status: 403 })
          : new Response('img', { status: 200 }),
      ),
    );
    await expect(apiFetchBlob('/bad')).rejects.toBeInstanceOf(ApiError);
    const blob = await apiFetchImageBlob('/query/X/image/1');
    expect(await blob.text()).toBe('img');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth-store';
import { apiFetch, ApiError } from './api-client';

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

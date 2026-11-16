import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth-store';
import { apiFetch } from './api-client';

/**
 * After a quiet spell the client probes `/health` first, so a connection silently dropped while idle is detected
 * (and discarded by the browser) in ~2.5 s instead of making the real request hang for the whole timeout.
 */
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('apiFetch idle connection probe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.setState({ accessToken: 't', user: null, status: 'authenticated' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not probe while the page is active', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/a'); // may probe once if the module was loaded long ago; reset the counter after it
    fetchMock.mockClear();
    await apiFetch('/b');
    await apiFetch('/c');
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(['/api/v1/b', '/api/v1/c']);
  });

  it('probes first after 10 s idle and goes on normally when the probe is answered', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/warm');
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(25_000);

    await apiFetch('/real');

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.endsWith('/health'))).toHaveLength(6);
    expect(urls.at(-1)).toBe('/api/v1/real');
  });

  it('aborts an unanswered probe after 2.5 s so the real request is sent on a fresh connection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) {
        // a black-holed connection: never answers, only gives up when aborted
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      return Promise.resolve(json({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/warm').catch(() => undefined);
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(25_000);

    const pending = apiFetch<{ ok: boolean }>('/real');
    await vi.advanceTimersByTimeAsync(2_500);

    await expect(pending).resolves.toEqual({ ok: true });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.endsWith('/health'))).toHaveLength(6);
    expect(urls.at(-1)).toBe('/api/v1/real'); // sent only after the unanswered probes were aborted
    expect(warn.mock.calls.some((c) => String(c[0]).includes('did not answer'))).toBe(true);
  });

  it('shares one probe between concurrent requests', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/warm');
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(25_000);

    await Promise.all([apiFetch('/x'), apiFetch('/y')]);

    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/health'))).toHaveLength(6); // one batch, not 12
  });
});

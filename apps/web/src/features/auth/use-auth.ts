import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import { vi } from '@/i18n/vi';
import * as authApi from './auth-api';

/**
 * Boot-time hydration (phase-06 step 4): on app mount, try `/auth/refresh`
 * (httpOnly cookie) -> on success `/auth/me`. This is what makes
 * reload-after-login work with zero token ever touching web storage.
 * Runs exactly once per app load (StrictMode-safe via the ref guard).
 */
export function useAuthBootstrap(): void {
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const ranRef = useRef(false);

  useEffect(() => {
    // `ranRef` (not the effect cleanup) is what makes this StrictMode-safe:
    // it persists across React 19 dev-mode's synthetic
    // mount->cleanup->remount for the same component instance, so the
    // network call only ever fires once. Deliberately NOT gating the
    // `setSession`/`clearSession` calls on a "cancelled" flag from the
    // cleanup function — that flag would already be `true` by the time the
    // fetch resolves (StrictMode's synthetic unmount runs synchronously,
    // long before an async fetch settles), silently dropping every
    // bootstrap result.
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const session = await authApi.refreshSession();
        const me = await authApi.fetchMe();
        setSession(session.accessToken, me);
      } catch {
        clearSession();
      }
    })();
  }, [setSession, clearSession]);
}

/** Login mutation logic: on success hydrates the store from `/auth/me` (the
 * login response itself has no `permissions` field). */
export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);

  return useCallback(
    async (username: string, password: string) => {
      const session = await authApi.login({ username, password });
      const me = await authApi.fetchMe();
      setSession(session.accessToken, me);
      return me;
    },
    [setSession],
  );
}

export function useLogout() {
  const clearSession = useAuthStore((state) => state.clearSession);

  return useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort: even if the network call fails, clear local state so
      // the user is not stuck "logged in" client-side.
    } finally {
      clearSession();
      toast.success(vi.auth.logoutSuccess);
    }
  }, [clearSession]);
}

/** Maps backend error codes (auth.service.ts) to Vietnamese messages. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return vi.auth.errorInvalidCredentials;
      case 'ACCOUNT_LOCKED':
        return vi.auth.errorAccountLocked;
      case 'ACCOUNT_DISABLED':
        return vi.auth.errorAccountDisabled;
      case 'RATE_LIMITED':
        return vi.auth.errorRateLimited;
      default:
        return error.message || vi.auth.errorGeneric;
    }
  }
  return vi.auth.errorGeneric;
}

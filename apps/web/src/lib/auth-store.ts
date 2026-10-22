import { create } from 'zustand';
import type { MeResponse } from '@shared/index';

/**
 * In-memory-only auth state (Zustand, no `persist` middleware — never
 * localStorage/sessionStorage). See research-02 §D: the access token must
 * live in a JS variable so XSS cannot exfiltrate a long-lived credential.
 * Reload -> `bootstrapAuth()` (features/auth/use-auth.ts) re-acquires it via
 * the httpOnly refresh cookie.
 */
export type AuthStatus = 'booting' | 'authenticated' | 'unauthenticated';

interface AuthState {
  accessToken: string | null;
  user: MeResponse | null;
  status: AuthStatus;
  setSession: (accessToken: string, user: MeResponse) => void;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  status: 'booting',
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () => set({ accessToken: null, user: null, status: 'unauthenticated' }),
  hasPermission: (code) => get().user?.permissions.includes(code) ?? false,
  hasAnyPermission: (codes) => {
    const permissions = get().user?.permissions;
    if (!permissions) return false;
    return codes.some((code) => permissions.includes(code));
  },
}));

/** Non-reactive accessor for use outside React components (api-client.ts). */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

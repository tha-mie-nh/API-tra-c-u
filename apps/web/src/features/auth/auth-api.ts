import type { LoginResponse, MeResponse } from '@shared/index';
import { apiFetch } from '@/lib/api-client';

export interface LoginPayload {
  username: string;
  password: string;
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: payload });
}

/** Re-acquires an access token from the httpOnly refresh cookie (boot-time hydration). */
export function refreshSession(): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/refresh', { method: 'POST' });
}

export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/me');
}

export function logout(): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/auth/logout', { method: 'POST' });
}

export interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword: string;
}

export function changePassword(payload: ChangePasswordPayload): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/auth/change-password', { method: 'POST', body: payload });
}

/** Self-service "forgot password" — always resolves `{success:true}` regardless of
 * whether the username exists (backend never reveals account existence). */
export function requestPasswordReset(username: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/auth/forgot-password', { method: 'POST', body: { username } });
}

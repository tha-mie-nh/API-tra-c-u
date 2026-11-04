import type { QueryClient } from '@tanstack/react-query';
import type { AdminDatasource, DatasourceEnvRefs } from '@shared/index';
import { apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { fetchMe } from '@/features/auth/auth-api';

/** `GET /admin/datasources` (phase-02 real contract — see phase-02's
 * "Implementation Notes (post-completion)"). */
export function fetchAdminDatasources(): Promise<AdminDatasource[]> {
  return apiFetch<AdminDatasource[]>('/admin/datasources');
}

/** `GET /admin/datasources/env-refs` — env var NAMES only, never values. */
export function fetchDatasourceEnvRefs(): Promise<DatasourceEnvRefs> {
  return apiFetch<DatasourceEnvRefs>('/admin/datasources/env-refs');
}

export interface DatasourceEntryPayload {
  code: string;
  name: string;
  description?: string;
  type: 'info' | 'image';
  enabled: boolean;
  transport: unknown;
  input: unknown;
  output: unknown;
  limits?: { maxResults: number; pageSize: number };
}

export function createAdminDatasource(payload: DatasourceEntryPayload): Promise<AdminDatasource> {
  return apiFetch<AdminDatasource>('/admin/datasources', { method: 'POST', body: payload });
}

export function updateAdminDatasource(code: string, payload: DatasourceEntryPayload): Promise<AdminDatasource> {
  return apiFetch<AdminDatasource>(`/admin/datasources/${code}`, { method: 'PUT', body: payload });
}

export function setAdminDatasourceEnabled(code: string, enabled: boolean): Promise<AdminDatasource> {
  return apiFetch<AdminDatasource>(`/admin/datasources/${code}/enabled`, { method: 'PATCH', body: { enabled } });
}

export function deleteAdminDatasource(code: string): Promise<{ code: string }> {
  return apiFetch<{ code: string }>(`/admin/datasources/${code}`, { method: 'DELETE' });
}

/**
 * phase-03 Requirements: "After any mutation: invalidate
 * ['admin-datasources'], ['datasources'], and refetch /auth/me" — a write
 * may grant/revoke the matching `api:*` permission to ADMIN (Phase 02's
 * permission-sync), so the sidebar/route-guards need the fresh permission
 * set without waiting for a full page reload.
 */
export async function syncAfterDatasourceMutation(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-datasources'] }),
    queryClient.invalidateQueries({ queryKey: ['datasources'] }),
  ]);
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) return;
  const me = await fetchMe();
  useAuthStore.getState().setSession(accessToken, me);
}

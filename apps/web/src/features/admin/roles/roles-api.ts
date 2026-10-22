import type { AdminRole, PermissionCatalogItem, SetRolePermissionsResult } from '@shared/index';
import { apiFetch } from '@/lib/api-client';

/** `GET /admin/roles` (reference-api-specification.md "Admin", spec c). */
export function fetchRoles(): Promise<AdminRole[]> {
  return apiFetch<AdminRole[]>('/admin/roles');
}

export function fetchRole(id: string): Promise<AdminRole> {
  return apiFetch<AdminRole>(`/admin/roles/${id}`);
}

export interface CreateRolePayload {
  code: string;
  name: string;
  description?: string;
}

export function createRole(payload: CreateRolePayload): Promise<AdminRole> {
  return apiFetch<AdminRole>('/admin/roles', { method: 'POST', body: payload });
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
}

export function updateRole(id: string, payload: UpdateRolePayload): Promise<AdminRole> {
  return apiFetch<AdminRole>(`/admin/roles/${id}`, { method: 'PATCH', body: payload });
}

export function deleteRole(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/admin/roles/${id}`, { method: 'DELETE' });
}

export function setRolePermissions(id: string, permissionCodes: string[]): Promise<SetRolePermissionsResult> {
  return apiFetch<SetRolePermissionsResult>(`/admin/roles/${id}/permissions`, {
    method: 'PUT',
    body: { permissionCodes },
  });
}

/** `GET /admin/permissions` — full catalog, incl. `api:*` codes auto-synced
 * from `config.json` (Phase 04). */
export function fetchPermissionCatalog(): Promise<PermissionCatalogItem[]> {
  return apiFetch<PermissionCatalogItem[]>('/admin/permissions');
}

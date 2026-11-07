import type {
  AdminUser,
  AdminUsersListResponse,
  ApprovePasswordResetRequestResult,
  CreateUserResult,
  PasswordResetRequestItem,
  ResetPasswordResult,
  SetUserRolesResult,
} from '@shared/index';
import { apiFetch } from '@/lib/api-client';

export interface UsersListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildQueryString(params: UsersListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** `GET /admin/users` (reference-api-specification.md "Admin", spec b). */
export function fetchUsers(params: UsersListParams): Promise<AdminUsersListResponse> {
  return apiFetch<AdminUsersListResponse>(`/admin/users${buildQueryString(params)}`);
}

export interface CreateUserPayload {
  username: string;
  fullName: string;
  email?: string;
  roleIds?: string[];
}

export function createUser(payload: CreateUserPayload): Promise<CreateUserResult> {
  return apiFetch<CreateUserResult>('/admin/users', { method: 'POST', body: payload });
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
}

export function updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: payload });
}

export function lockUser(id: string): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/admin/users/${id}/lock`, { method: 'POST' });
}

export function unlockUser(id: string): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/admin/users/${id}/unlock`, { method: 'POST' });
}

export function resetUserPassword(id: string): Promise<ResetPasswordResult> {
  return apiFetch<ResetPasswordResult>(`/admin/users/${id}/reset-password`, { method: 'POST' });
}

export function setUserRoles(id: string, roleIds: string[]): Promise<SetUserRolesResult> {
  return apiFetch<SetUserRolesResult>(`/admin/users/${id}/roles`, { method: 'PUT', body: { roleIds } });
}

/** Soft-delete (sets status DISABLED, revokes sessions) — never a real
 * DELETE FROM users, see users.service.ts. */
export function deleteUser(id: string): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/admin/users/${id}`, { method: 'DELETE' });
}

/** `GET /admin/users/password-reset-requests` — self-service "forgot password" requests awaiting admin action. */
export function fetchPasswordResetRequests(): Promise<PasswordResetRequestItem[]> {
  return apiFetch<PasswordResetRequestItem[]>('/admin/users/password-reset-requests');
}

export function approvePasswordResetRequest(id: string): Promise<ApprovePasswordResetRequestResult> {
  return apiFetch<ApprovePasswordResetRequestResult>(`/admin/users/password-reset-requests/${id}/approve`, {
    method: 'POST',
  });
}

export function rejectPasswordResetRequest(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/admin/users/password-reset-requests/${id}/reject`, { method: 'POST' });
}

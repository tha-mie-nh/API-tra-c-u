/**
 * Phase 08 — types shared between `apps/api` (Users/Roles/Permissions/
 * AuditLogs controllers, `apps/users/roles`) and `apps/web` (admin screens:
 * `reference-api-specification.md` "Admin" section). Field names mirror the
 * Prisma models 1:1 (`UsersService.list/findOne`, `RolesService.list/findOne`)
 * — see `user-view.util.ts`/`roles.service.ts` for the (additive-only) server
 * projection that populates the optional `roles`/`permissionCodes` fields.
 */

export type UserStatusValue = 'ACTIVE' | 'LOCKED' | 'DISABLED';

export interface AdminUserRole {
  id: string;
  code: string;
  name: string;
}

/** One row from `GET/POST /admin/users[/:id]` (never carries a password hash). */
export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  status: UserStatusValue;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  /** Present when the endpoint eager-loads role assignments (list + detail). */
  roles?: AdminUserRole[];
}

export interface AdminUsersListResponse {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

/** `POST /admin/users` and `POST /admin/users/:id/reset-password` responses —
 * the temp password is returned exactly once and must never be persisted
 * client-side beyond the confirmation dialog's local state. */
export interface CreateUserResult {
  user: AdminUser;
  tempPassword: string;
}

export interface ResetPasswordResult {
  tempPassword: string;
}

export type PasswordResetRequestStatusValue = 'PENDING' | 'APPROVED' | 'REJECTED';

/** One row from `GET /admin/users/password-reset-requests` — a user
 * self-submitted "I forgot my password" request awaiting admin action
 * (no email flow; see login page comment). */
export interface PasswordResetRequestItem {
  id: string;
  userId: string;
  username: string;
  status: PasswordResetRequestStatusValue;
  requestedAt: string;
  resolvedAt: string | null;
}

/** `POST /admin/users/password-reset-requests/:id/approve` response — same
 * one-time temp-password shape as `ResetPasswordResult`, plus the username
 * so the admin UI can show "for user X" without a second lookup. */
export interface ApprovePasswordResetRequestResult {
  username: string;
  tempPassword: string;
}

export interface SetUserRolesResult {
  id: string;
  roleIds: string[];
}

export type PermissionKindValue = 'API' | 'FEATURE';

/** One row of the full catalog from `GET /admin/permissions` — `API` kind
 * codes are auto-synced from `config.json` (Phase 04), never hand-maintained. */
export interface PermissionCatalogItem {
  id: string;
  code: string;
  name: string;
  kind: PermissionKindValue;
  createdAt: string;
}

/** One row from `GET/POST /admin/roles[/:id]`. */
export interface AdminRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  /** Present when the endpoint eager-loads the permission grant set (list + detail). */
  permissionCodes?: string[];
}

export interface SetRolePermissionsResult {
  id: string;
  permissionCodes: string[];
}

/**
 * Phase 02 (admin datasource config live reload): `GET/POST/PUT/PATCH
 * /admin/datasources[...]` response shape. Mirrors `DatasourceEntry`
 * (`@app/shared/datasource-config.types`) exactly — includes `transport`
 * (no secret VALUES, only env var NAMES, same as the file on disk) — plus
 * `envStatus`, which the admin write path derives at response time (never
 * stored) so the UI can show "env var set?" without ever seeing a value.
 */
export interface DatasourceEnvStatus {
  /** `true` when every referenced `*Env`/`auth.valueEnv` name has a non-empty `process.env` value on THIS instance. */
  apiKeyEnvSet: boolean | null;
  baseUrlEnvSet: boolean | null;
}

/** `GET/POST/PUT/PATCH /admin/datasources[/:code]` response — same shape as
 * `DatasourceEntry` (server projection, config holds no secret values) plus
 * `envStatus`. Declared structurally (not `DatasourceEntry & {...}`) to
 * avoid a cross-file type import cycle between `admin-types.ts` and
 * `datasource-config.types.ts`; field names must stay in sync by hand. */
export interface AdminDatasource {
  code: string;
  name: string;
  description?: string;
  type: 'info' | 'image';
  enabled: boolean;
  permissionCode: string;
  transport: unknown;
  input: unknown;
  output: unknown;
  limits?: { maxResults: number; pageSize: number };
  envStatus: DatasourceEnvStatus;
}

/** `GET /admin/datasources/env-refs` — env var NAMES only, matching the
 * admin-write naming policy suffixes (`*_API_KEY`/`*_BASE_URL`); values are
 * never returned. Lets the web form offer a picker instead of free text. */
export interface DatasourceEnvRefs {
  apiKeyEnvNames: string[];
  baseUrlEnvNames: string[];
}

/** One row from `GET /admin/audit-logs` (spec g: before/after diff, read-only). */
export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogsListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

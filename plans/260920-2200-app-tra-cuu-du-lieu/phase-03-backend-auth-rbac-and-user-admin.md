# Giai đoạn 03 — Auth, RBAC & Admin User/Role Backend

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-api-specification.md](reference-api-specification.md) · [reference-database-erd.md](reference-database-erd.md)
- [research/researcher-01-backend-stack-and-rbac.md](research/researcher-01-backend-stack-and-rbac.md) (auth libs)
- [research/researcher-02-config-driven-ui-and-minio-images.md](research/researcher-02-config-driven-ui-and-minio-images.md) (§D token storage)

## Tổng quan
- **Priority:** P1
- **Status:** completed
- **Effort:** 14h
- Login/logout/refresh, một global permission guard duy nhất, và full admin surface cho managing
  users & roles — every mutation audited. Covers spec (a) đăng nhập/đăng xuất, (b) admin rights,
  (c) phân quyền, và (g) rule *"Backend kiểm tra authentication và permission cho mọi request"*.

## Nhận định chính
- **Một enforcement point.** Một global `PermissionGuard` + `@RequirePermission()` decorator. Routes không bao giờ
  check permissions inline. Bất cứ thứ gì không được explicitly marked `@Public()` được authenticated by default —
  deny-by-default, nên quên decorator fails closed, not open.
- **Token model** (từ research §D): access token trong memory, 15 min TTL, không bao giờ trong localStorage;
  refresh token trong `httpOnly; Secure; SameSite=Strict` cookie, rotated trên mỗi use.
- **Admin lock propagation:** `/auth/refresh` re-reads `users.status` và rejects nếu không `ACTIVE`, cộng với
  locking deletes user's `refresh_tokens` rows. Worst-case locked user giữ working cho một access-token TTL (≤15 min). Điều đó chấp nhận được cho internal tool — Redis denylist cho instant revocation **không** được build (YAGNI) nếu không có compliance requirement.
- Audit logging là một **Interceptor**, không code sprinkled trong mỗi service — NestJS's natural fit cho một
  cross-cutting "log mỗi admin mutation" requirement (spec g).

## Yêu cầu
**Functional**
- Login rejects non-`ACTIVE` users với distinguishable (nhưng non-enumerating) error.
- Failed-login counter → auto-lock sau N attempts (`locked_until`), riêng biệt từ admin lock.
- Bắt buộc đổi mật khẩu khi `must_change_password`.
- `GET /auth/me` trả về effective permission codes (union qua user's roles).
- Admin: create / edit / lock / unlock / assign roles / reset password (spec b). Role CRUD + permission assignment.

**Non-functional:** argon2id hashing; rate limit trên `/auth/login`; mỗi admin mutation viết `audit_logs`.

## Kiến trúc
```
apps/api/src/
├── auth/            AuthController, AuthService, JwtStrategy, token-service (issue/rotate/revoke)
├── rbac/            PermissionGuard (global), @RequirePermission(), @Public(),
│                    PermissionResolverService (user → effective permission codes, request-scoped cache)
├── users/           admin user CRUD, lock/unlock, reset-password, role assignment
├── roles/           role CRUD, role→permission assignment, permission catalog
└── audit/           AuditInterceptor, AuditService (before/after diff writer)
```
Request flow: `JwtAuthGuard` (global) → `PermissionGuard` (global, reads route metadata) → controller →
`AuditInterceptor` viết `audit_logs` khi thành công của mutating admin route.

## File code liên quan
**Create:**
`apps/api/src/auth/{auth.module,auth.controller,auth.service,token.service,jwt.strategy}.ts`,
`apps/api/src/auth/dto/*.ts`,
`apps/api/src/rbac/{rbac.module,permission.guard,permission.decorator,public.decorator,permission-resolver.service}.ts`,
`apps/api/src/users/{users.module,users.controller,users.service}.ts` + dto,
`apps/api/src/roles/{roles.module,roles.controller,roles.service}.ts` + dto,
`apps/api/src/audit/{audit.module,audit.service,audit.interceptor}.ts`,
`packages/shared/src/auth-types.ts` (`MeResponse`, `LoginResponse`),
tests: `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/rbac.e2e-spec.ts`.
**Modify:** `apps/api/src/app.module.ts` (register global guards/interceptor), `.env.example` (JWT secrets, TTLs, lockout thresholds).

## Các bước triển khai
1. Cài đặt `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2`, `@nestjs/throttler`, `cookie-parser`, `zod`.
2. `TokenService`: ký access JWT (`sub`, `username`, 15m); tạo refresh token = random 32 bytes, lưu SHA-256 trong `refresh_tokens`, set cookie; `rotate()` revokes old + issues new; `revokeAllForUser()`.
3. `AuthService.login`: lookup by username → verify argon2 → check `status`/`locked_until` → reset `failed_login_count` → issue tokens → update `last_login_at`. On failure increment counter và auto-lock quá threshold. **Constant-ish response time & generic message** để tránh username enumeration.
4. `AuthService.refresh`: hash token nhận từ cookie → tìm row chưa bị thu hồi, chưa hết hạn → **re-check `users.status === ACTIVE`** → xoay vòng token. Không tìm thấy → 401.
5. `logout`: thu hồi refresh token hiện tại, xóa cookie.
6. `changePassword`: verify current password (hoặc allow khi `must_change_password`), set new hash, clear flag, `revokeAllForUser` except current session.
7. `JwtStrategy` + global `JwtAuthGuard` honoring `@Public()`.
8. `PermissionResolverService`: `userId → Set<permissionCode>` via `user_roles → role_permissions → permissions`. Cache per-request chỉ (không cross-request cache — permission changes phải take effect ngay).
9. `PermissionGuard` (global, registered sau JwtAuthGuard): reads `@RequirePermission('admin:users')` metadata; missing metadata trên non-public route ⇒ **deny** (fail-closed). Denials trả về 403 `FORBIDDEN_API`.
10. `UsersService`: list (paginated/searchable), create, update, lock (cũng `revokeAllForUser`), unlock, `resetPassword` (generate strong temp password, trả về **một lần**, set `must_change_password`), `setRoles` (replace set).
11. `RolesService`: CRUD (block delete khi `is_system`), `setPermissions`, `listPermissions` (catalog incl. `api:*` synced by Giai đoạn 04).
12. `AuditService.record({actor, action, targetType, targetId, before, after})` — **strips `password_hash` và bất kỳ key nào match `/password|token|secret/i`** từ cả hai diffs. `AuditInterceptor` applies nó tới `/admin/*` mutations.
13. Throttle `/auth/login` (ví dụ 10/min/IP) via `@nestjs/throttler`.
14. Validation: Zod schemas via `ZodValidationPipe` cho tất cả DTOs (same pipe Giai đoạn 04 reuses cho dynamic schemas — DRY).
15. Tests (e2e, real Postgres via compose — **không DB mocking**): login happy/locked/wrong-password/auto-lock; refresh rotation + reuse rejection; locked-user refresh rejected; permission guard allow/deny; admin lock kills sessions; audit row viết với password fields stripped.

## Danh sách việc cần làm
- [x] Install auth deps
- [x] `TokenService` (issue / rotate / revoke / revokeAll)
- [x] `AuthService` login + lockout counter + `last_login_at`
- [x] `refresh` with status re-check + rotation; `logout`
- [x] `changePassword` + forced-change flow
- [x] `JwtStrategy` + global `JwtAuthGuard` + `@Public()`
- [x] `PermissionResolverService` + `GET /auth/me` effective permissions
- [x] Global fail-closed `PermissionGuard` + `@RequirePermission()`
- [x] Users admin: CRUD, lock/unlock, reset-password, setRoles
- [x] Roles admin: CRUD, setPermissions, permission catalog
- [x] `AuditService` + `AuditInterceptor` with secret stripping
- [x] Login rate limiting
- [x] `ZodValidationPipe` (shared with Phase 04)
- [x] e2e tests incl. lock-kills-session and audit-strips-secrets

## Tiêu chí hoàn thành
- Mỗi non-`@Public()` route yêu cầu valid token **và** declared permission; route không có `@RequirePermission()` trả về 403, proving fail-closed.
- Admin locks user → user's next refresh fails; access token dừng working trong its TTL.
- `GET /auth/me` permission list chính xác match union của user's role permissions.
- Mỗi admin mutation tạo `audit_logs` row; không row chứa hash, token hoặc password.
- Reset-password trả về temp password chính xác một lần và forces change ở next login.
- e2e suite xanh chống lại real Postgres.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Route mới silently ships mà không permission check | Fail-closed guard + e2e test that enumerates tất cả registered routes và asserts mỗi cái là `@Public()` hoặc có `@RequirePermission()`. Rẻ, catches whole class. |
| Refresh-token reuse / theft | Rotation trên mỗi use; detect reuse của already-revoked token → revoke whole family và force re-login. |
| Username enumeration via login errors/timing | Single generic error message; luôn chạy argon2 verify (chống dummy hash) thậm chí khi user không tồn tại. |
| Locked user active lên đến 15 min | Accepted, documented. Shorten access TTL nếu leader objects; chỉ khi đó consider denylist. |
| Over-building auth (OAuth, SSO, email flows) | Out of scope — spec nói admin-managed accounts chỉ. |

## Cân nhắc bảo mật
- argon2id, default-strong params. Temp passwords từ CSPRNG, ≥16 chars.
- JWT secret từ env, ≥32 bytes, separate secret cho access vs refresh. Không secret trong config.json hoặc git.
- Cookies: `httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`. Vì `SameSite=Strict` + custom `Authorization` header được sử dụng cho state-changing calls, separate CSRF token không được yêu cầu; document reasoning này hơn là để nó implicit.
- CORS: explicit allow-list của web origin, `credentials: true`. Không bao giờ `*`.
- Helmet, `trust proxy` cấu hình cho TLS terminator, HSTS (spec g: HTTPS).
- Denials (`status='denied'`) được logged — permission rejection là security-relevant signal.

## Bước tiếp theo
Mở khóa Giai đoạn 05 (query/history reuse guard) và Giai đoạn 06 (FE auth flow).
Chạy song song với Giai đoạn 04 — disjoint files.

## Câu hỏi chưa giải quyết
- Password policy (min length, complexity, expiry) — không trong spec. Proposing min 12 chars, không forced rotation. Xác nhận với Egor.
- Auto-lock threshold + duration — proposing 5 attempts / 15 min. Xác nhận.
- Có company SSO/LDAP mà nên replace local accounts sau? Sẽ change giai đoạn này substantially.
- "user thường" có get `history:view_own` by default, hay phải admin grant? Spec (f) nói *"nếu được cấp quyền"* → defaulting to explicitly granted. Xác nhận.

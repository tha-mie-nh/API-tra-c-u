# Tham khảo: Backend API Specification

> Spec (h) yêu cầu một API specification doc. Đây là nó. Phases 03/05 implement nó.
> Base path `/api/v1`. **All traffic HTTPS** (spec g). All responses JSON.
> Mỗi endpoint ngoài `/auth/login` và `/health` yêu cầu một valid access token
> **và** một explicit permission check (spec g: *Backend kiểm tra authentication và permission cho mọi request*).

## Quy ước

- Auth: `Authorization: Bearer <accessToken>`; refresh token trong `httpOnly; Secure; SameSite=Strict` cookie.
- Errors: `{ "error": { "code": "FORBIDDEN_API", "message": "...", "requestId": "..." } }`
- Codes: `UNAUTHENTICATED` 401, `FORBIDDEN_API` 403, `VALIDATION_ERROR` 422, `UPSTREAM_ERROR` 502, `UPSTREAM_TIMEOUT` 504, `RATE_LIMITED` 429.
- Mỗi response carries `X-Request-Id`; same id stored trong `query_logs`/`audit_logs` cho traceability.

## Xác thực (Auth)

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | body `{username,password}`. Rejects `status != active`. Increments `failed_login_count`; auto-locks after N. Returns access token + sets refresh cookie. |
| POST | `/auth/refresh` | valid refresh cookie | Rotates refresh token. Fails immediately if user locked/disabled → **this is the lock-propagation mechanism**. |
| POST | `/auth/logout` | authenticated | Revokes current refresh token. |
| GET | `/auth/me` | authenticated | Returns profile + **effective permission codes** — FE uses this to hide features. |
| POST | `/auth/change-password` | authenticated | Required when `must_change_password`. |

## Datasource (dạng đã lọc theo config)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/datasources` | authenticated | Returns **only datasources the caller has `api:*` permission for**, in client projection (no `transport`, no `internal` fields). Drives the whole dynamic FE. |
| GET | `/datasources/:code` | `api:<code>` | Full client projection incl. input field definitions for form rendering. |

## Tra cứu (Query)

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/query/:code` | `api:<code>` | Body = `{ params: {...}, page, pageSize }`. Validates `params` against config input schema. Calls upstream via adapter. Returns unified envelope (see `reference-config-schema.md`). **Always writes a `query_logs` row**, including on denial/failure. |
| GET | `/query/:code/image/:recordId` | `api:<code>` | Serves one image. Re-checks permission, then streams from MinIO (or redirects to short-TTL presigned URL — decided in Phase 05). Never exposes MinIO credentials. |
| GET | `/query/:code/image/:recordId/thumb` | `api:<code>` | Thumbnail variant for the photo timeline grid. |

Guardrails on `/query/:code`: per-user rate limit, `pageSize <= limits.pageSize`, total capped at `limits.maxResults` (spec g), upstream timeout + bounded retry.

## Lịch sử (spec e, f)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/history` | `history:view_own` or `history:view_all` | If caller only has `view_own`, `user_id` filter is **forced** to caller server-side — cannot be overridden by query param. Filters: `userId`, `datasourceCode`, `from`, `to`, `status`. Paginated. |
| GET | `/history/:id` | same + ownership check | Detail of one lookup: params (masked), record count, status, upstream request id, duration. |
| GET | `/history/export` | `history:view_all` | CSV export. Optional — build only if asked (YAGNI). |

## Quản trị (spec b)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET/POST | `/admin/users` | `admin:users` | List (paginated, searchable) / create. |
| GET/PATCH | `/admin/users/:id` | `admin:users` | Read / update profile. |
| POST | `/admin/users/:id/lock` · `/unlock` | `admin:users` | Lock revokes all refresh tokens immediately. |
| POST | `/admin/users/:id/reset-password` | `admin:users` | Sets temp password + `must_change_password=true`. Temp password returned once, never stored plain, never emailed unless SMTP configured. |
| PUT | `/admin/users/:id/roles` | `admin:users` | Replace role set. |
| GET/POST/PATCH/DELETE | `/admin/roles` | `admin:roles` | Role CRUD; cannot delete `is_system`. |
| PUT | `/admin/roles/:id/permissions` | `admin:roles` | Assign permission codes (incl. `api:*` from config). |
| GET | `/admin/permissions` | `admin:roles` | Full catalog, auto-synced from config.json. |
| GET | `/admin/audit-logs` | `admin:audit` | Filterable admin-action log. |

**Every** `/admin/*` mutation writes an `audit_logs` row with before/after diff (spec g).

## Vận hành (Ops)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness. Public. No internal detail leaked. |
| GET | `/health/ready` | Readiness: DB + MinIO + config loaded OK. |

## Quy tắc chốt quyền (invariant quan trọng nhất)

Có exactly **một** enforcement point: một global guard/dependency resolve caller's
effective permission set và compare nó tới route's declared requirement. Routes bao giờ không check
permissions ad hoc. Cho `/query/:code` và image routes required permission là **derived từ
`:code` path param** chống lại `config.json`, nên newly added datasource automatically
protected mà không touching any route code.

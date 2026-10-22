# Giai đoạn 02 — Database Schema, Migrations & Seed

## Liên kết ngữ cảnh
- [plan.md](plan.md) · **[reference-database-erd.md](reference-database-erd.md)** (spec cho giai đoạn này)
- [reference-config-schema.md](reference-config-schema.md) (mã quyền suy ra từ đây)

## Tổng quan
- **Priority:** P1
- **Status:** completed
- **Effort:** 6h
- Triển khai ERD trong Prisma, tạo initial migration, seed roles/permissions/bootstrap admin.
  Thỏa mãn spec (h) *"Database và ERD"*.

## Nhận định chính
- **Một Postgres cho ứng dụng** (users, roles, history, audit). **Image DB là một Postgres riêng biệt, bên ngoài,
  read-only** được sở hữu bởi data team — KHÔNG đưa bảng của nó vào Prisma schema hoặc migrations của chúng tôi.
  Giai đoạn 04 nói chuyện với nó qua plain `pg` connection được định nghĩa trong config, không bao giờ thông qua Prisma.
- `permissions` rows được **auto-synced từ `config.json` khi khởi động**, không hand-maintained. Thêm một
  datasource vào config không được yêu cầu migration hoặc manual INSERT. Chỉ seed các *feature*
  permissions (`history:view_own`, `history:view_all`, `admin:users`, `admin:roles`, `admin:audit`).
- `query_logs.username_snapshot` là deliberate denormalization: spec (f) cho phép admin duyệt history
  vô thời hạn, và history phải vẫn có thể đọc được sau khi user row thay đổi hoặc biến mất.

## Yêu cầu
**Functional:** mọi bảng trong ERD tồn tại với FKs + indexes đúng; `pnpm db:seed` là idempotent.
**Non-functional:** migrations là reviewable SQL, forward-only, runnable trong CI và trong deploy container.

## Kiến trúc
Các bảng (danh sách cột đầy đủ trong `reference-database-erd.md`): `users`, `roles`, `permissions`,
`user_roles`, `role_permissions`, `refresh_tokens`, `query_logs`, `audit_logs`.
Schema `app`. Tất cả PKs `uuid` (`gen_random_uuid()`, cần `pgcrypto`). Tất cả timestamps `timestamptz`, **UTC**.

## File code liên quan
**Create:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`,
`apps/api/prisma/seed.ts`, `apps/api/src/prisma/prisma.module.ts`, `apps/api/src/prisma/prisma.service.ts`,
`packages/shared/src/permission-codes.ts`.
**Modify:** root `package.json` (add `db:migrate`, `db:seed`, `db:studio`), `.env.example` (`DATABASE_URL`, `BOOTSTRAP_ADMIN_PASSWORD`).

## Các bước triển khai
1. Thêm `prisma` + `@prisma/client`. Configure `datasource db` (postgresql) + `schema = "app"`; enable `pgcrypto` thông qua migration SQL.
2. Viết `schema.prisma` transcribing ERD chính xác: enums `UserStatus{ACTIVE,LOCKED,DISABLED}`, `QueryStatus{SUCCESS,FAILED,DENIED}`, `PermissionKind{API,FEATURE}`.
3. Model các join tables (`user_roles`, `role_permissions`) một cách rõ ràng với composite PKs + audit columns (`granted_at`, `granted_by`) — không implicit m-n relations, vì chúng tôi cần các columns này.
4. Thêm tất cả indexes từ ERD doc (bao gồm partial index trên active refresh tokens).
5. `prisma migrate dev --name init` → **review generated SQL bằng tay** trước khi committing.
6. `PrismaService` extending `PrismaClient` với `onModuleInit` connect + graceful shutdown hook.
7. `packages/shared/src/permission-codes.ts`: xuất feature permission constants + một `apiPermissionCode(datasourceCode)` helper (`api:${code.toLowerCase()}`). Cả api và web import cái này — single source of truth.
8. `seed.ts` (idempotent, `upsert` chỉ):
   - feature permissions
   - roles `ADMIN` (is_system, all feature perms), `OPERATOR` (`history:view_own`), `AUDITOR` (`history:view_all`)
   - một bootstrap admin user; password từ `BOOTSTRAP_ADMIN_PASSWORD` env, argon2id hashed, `must_change_password = true`. **Abort với clear error nếu env var không set** — không bao giờ fallback to default password.
9. Thêm một `pnpm db:reset` dev helper (drop + migrate + seed) cho local work.
10. Xác minh: migrate trên clean DB, seed hai lần (second run phải là no-op), inspect với Prisma Studio.

## Danh sách việc cần làm
- [x] Install Prisma, configure datasource + `app` schema + pgcrypto
- [x] Transcribe ERD into `schema.prisma` (8 tables + 3 enums)
- [x] Model tường minh các bảng join kèm cột audit
- [x] Đủ toàn bộ index theo doc ERD
- [x] Generate + hand-review `init` migration
- [x] `PrismaService` + module
- [x] `permission-codes.ts` in shared package
- [x] Seed idempotent (quyền, 3 role, bootstrap admin từ env)
- [x] `db:migrate` / `db:seed` / `db:reset` scripts
- [x] Verify clean migrate + double-seed idempotency

## Tiêu chí hoàn thành
- `pnpm db:migrate && pnpm db:seed` trên empty DB thành công; re-running seed không thay đổi gì.
- Tất cả ERD tables/indexes hiện tại (verify qua `\d app.*`).
- Bootstrap admin có thể tìm thấy và `password_hash` của nó là argon2id (`$argon2id$` prefix), `must_change_password = true`.
- Seed fails loudly khi `BOOTSTRAP_ADMIN_PASSWORD` không có.
- `pnpm typecheck` sạch với generated Prisma client.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Real image DB schema chưa biết → temptation để model nó ở đây | Rõ ràng out of scope. Giai đoạn 04 mocks nó trong **riêng biệt** database/schema. Giữ migrations của chúng tôi free của nó nên không có gì phá vỡ khi real one đến. |
| Permission codes drifting giữa config.json và DB | Boot-time sync (Giai đoạn 04) + `permission-codes.ts` shared constant. Không bao giờ type permission string literal trong controller. |
| Prisma `schema` (multi-schema) preview-feature friction | Nếu `multiSchema` chứng tỏ awkward, fall back to default `public` schema — cosmetic, quyết định ở step 1 và don't churn. |
| Over-modelling (thêm tables "chúng tôi sẽ cần sau") | YAGNI: 8 tables chỉ. Không `settings`, không `notifications`, không soft-delete cho đến khi yêu cầu yêu cầu nó. |

## Cân nhắc bảo mật
- Passwords: **argon2id chỉ**, không bao giờ MD5/SHA/bcrypt-with-low-cost. Hash được tạo bởi `argon2` lib với default params.
- `refresh_tokens.token_hash` lưu trữ SHA-256 của token — raw token không bao giờ hit DB.
- `audit_logs.before/after` phải **không bao giờ** chứa `password_hash`; strip nó trong audit writer (Giai đoạn 03).
- `query_logs.query_params` lưu trữ masked values cho fields được flag `sensitive` trong config (ví dụ CCCD → `001****1234`).
- Không có PII từ upstream API *results* được persist — chỉ query conditions và record count (spec e). Điều này là deliberate và giữ app ngoài scope cho bulk-PII retention.

## Bước tiếp theo
Mở khóa Giai đoạn 03 (auth/RBAC cần những bảng này) và Giai đoạn 05 (history writes).
Giai đoạn 04 có thể đã chạy song song — nó không phụ thuộc vào giai đoạn này.

## Câu hỏi chưa giải quyết
- Chi tiết kết nối + tên bảng/cột thực tế của **external image Postgres** — cần bởi Giai đoạn 04 cho real adapter. Hỏi Egor.
- Retention policy cho `query_logs` / `audit_logs` (giữ mãi? purge sau N tháng?). Giả định mãi cho đến khi được nói khác; purge job là trivial để thêm sau.

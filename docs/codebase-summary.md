# Tổng quan codebase — APP Tra cứu dữ liệu

Tài liệu này gom lại "bức tranh toàn cảnh" cho người mới vào dự án, không cần đọc hết
`plans/260920-2200-app-tra-cuu-du-lieu/` ngay. Muốn đào sâu 1 phần nào, link chi tiết ở cuối mỗi mục.

## 1. Dự án này làm gì

Cổng tra cứu dữ liệu công dân **nội bộ** (~50 người dùng): đăng nhập, tra cứu qua nhiều nguồn dữ
liệu khác nhau (CCCD, hộ chiếu, GPLX, ảnh...), xem kết quả dạng timeline, admin quản lý
user/vai trò/quyền, mọi thao tác đều có audit log.

**Ý tưởng thiết kế quan trọng nhất:** hệ thống là **config-driven** — input/output field của mỗi
nguồn dữ liệu nằm trong 1 file `config/config.json` độc lập. Thêm 1 nguồn tra cứu mới = thêm 1
đoạn JSON, **không phải sửa code**. Đây là lý do kiến trúc trông "generic" hơn bình thường — đừng
ngạc nhiên khi không thấy field `citizenId`/`fullName` hardcode ở đâu trong code xử lý query.

## 2. Stack công nghệ

| Layer | Công nghệ |
|---|---|
| Backend | NestJS 11 (Node/TypeScript), Prisma ORM, Postgres 16 |
| Validation | AJV (validate `config.json` lúc boot) + Zod (validate input động theo config, dựng runtime) |
| Frontend | React 19 + TypeScript + Vite, Tailwind, shadcn/ui, TanStack Query/Table |
| Monorepo | pnpm workspaces: `apps/api`, `apps/web`, `packages/shared` |

## 3. Cấu trúc thư mục

```
apps/api/src/
  auth/          Login, JWT (access token 15' in-memory + refresh cookie), forgot-password
  rbac/          Guard/decorator chốt quyền (permission.guard.ts — điểm enforce DUY NHẤT)
  users/         Admin CRUD user, lock/unlock, reset password, password-reset-requests
  roles/         Admin CRUD role + gán permission
  datasources/   Đọc + validate config.json, adapter factory, registry (xem mục 4)
  admin-datasources/  ADMIN CRUD `config.json` qua giao diện — ghi atomic (tmp + `.bak` +
                       rename) rồi reload registry trong tiến trình (zero-downtime, zero
                       restart); `POST /admin/datasources/reload` nạp lại từ đĩa (hand-edit)
  query/         POST /query/:code — chạy 1 lượt tra cứu qua datasource
  history/       Lịch sử tra cứu (query_logs)
  audit/         Audit log admin actions (@AuditAction decorator + interceptor)
  prisma/        PrismaService wrapper
  health/        /health, /health/ready

apps/web/src/
  features/
    auth/            Login, forgot-password, change-password
    query/            Form động + hiển thị kết quả (dynamic-form/, results/)
    datasources/      Menu tra cứu (list theo quyền)
    history/          Trang lịch sử tra cứu
    admin/            users/, roles/, audit/
  components/ui/      shadcn/ui components
  routes/              react-router, RequireAuth/RequirePermission

packages/shared/src/    Type dùng chung FE+BE: datasource-config.types.ts (DSL config.json),
                        query-envelope.types.ts (response chuẩn), admin-types.ts, auth-types.ts,
                        permission-codes.ts (hằng số quyền feature)

config/
  config.json           Định nghĩa MỌI datasource (xem mục 4) — sửa file này KHÔNG cần rebuild
  config.schema.json     JSON Schema validate config.json lúc boot
  mock-data/             Dữ liệu giả cho các datasource đang chạy mock
```

## 4. Cơ chế config-driven (đọc kỹ mục này trước khi sửa bất kỳ datasource nào)

Mỗi datasource là 1 entry trong `config/config.json`, gồm:

- `code` — khóa bất biến, join key với `permissions.code` (`api:<code lowercase>`) và
  `query_logs.datasource_code`. **Không đổi sau khi đã chạy.**
- `type` — `"info"` (bảng dữ liệu) hoặc `"image"` (ảnh)
- `transport.kind` — cách gọi ra ngoài lấy dữ liệu:
  - `"mock"` — đọc từ file JSON tĩnh trong `config/mock-data/` (dùng khi chưa có API thật)
  - `"http"` — gọi API thật (base URL/key đọc từ biến môi trường qua `${VAR}`, không hardcode secret)
- `input.fields` — field trên form tra cứu, kèm `mapTo` (tên field khi gửi lên upstream)
- `input.requireGroups` — validate kiểu "cần đủ nhóm A HOẶC đủ nhóm B" (vd: số hộ chiếu HOẶC
  đủ cả họ tên+ngày sinh+giới tính)
- `output.fields` — field hiển thị kết quả, kèm `from` (tên field trong response upstream),
  `valueMap` (map mã → nhãn), `sensitive` (che trong log), `internal` (không gửi ra FE),
  `type: "image"` (hiển thị base64 trực tiếp dạng thumbnail)

**Luồng xử lý 1 request:** `POST /query/:code` → `DatasourceRegistryService` tra config theo
`code` → validate `params` bằng Zod schema build động từ `input.fields` → gọi đúng adapter theo
`transport.kind` (`AdapterFactory`) → `ResponseMapperService` map response thô thành envelope
chuẩn (nhóm theo `identityField`, sort theo `timestampField`) → luôn ghi 1 dòng `query_logs`.

Đọc chi tiết đầy đủ DSL: [`plans/260920-2200-app-tra-cuu-du-lieu/reference-config-schema.md`](../plans/260920-2200-app-tra-cuu-du-lieu/reference-config-schema.md).

**Sửa `config.json` không cần restart:** `DatasourceConfigLoaderService` build snapshot
`{config, secrets, configDir}` bất biến; `DatasourceRegistryService` dựng `Map` mới rồi gán đè
bằng 1 phép assign tham chiếu (không có consumer nào giữ ref cũ, mọi nơi đọc qua
`registry.get()` theo từng request). Trigger reload có 2 đường: (a) ADMIN tạo/sửa/bật-tắt/xóa
qua `admin-datasources/` — dry-run toàn bộ (AJV + cross-field + resolve secret + dựng adapter)
trên bản nháp trong RAM trước, chỉ ghi file khi pass hết, rồi mới swap registry; (b)
`POST /admin/datasources/reload` nạp lại đúng những gì đang có trên đĩa (dành cho hand-edit SSH
trực tiếp). Quyền ADMIN-only: `admin:datasources` (seed tự cấp cho role ADMIN). Chi tiết vận
hành: [`docs/deployment-guide.md`](./deployment-guide.md) mục "Quản lý nguồn dữ liệu trên giao
diện quản trị".

### 4 datasource đang bật (+ 8 đã tắt)

| Nhóm | Code | Ghi chú |
|---|---|---|
| API thật (theo `spec upstream`, mock cho tới khi có base URL/token) | `IMMIGRATION_HISTORY`, `PASSPORT_INFO`, `DRIVER_LICENSE`, `FACE_PHOTO` | Field mapping khớp 100% tài liệu — chỉ cần đổi `transport.kind` sang `"http"` khi có API thật |

Đã `enabled: false` (2026-09-30) — vẫn còn nguyên trong `config.json`/`mock-data/`, bật lại được bất kỳ lúc nào nếu cần minh họa kiến trúc adapter generic: `CITIZEN_BASIC`, `CITIZEN_EXTENDED`, `CITIZEN_RESIDENCE`, `CITIZEN_PHOTO` (MinIO thật), `CCCD_HISTORY`, `VEHICLE_OWNERSHIP`, `FAMILY_EVENTS`, `XUAT_NHAP_CANH` (demo cũ trùng domain với `IMMIGRATION_HISTORY`).

## 5. Auth & RBAC

- Login: `POST /auth/login` → access token (JWT, sống 15 phút, giữ in-memory ở FE, **không** localStorage)
  + refresh token (httpOnly/Secure/SameSite cookie).
- **Một điểm chốt quyền duy nhất**: `PermissionGuard` — so quyền hiệu lực của user với quyền route
  yêu cầu. Route `/query/:code` và `/datasources/:code` suy ra quyền cần từ chính `:code`
  (`api:<code>`), nên thêm datasource mới **tự động được bảo vệ**, không phải sửa route nào.
- Role mặc định: `ADMIN` (mọi quyền, không xóa được), `OPERATOR` (quyền API + xem lịch sử của mình),
  `AUDITOR` (xem toàn bộ lịch sử, không có quyền API nào).
- Quyền loại `api:*` **tự động đồng bộ** từ `config.json` lúc boot (`PermissionSyncService`) — thêm
  datasource không cần insert tay vào DB.
- **Quên mật khẩu** (không qua email — app nội bộ, admin toàn quyền quyết định): user tự gửi yêu cầu
  từ `/quen-mat-khau` → admin duyệt/từ chối trong **Quản trị → Người dùng** → duyệt thì cấp mật khẩu
  tạm 1 lần.

Danh sách endpoint đầy đủ: [`plans/260920-2200-app-tra-cuu-du-lieu/reference-api-specification.md`](../plans/260920-2200-app-tra-cuu-du-lieu/reference-api-specification.md).

## 6. Database (Postgres, schema `app`)

| Bảng | Vai trò |
|---|---|
| `users`, `roles`, `permissions`, `user_roles`, `role_permissions` | RBAC |
| `refresh_tokens` | Thu hồi phiên đăng nhập nhanh khi admin khóa user |
| `query_logs` | Lịch sử mỗi lượt tra cứu — lưu tham số **thật** (không che), che chỉ áp dụng lúc đọc tùy quyền `history:view_sensitive` của người xem |
| `audit_logs` | Nhật ký thao tác admin (before/after diff) |
| `password_reset_requests` | Yêu cầu quên mật khẩu chờ duyệt |

`citizen_photos` (metadata ảnh MinIO) là DB **ngoài**, chỉ đọc, không thuộc schema `app`.

Sơ đồ ERD đầy đủ: [`plans/260920-2200-app-tra-cuu-du-lieu/reference-database-erd.md`](../plans/260920-2200-app-tra-cuu-du-lieu/reference-database-erd.md).

## 7. Tài liệu liên quan

| Muốn biết... | Đọc |
|---|---|
| Port cố định, cách start dev/prod | [`docs/running-the-project.md`](./running-the-project.md) |
| Kịch bản demo từng feature | [`docs/demo-guide.md`](./demo-guide.md) |
| Deploy, backup/restore, rollback | [`docs/deployment-guide.md`](./deployment-guide.md) |
| Checklist bảo mật | [`docs/security-checklist.md`](./security-checklist.md) |
| Toàn bộ thiết kế gốc + quyết định kiến trúc | [`plans/260920-2200-app-tra-cuu-du-lieu/`](../plans/260920-2200-app-tra-cuu-du-lieu/) |

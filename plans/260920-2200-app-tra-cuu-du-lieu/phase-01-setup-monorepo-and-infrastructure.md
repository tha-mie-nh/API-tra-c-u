# Giai đoạn 01 — Monorepo + Lưới cơ sở hạ tầng

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-config-schema.md](reference-config-schema.md)
- [research/researcher-01-backend-stack-and-rbac.md](research/researcher-01-backend-stack-and-rbac.md)

## Tổng quan
- **Priority:** P1 (chặn tất cả)
- **Status:** completed (2026-09-20)
- **Effort:** 6h
- Tạo repo từ không có gì: pnpm monorepo (NestJS api + Vite React web + shared types package),
  local Postgres + MinIO qua Docker Compose, tooling, env handling. Không có business logic.

## Nhận định chính
- Thư mục làm việc là **trống và không phải repo git** — `git init` theo nghĩa đen là step 1.
- Monorepo được chọn cụ thể để `packages/shared` có thể chứa config DSL types + response
  envelope types được sử dụng bởi CẢ api và web. Shared package đó là phần thưởng của việc chọn NestJS;
  không được bỏ qua nó.
- `config/config.json` nằm ở repo root, **bên ngoài** `apps/api`, vì spec (g) gọi nó là
  *"file config.json độc lập"* và ops phải có thể mount/override nó trong Docker mà không rebuild.

## Yêu cầu
**Functional:** `pnpm dev` bắt đầu api + web + Postgres + MinIO; `pnpm build` tạo ra cả hai artifacts.
**Non-functional:** Node 20 LTS; TypeScript strict ở mọi nơi; lint + format wired; `.env` không bao giờ committed.

## Kiến trúc
```
Project_app_API/
├── apps/
│   ├── api/                 # NestJS 11
│   └── web/                 # Vite + React 19 + TS
├── packages/
│   └── shared/              # datasource-config types, API envelope types, permission codes
├── config/
│   ├── config.json          # datasource definitions (Giai đoạn 04 điền)
│   └── config.schema.json   # JSON Schema xác thực config.json khi khởi động
├── docker/
│   ├── api.Dockerfile
│   └── web.Dockerfile
├── docker-compose.yml       # postgres + minio + api + web (dev)
├── .env.example
└── docs/
```

## File code liên quan
**Create:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`,
`.editorconfig`, `eslint.config.mjs`, `.prettierrc`, `docker-compose.yml`,
`apps/api/*` (nest scaffold), `apps/web/*` (vite scaffold), `packages/shared/src/index.ts`,
`config/config.schema.json` (placeholder), `README.md`.
**Modify / Delete:** không có.

## Các bước triển khai
1. `git init`; tạo `.gitignore` bao gồm `node_modules`, `dist`, `.env*` (cho phép `.env.example`), `*.log`, `minio-data/`.
2. Root `package.json` + `pnpm-workspace.yaml` với `apps/*`, `packages/*`. Thêm scripts: `dev`, `build`, `lint`, `test`, `typecheck`.
3. `tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess: true`, path alias `@shared/*` → `packages/shared/src/*`.
4. Scaffold `apps/api` với Nest CLI; bỏ controller sample. Thêm `@nestjs/config` đọc env + đường dẫn `config/config.json` gốc từ `APP_CONFIG_PATH`.
5. Scaffold `apps/web` với `pnpm create vite -- --template react-ts`. Thêm Tailwind + shadcn/ui init.
6. Tạo `packages/shared` xuất (trống bây giờ) các types `DatasourceConfig`, `QueryEnvelope`, `PermissionCode` — được điền ở Giai đoạn 04/05.
7. `docker-compose.yml`: `postgres:16-alpine` (named volume), `minio/minio` (console + api ports, named volume), cộng với api/web services cho dev. Healthchecks trên cả hai stateful services.
8. `.env.example` với mọi var mà hệ thống sẽ cần — DB URL, JWT secrets, MinIO creds, `BOOTSTRAP_ADMIN_PASSWORD`, upstream API base URLs/keys placeholders, `APP_CONFIG_PATH`.
9. ESLint + Prettier flat config chia sẻ qua workspaces. Husky pre-commit chạy `lint` + `typecheck` (rẻ; tests chạy pre-push).
10. Minimal CI (`.github/workflows/ci.yml`): install → lint → typecheck → build → test.
11. Viết `README.md`: ứng dụng là gì, cách chạy nó locally, bảng env var.
12. Xác minh: `pnpm install && pnpm typecheck && pnpm build` sạch; `docker compose up -d postgres minio` healthy; MinIO console reachable.

## Danh sách việc cần làm
- [x] `git init` + `.gitignore`
- [x] pnpm workspace root + tsconfig.base + scripts
- [x] Scaffold `apps/api` (NestJS 11)
- [x] Scaffold `apps/web` (Vite React TS + Tailwind + shadcn/ui)
- [x] Tạo `packages/shared` kèm alias gắn vào cả 2 app
- [x] `docker-compose.yml` with Postgres + MinIO + healthchecks
- [x] `.env.example` (full var list) + `@nestjs/config` loading
- [x] ESLint/Prettier/Husky
- [x] CI workflow
- [x] README
- [x] Verify build + compose up clean

## Tiêu chí hoàn thành
- Fresh clone + `pnpm install` + `docker compose up -d` + `pnpm dev` → api phản hồi trên `/api/v1/health`, web tải.
- `pnpm typecheck` và `pnpm lint` exit 0. CI xanh.
- Một type xuất từ `packages/shared` có thể import từ **cả hai** `apps/api` và `apps/web`.
- `git status` không hiển thị `.env` hoặc tệp chứa secret.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| pnpm workspace + Nest build phân giải `@shared/*` tại runtime là một footgun cổ điển | Xác minh shared-type import biên dịch AND chạy trong api dev server trước khi đóng giai đoạn; ưu tiên `tsconfig` paths + Nest's `tsconfig-paths` plugin. |
| MinIO image/tag churn phá vỡ compose | Pin exact image tags, không `:latest`. |
| Over-scaffolding (unused libs "just in case") | YAGNI: thêm dependency chỉ khi giai đoạn cần nó. |

## Cân nhắc bảo mật
- `.env` trong `.gitignore` từ commit đầu tiên — không bao giờ là fix sau này (spec: không credentials trong git).
- MinIO/Postgres creds mặc định chỉ trong `.env.example` như obvious placeholders, không bao giờ real values.
- `config/config.json` chứa **chỉ env var names**, không bao giờ secret values (xem reference-config-schema).

## Bước tiếp theo
Mở khóa Giai đoạn 02 (migrations cần api app + DB) và Giai đoạn 04 (config engine cần `config/`).
Giai đoạn 02→03 và 04 có thể tiến hành song song.

## Câu hỏi chưa giải quyết
- Tiêu chuẩn ops công ty (K8s? plain Docker host? existing registry?) chưa biết — ảnh hưởng Giai đoạn 09 chỉ, không phải giai đoạn này.
- Node 20 vs 22 LTS — mặc định là 20; xác nhận với ops.

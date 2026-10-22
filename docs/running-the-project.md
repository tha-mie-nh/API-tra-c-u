# Chạy dự án — Port cố định & cách start

Nguồn sự thật duy nhất cho port: `.env` (dev) / `.env.prod` (prod). Không hardcode port
rải rác trong code — `apps/api/src/main.ts` đọc `PORT`, `apps/web/vite.config.ts` đọc
`WEB_PORT`/`API_PORT` từ file `.env` ở **repo root** (không phải `apps/web/.env`).

## Port cố định

### Dev (`pnpm dev`, chạy trực tiếp trên máy, không qua Docker)

| Service | Port | Biến env | Ghi chú |
|---|---|---|---|
| Web (Vite) | **5173** | `WEB_PORT` | `strictPort: true` — nếu bị chiếm, Vite **báo lỗi và thoát**, không tự nhảy sang port khác |
| API (NestJS) | **3000** | `PORT` (hoặc `API_PORT`, cùng giá trị) | |
| Postgres | **55432** | `POSTGRES_PORT` | map ra host qua `docker-compose.yml`, container nội bộ vẫn `5432` |
| MinIO API | **59000** | `MINIO_API_PORT` | |
| MinIO Console | **59001** | `MINIO_CONSOLE_PORT` | |

### Prod (`docker-compose.prod.yml`)

| Service | Port ra ngoài host | Port nội bộ container | Ghi chú |
|---|---|---|---|
| Web (nginx) | **80** (`WEB_PORT`) | 8080 | Điểm vào **duy nhất** từ bên ngoài — phục vụ SPA, reverse-proxy `/api/v1/*` sang `api` |
| API | *(không expose)* | 3000 | Chỉ `web` gọi vào qua network nội bộ Docker |
| Postgres | *(không expose)* | 5432 | Cố ý không map ra host — bảo mật |
| MinIO | *(không expose)* | 9000 | Cố ý không map ra host — bảo mật |

→ Trên prod, **luôn truy cập qua `http://<IP-server>`** (vd `http://localhost` nếu chạy nội bộ),
không có port lẻ nào khác cần nhớ. Không còn Caddy/TLS riêng (đã bỏ để đơn giản hóa — xem
`docs/deployment-guide.md` mục "Về HTTPS" để biết TLS nên đến từ đâu nếu cần).

## Cách start — Dev

```bash
# 1. Hạ tầng (chỉ cần chạy 1 lần, hoặc khi máy khởi động lại)
docker compose up -d postgres minio

# 2. API + Web (song song, có live-reload cả 2 chiều)
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1/health

**Live-reload:** sửa code ở `apps/web` → Vite HMR áp dụng ngay. Sửa code ở `apps/api` →
`nest start --watch` tự rebuild + restart (vài giây), không cần thao tác gì thêm.

**Nếu port bị báo "đã sử dụng"** (`EADDRINUSE` hoặc Vite `strictPort` báo lỗi):

```bash
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill   # web
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill   # api
```

**Nếu API báo `Cannot find module dist/main`** (hiếm, bug cache TypeScript cũ đã fix bằng
`deleteOutDir: false` trong `apps/api/nest-cli.json`, nhưng nếu tái diễn):

```bash
rm -f apps/api/tsconfig.tsbuildinfo apps/api/tsconfig.build.tsbuildinfo
pnpm --filter api run build
```

## Cách start — Prod

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Thứ tự tự động: `postgres`/`minio` healthy → `migrate` chạy `prisma migrate deploy` → `api`
start → `web` (nginx) start cuối, chỉ lên khi `api` healthy.

**Sau khi thêm migration mới hoặc sửa `config/config.json`:**

```bash
# Chỉ sửa config.json (bind-mount read-only, không cần rebuild image):
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api

# Có migration mới / sửa code TypeScript (cần rebuild image):
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

**Gán quyền cho role ADMIN sau khi có datasource/permission mới** (idempotent, chạy lại an toàn):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -w /repo/apps/api api \
  sh -c 'PATH="/repo/apps/api/node_modules/.bin:$PATH" node node_modules/prisma/build/index.js db seed --schema=prisma/schema.prisma'
```

**Backup trước khi đổi bất cứ gì trên prod:**

```bash
./scripts/backup-postgres.sh 14
```

**Nếu `web` bị "Exited" và prod không truy cập được** (WSL2/Docker Desktop thỉnh thoảng có bug
container tự restart thất bại tạm thời, không liên quan code/config) — kiểm tra
`docker inspect <container> --format '{{json .State}}'` để xác nhận, rồi khởi động lại riêng
service đó:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod rm -f web
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d web
```

Hướng dẫn triển khai đầy đủ cho người chưa biết gì về dự án (kể cả người ngoài team, không cần
đọc file này): xem [`docs/deployment-guide.md`](./deployment-guide.md).

## Kiểm tra nhanh cả 2 môi trường đang chạy

```bash
curl -sf http://localhost:3000/api/v1/health && echo " <- dev API OK"
curl -sf http://localhost:5173 >/dev/null && echo "dev WEB OK"
curl -sf http://localhost/api/v1/health && echo " <- prod API OK (qua web/nginx)"
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

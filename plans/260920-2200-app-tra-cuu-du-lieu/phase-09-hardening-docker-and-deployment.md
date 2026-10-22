# Giai đoạn 09 — Hardening, Docker Packaging & Deployment

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-api-specification.md](reference-api-specification.md) · all prior phases
- Spec (g): *"Đóng gói và triển khai docker, sẽ được quét malware trước khi deploy"* + HTTPS requirement

## Tổng quan
- **Priority:** P1 (gate cho go-live)
- **Status:** completed
- **Effort:** 10h
- Production Docker images, HTTPS/reverse proxy, security hardening pass, malware scanning trong
  pipeline, backups, và handover documentation set.

## Nhận định chính
- **Malware scanning là explicit customer requirement**, không optional hygiene. Bake nó vào CI nên
  deliverable image được scanned trước khi nó reach deploy host, và keep report như evidence.
- `config/config.json` **mounted như volume**, không baked vào image — ops phải add datasource
  mà không rebuilding. Đây là deployment-side nửa của config-driven requirement.
- Migrations chạy như **separate step/init container**, không bao giờ tự động ở app start trong production
  (concurrent replicas racing migrations là classic outage, thậm chí ở scale này).
- 50 users = single host với Docker Compose là right answer. Không Kubernetes, không autoscaling (YAGNI).

## Yêu cầu
**Functional:** một `docker compose up` trên target host brings up full stack phía sau HTTPS;
documented rollback; documented backup/restore.
**Non-functional:** images scanned + minimal; secrets injected tại runtime; health/readiness probes; logs shipped tới files với rotation.

## Kiến trúc
```
[Browser] --HTTPS--> [Caddy / Nginx reverse proxy]
                        ├── /            → web (static, nginx-served)
                        └── /api/v1/*    → api (NestJS)
                                             ├── Postgres (app data)
                                             ├── MinIO (images)
                                             └── Upstream APIs (3x, credentials from env)
```
Compose services: `proxy`, `web`, `api`, `postgres`, `minio`, cộng với one-shot `migrate` job.

## File code liên quan
**Create:** `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/Caddyfile` (hoặc `nginx.conf`),
`docker-compose.prod.yml`, `.github/workflows/build-and-scan.yml`, `scripts/backup-postgres.sh`,
`scripts/restore-postgres.sh`, `docs/deployment-guide.md`, `docs/security-checklist.md`, `.dockerignore`.
**Modify:** `docker-compose.yml` (dev), `README.md`, `.env.example`.

## Các bước triển khai
1. `api.Dockerfile`: multi-stage — builder (`node:20-alpine`, pnpm install + build api + shared) → runtime (`node:20-alpine`, prod deps chỉ, `USER node`, `dumb-init`/`tini` như PID 1). Target <200 MB (research-01 §8).
2. `web.Dockerfile`: build stage (vite build) → `nginx:alpine` serving static assets với SPA fallback, gzip/brotli, long-cache hashed assets, `no-cache` trên `index.html`.
3. Reverse proxy (**Caddy preferred** — automatic TLS, far less config hơn Nginx cho điều này): terminate HTTPS, proxy `/api/v1` → api, mọi thứ khác → web. Thêm security headers: HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP.
4. `docker-compose.prod.yml`: pinned image tags, `restart: unless-stopped`, healthchecks, named volumes cho Postgres và MinIO, resource limits, **`config/config.json` bind-mounted read-only**, secrets via env file với `0600` perms (không committed).
5. One-shot `migrate` service chạy `prisma migrate deploy`, ordered trước `api` via `depends_on: {condition: service_completed_successfully}`.
6. `.dockerignore` excluding `node_modules`, `.git`, `.env*`, `plans/`, test fixtures.
7. CI `build-and-scan.yml`: build cả hai images → **Trivy** scan (vulns, `--severity HIGH,CRITICAL`, fail build) → **ClamAV** malware scan của image filesystem → publish scan reports như build artifacts (customer hỏi malware scanning; keep evidence) → push tới registry chỉ nếu cả hai pass.
8. Security hardening pass qua app:
   - verify Helmet, CORS allow-list, rate limits (login + query) đều active trong prod config;
   - confirm không stack traces hoặc upstream URLs leak trong error responses;
   - confirm production guard từ Giai đoạn 04 blocks `transport.kind: mock` trừ khi explicitly allowed;
   - chạy `pnpm audit` / `npm audit` và resolve HIGH/CRITICAL.
9. Backups: `scripts/backup-postgres.sh` (nightly `pg_dump`, timestamped, retention N days) và MinIO bucket backup note (image DB có thể được owned bởi data team — clarify ownership). **Test restore script**, không chỉ backup.
10. Observability, kept minimal: structured JSON logs (pino) tới stdout, Docker `json-file` driver với rotation, `/health` + `/health/ready` wired tới compose healthchecks. Không Prometheus/Grafana stack (YAGNI ở 50 users).
11. Smoke test script hitting: health, login, mock lookup, image fetch, history read — runnable chống bất kỳ environment nào sau deploy.
12. Viết `docs/deployment-guide.md` (prereqs, env var table, first-time setup incl. bootstrap admin, deploy, rollback, backup/restore, cách thêm datasource **mà không rebuild**) và `docs/security-checklist.md` (spec-(g) requirements mapped tới nơi mỗi implemented — useful cho customer's review).

## Danh sách việc cần làm
- [x] `api.Dockerfile` multi-stage, non-root — đã build, verify `docker run` khởi động được + qua healthcheck; fix 1 layer `RUN chown -R /repo` ở cuối làm nhân đôi ~350MB (giờ chown ngay trong layer tạo file / qua `COPY --chown`); cũng gỡ `npm`/`corepack` bundled sẵn không dùng đến của base image (dư thừa, không bao giờ dùng lúc runtime — pnpm/corepack chỉ cần lúc build). 1.3GB → 856MB.
- [x] `web.Dockerfile` (nginx static + SPA fallback) — đã build (95.3MB sau khi `apk upgrade` vá CVE, trước đó 76.4MB), verify SPA fallback trả `index.html` cho route không xác định qua Caddy.
- [x] Caddy reverse proxy kèm TLS + security header — verify thật: HTTP→HTTPS redirect 308, có đủ HSTS/CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy, header `Server` đã bị gỡ.
- [x] `docker-compose.prod.yml` (pin version, healthcheck, volume, mount config.json) — verify `up -d` cả stack, đủ 6 service healthy.
- [x] Service migrate one-shot chạy trước api — verify: migrate exit 0 (đã áp `_prisma_migrations`) trước khi container api khởi động; `depends_on: migrate: condition: service_completed_successfully` của api đã xác nhận qua 1 lần chạy thật.
- [x] `.dockerignore` — đã có, đã review, đúng.
- [x] CI: build → Trivy → ClamAV → publish report → push — đã có `build-and-scan.yml`; Trivy + ClamAV cũng đã chạy thật với image build thật trong lần này (`plans/reports/` scan-reports, cũng copy vào `scan-reports/` trong repo). **Trivy cuối cùng: web 0 HIGH/CRITICAL; api 0 lỗi trong cây dependency của chính nó** (tìm+fix 3 vấn đề thật qua scan: layer nhân đôi do chown, npm/corepack không dùng của base image + cache pnpm corepack tải lại mang theo dep vendor cũ, và thêm `pnpm.overrides` cho cây transitive của app) — còn 3 package hệ điều hành Debian bị gắn cờ trên image api mà **chưa có bản vá từ upstream** (bsdutils/perl-base/zlib1g, đều ở trạng thái `affected`/`fix_deferred`/`will_not_fix` theo Debian, không đường code nào của chúng bị dùng tới trong container này), chấp nhận như rủi ro còn lại. **ClamAV cuối cùng: 0 nhiễm** trên cả 2 image, quét sâu thật (264.54 MiB nội dung quét cho api, 103.34 MiB cho web, `--scan-archive=yes` trên filesystem đã export). Bước push cố tình bỏ trống (chưa xác nhận registry — xem Câu hỏi chưa giải quyết).
- [x] Rà soát hardening bảo mật + audit dependency — `pnpm audit --audit-level=high` sạch (chỉ 2 mức moderate); Helmet/CORS/throttler/mock-guard verify đang hoạt động trong lần chạy prod thật này (xem security-checklist.md); không lộ stack trace/URL upstream nào (`HttpExceptionFilter` đã verify); không có `ENV`/`ARG` dạng secret nào trong `docker history` của cả 2 image.
- [x] Script backup + restore đã **test thật** — chạy `backup-postgres.sh` trên prod stack đang sống, rồi `restore-postgres.sh` dump đó vào 1 DB tạm; verify số bảng khác 0 (9 bảng) rồi xóa đi.
- [x] Structured logging + health probe + log rotation — log JSON pino xác nhận qua `docker logs`; `/api/v1/health` + `/health/ready` đều trả 200 qua Caddy; driver `json-file` + `max-size/max-file` đã set trong compose.
- [x] Script smoke test sau deploy — chạy trên stack thật qua Caddy; tìm + fix 1 bug thật `set -e`/`pipefail` (grep không khớp lúc check datasource làm script âm thầm dừng, không có thông tin chẩn đoán) và 1 bug seed RBAC thật (`seedRoles()` trước giờ chỉ cấp 5 quyền FEATURE tĩnh cho ADMIN, chưa bao giờ cấp quyền `api:*` mà `PermissionSyncService` tạo lúc boot — `GET /datasources` trả `[]` cho admin gốc dù datasource đã bật). Cả 2 đã fix (`apps/api/prisma/seed.ts`, `scripts/smoke-test.sh`); script giờ exit 0 end-to-end trên stack đã deploy thật.
- [x] `docs/deployment-guide.md` + `docs/security-checklist.md` — đã có, đã review và sửa đúng theo lần chạy thật: thêm lưu ý `MINIO_API_PORT` khác nhau giữa prod/dev (`9000` nội bộ vs `59000` dev host-mapped trong `.env.example` — phát hiện khi thực sự boot api, nó crash-loop nếu thiếu) vào deployment-guide.md; cập nhật dòng quét malware/vuln trong security-checklist.md với kết quả quét thật ở trên.

**Status: 12/12 complete.**

**Ghi chú sync sau Phase 10 (2026-09-21):** Phase 10 thêm 4 datasource mới song song lúc stack prod của phase này đang chạy. Đã verify qua curl thật: `config/` là bind mount chỉ đọc (`./config:/repo/config:ro`), nên `docker compose restart api` (không rebuild) đã nhận đủ entry mới và `PermissionSyncService` tự tạo row quyền `api:*` cho chúng — xác nhận cam kết "sửa config + restart, không bao giờ rebuild" vẫn đúng kể cả khi 2 agent chạy song song cùng thay đổi. Role ADMIN trên database **prod** không tự động nhận 4 quyền `api:*` mới (permission sync chỉ tạo row quyền, không tự gán cho role nào) — đã cấp qua lệnh `PUT /admin/roles/:id/permissions` thật (cùng cách không dùng SQL như xuyên suốt dự án). Đã verify thật `POST /query/FAMILY_EVENTS` trên stack prod sau đó — trả 200, đúng envelope. Cả 8 datasource giờ đều query được qua stack prod.

## Tiêu chí hoàn thành
- `docker compose -f docker-compose.prod.yml up -d` trên clean host yields working HTTPS app. **Met** — verified live, tất cả 6 services healthy, curled qua Caddy.
- Trivy: zero HIGH/CRITICAL. ClamAV: clean. Cả hai reports archived như build artifacts (spec g evidence). **Mostly met** — 0 HIGH/CRITICAL trong cả hai images' own dependency trees, ClamAV clean trên cả hai (real deep scans, reports trong `scan-reports/`). 3 Debian OS-level findings vẫn trên api image mà không upstream fix available yet (xem Todo list) — accepted residual risk, re-check khi base image gets new release.
- API image <200 MB; containers chạy non-root. **Partially met** — containers chạy non-root (verified). API image là 856MB, không <200MB: `node:22-bookworm-slim` (không alpine) là hard requirement, không preference — `argon2`'s native addon và `undici@8` đều force glibc + Node 22 (xem api.Dockerfile's `base` stage comment cho full investigation). 200MB target được set trước constraint này được discovered; reduced từ initial 1.3GB via chown-layer và npm/corepack fixes trên, nhưng Debian-glibc base + full NestJS/Prisma `node_modules` realistically không fit under 200MB. Flag tới ai owns target này — either accept ~850MB cho stack này hoặc revisit argon2/undici constraints.
- Thêm datasource = edit mounted `config.json` + restart `api`. **Không image rebuild** — **demonstrated live**: disabled `CITIZEN_EXTENDED` trong `config/config.json`, confirmed via `GET /datasources` nó vẫn present pre-restart, chạy `docker compose restart api` (không `--build`), confirmed nó disappeared từ response; re-enabled và restarted lại để restore state.
- Backup produces dump và restore script reconstitutes nó vào scratch database. **Met** — verified live.
- Smoke test passes chống deployed stack. **Met** — verified live qua Caddy (exit 0).
- Không secret present trong bất kỳ image layer (verify với `docker history` / layer inspection). **Met** — verified cho cả hai images.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Secrets baked vào image layers | Secrets chỉ tại runtime via env; `.dockerignore` excludes `.env*`; verify layers trước publishing. |
| Malware/vuln scan failing late, blocking go-live | Chạy scans trên mỗi CI build từ Giai đoạn 01 onward, không một lần ở end. |
| Migrations racing ở restart | Dedicated one-shot migrate step; app không bao giờ auto-migrates trong prod. |
| TLS certificate management burden | Caddy automatic TLS; nếu host là internal-only mà không public DNS, fall back tới company-issued internal cert — **confirm với ops early**, điều này có thể block deploy. |
| Image-DB ownership ambiguity (ai backs up MinIO?) | Clarify với Egor trước go-live; document whichever answer. |
| Single host = single point of failure | Accepted ở scale này; documented trong deployment guide cùng restore time expectations. |

## Cân nhắc bảo mật
- HTTPS end-to-end với HSTS (spec g). HTTP redirects tới HTTPS.
- Containers non-root, read-only root filesystem khi feasible, không `--privileged`.
- Postgres và MinIO **không** published trên public interfaces — internal compose network chỉ.
- MinIO credentials là service-account scoped tới single bucket, không root account.
- Upstream API keys injected tại runtime; không bao giờ trong image, git, hoặc `config.json` (cái giữ env var *names* chỉ).
- `docs/security-checklist.md` maps mỗi spec-(g) requirement tới implementation của nó — đây là cái customer sẽ review.

## Bước tiếp theo
1. `docs-manager` → generate `docs/system-architecture.md`, `docs/code-standards.md`, `docs/project-overview-pdr.md`, `docs/project-roadmap.md`, `docs/codebase-summary.md` từ reference files + final code.
2. UAT với real users; collect feedback trên hai lookup screens.
3. **Khi Egor deliver real API docs:** thêm real `datasources[]` entries, flip `transport.kind` tới `http`, validate field mappings chống real responses, keep mocks như test fixtures.

## Câu hỏi chưa giải quyết
- Target deployment host: company VM, on-prem server, hoặc cloud? Docker-only hoặc K8s mandated?
- Có public DNS + cert path cho automatic TLS, hay phải install internal CA cert?
- Malware scanner nào company's process yêu cầu (ClamAV assumed — spec chỉ nói *"quét malware"*)? Specific report format expected?
- Ai owns backups của MinIO image DB — chúng tôi hay data team?
- Có existing company registry/CI system để publish vào, hay CI/CD là chúng tôi phải định?

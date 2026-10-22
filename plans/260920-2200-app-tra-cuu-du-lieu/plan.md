---
title: "APP Tra cứu dữ liệu — Config-driven lookup portal"
description: "Ứng dụng web nội bộ 50 người dùng: đăng nhập/RBAC, tra cứu config-driven qua 3 API thượng nguồn + DB hình MinIO, kết quả timeline, lịch sử audit đầy đủ, được Dockerize."
status: completed
priority: P1
effort: 96h
branch: main
tags: [greenfield, nestjs, react, postgres, minio, rbac, config-driven, adapter-pattern]
created: 2026-09-20
---

# APP Tra cứu dữ liệu

Cổng nội bộ greenfield (~50 người dùng). Backend proxy 3 API "citizen info" thượng nguồn + 1 DB hình MinIO/Postgres. Yêu cầu kiến trúc cốt lõi từ spec: **input/output fields của mỗi API nằm trong một `config.json` độc lập** → toàn bộ hệ thống là config-driven nên các API mới được thêm bằng config, không phải code.

## Stack (đã quyết định — xem `research/researcher-01`)

| Layer | Choice | Why |
|---|---|---|
| Backend | **NestJS 11 (Node/TS)** | Cùng ngôn ngữ với FE → các kiểu chung thật sự, không có drift OpenAPI-codegen. Guards/Interceptors ánh xạ 1:1 thành "kiểm tra quyền trên mỗi request" + "audit mỗi request". Tính năng tốt nhất của FastAPI (Pydantic models tĩnh) không phù hợp với schemas được tải tại runtime. |
| DB / ORM | **Postgres 16 + Prisma** | DX migration tốt nhất cho một nhóm nhỏ. Một DB cho users/roles/history/audit. |
| Validation | **AJV** (validate `config.json` khi khởi động) + **Zod** (xây dựng động per-request từ input fields của config) | Config file shape là tĩnh → JSON Schema. User input shape là động → Zod xây dựng tại runtime. |
| Object storage | **MinIO** qua SDK `minio` chính thức (minio-js) | Tránh được mâu thuẫn chữ ký AWS-SDK-v3 vs MinIO. |
| Frontend | **React 19 + TS + Vite**, shadcn/ui, react-hook-form + zod, TanStack Query + Table v8 | Dynamic form renderer ~200-LOC tự viết tốt hơn rjsf ở đây (flat field list, không có conditionals) — xem `research/researcher-02`. |
| Images | **Backend authenticated proxy endpoint**, KHÔNG presigned URLs | Presigned URL = bearer token có thể chia sẻ, không có thu hồi giữa TTL, audit yếu hơn. Proxy kiểm tra lại RBAC per request + ETag caching bình thường. |
| Auth | In-memory access token (15min) + httpOnly/Secure/SameSite=Strict refresh cookie | Admin lock lan truyền ở refresh tiếp theo (≤15min). Không có JWT trong localStorage (XSS). |

## Thiết kế tham khảo (đọc trước bất kỳ giai đoạn nào)

- [`reference-config-schema.md`](reference-config-schema.md) — **hợp đồng cốt lõi**: config.json DSL + unified response envelope
- [`reference-database-erd.md`](reference-database-erd.md) — ERD + bảng + chỉ mục + seed (spec h)
- [`reference-api-specification.md`](reference-api-specification.md) — danh sách endpoint + quyền per route (spec h)
- [`reference-screens-and-ux.md`](reference-screens-and-ux.md) — danh mục màn hình, cả hai lookup forms (spec h)
- [`research/researcher-01-backend-stack-and-rbac.md`](research/researcher-01-backend-stack-and-rbac.md)
- [`research/researcher-02-config-driven-ui-and-minio-images.md`](research/researcher-02-config-driven-ui-and-minio-images.md)

## Giai đoạn

| # | Giai đoạn | Công sức | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| 01 | [Monorepo + lưới cơ sở hạ tầng](phase-01-setup-monorepo-and-infrastructure.md) | 6h | completed | — |
| 02 | [Schema DB + migrations + seed](phase-02-database-schema-and-migrations.md) | 6h | completed | 01 |
| 03 | [Auth, RBAC & admin user/role backend](phase-03-backend-auth-rbac-and-user-admin.md) | 14h | completed | 02 |
| 04 | [Config-driven datasource engine + mock APIs](phase-04-config-driven-datasource-engine.md) | 14h | completed | 01 |
| 05 | [Query, history & image-serving endpoints](phase-05-backend-query-history-and-images.md) | 12h | completed | 03, 04 |
| 06 | [Frontend foundation + auth flow](phase-06-frontend-foundation-and-auth.md) | 10h | completed | 03 |
| 07 | [Dynamic query UI + timeline views](phase-07-frontend-dynamic-query-and-timeline.md) | 14h | completed | 05, 06 |
| 08 | [Admin & history UI](phase-08-frontend-admin-and-history.md) | 10h | completed | 06 |
| 09 | [Hardening, Docker packaging & deploy](phase-09-hardening-docker-and-deployment.md) | 10h | completed | all |
| 10 | [Demo timeline features (4 new config-driven datasources)](phase-10-demo-timeline-features.md) | 4h | completed | 04, 05, 07, 08 |

Giai đoạn 03 và 04 là độc lập → có thể chạy song song bởi hai dev (disjoint file ownership:
`apps/api/src/auth|users|roles` vs `apps/api/src/datasources|adapters`).

## Rủi ro lớn nhất (đọc trước)

**3 API thượng nguồn thực tế hiện chưa có tài liệu.** Leader (Egor) chỉ cung cấp phác họa bằng lời nói:
các info API nhận `họ tên / ngày sinh / giới tính` và trả về "citizen records với vài trường cơ bản";
image API nhận `số CCCD` và trả về ảnh. Tên trường thực tế, response envelopes và thực tế
rằng *"mỗi API 1 input/output khác nhau"* là chưa biết.

Giảm thiểu = toàn bộ config-driven design. Chúng tôi xây dựng chống lại **mock adapters** (Giai đoạn 04) mà
mô phỏng các hình dạng được mô tả và trả về timeline-style arrays. Khi tài liệu thực tế đến, change set là:
thêm một mục `datasources[]` với real field mappings + flip `transport.kind` từ `mock` thành `http`.
Auth, RBAC, query engine, history, và toàn bộ UI vẫn giữ nguyên. Xem per-phase Risk Assessment.

## Bước tiếp theo sau phê duyệt

1. `docs-manager` → tạo `docs/system-architecture.md`, `docs/code-standards.md`,
   `docs/project-overview-pdr.md`, `docs/project-roadmap.md` từ các tệp tham khảo trên.
2. `git init` + push (repo chưa tồn tại).
3. Lấy câu trả lời cho các câu hỏi chưa giải quyết ở cuối mỗi giai đoạn (đặc biệt là real API docs từ Egor).

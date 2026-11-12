---
title: "Admin drill-down: nối Thống kê ↔ Lịch sử, phân tích chéo, CSV"
description: "Một where-builder dùng chung cho Thống kê/Lịch sử/CSV/top-bảng để số khớp tuyệt đối; drill-down tới từng query, hoạt động user/IP, bất thường, xuất CSV có audit."
status: pending
priority: P1
effort: 47h
branch: main
tags: [query-logs, history, query-stats, insights, audit, csv, privacy]
created: 2026-11-11
---

# Plan: Admin drill-down Thống kê ↔ Lịch sử

Yêu cầu gốc: [requirements.md](requirements.md). Công thức chỉ số: `docs/query-stats-dashboard.md`.

## Quyết định cốt lõi
- **Một nguồn lọc duy nhất**: `buildQueryLogWhereSql(filter, scope)` (Prisma.sql) dùng cho stats, history list/summary/CSV, insights. History list chuyển sang `$queryRaw`. Bảng ánh xạ counter→filter (`STATS_COUNTER_HISTORY_FILTER`) đặt ở `packages/shared`, FE link và e2e đối chiếu dùng cùng bảng.
- **Range nửa mở `[from,to)`** ở mọi nơi (history hiện dùng `lte` → sửa thành `lt`).
- **Quyền**: không tạo quyền mới cho xem; API mới = `history:view_all`. Thêm **1 quyền `history:export`** (chỉ ADMIN qua seed, không migration). Chi tiết: phase-01.
- **Audit** dạng `capture:'request'`: ghi bộ lọc, KHÔNG ghi response (tránh lọt CCCD thật vào audit_logs).
- **Phân trang offset** (giữ total, khớp số) + tie-break `id`, trần offset 10.000; CSV stream bằng keyset nội bộ.
- **Sự thật quan trọng**: `query_params` lưu **giá trị THẬT** (che ở read-time theo `history:view_sensitive`), comment schema "masked before storage" đã lỗi thời → phát hiện "CCCD bị nhiều user tra" làm chính xác được.

## Phases
| # | Phase | Mảng | Giờ | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|
| 01 | [Contracts + where-builder + audit/CSV util](phase-01-contracts-shared-filter-builder-audit-csv.md) | BE+shared | 6 | — | done |
| 02 | [History API: lọc, sort, summary, detail, CSV](phase-02-history-api-filters-summary-detail-export.md) | BE | 6 | 01 | done |
| 03 | [Query insights API: top, latency, user/IP, bất thường](phase-03-query-insights-api.md) | BE | 7 | 01 | done |
| 04 | [Stats: preset, granularity, so sánh kỳ trước](phase-04-query-stats-presets-granularity-compare.md) | BE | 3 | 01 | done |
| 05 | [Web Lịch sử: URL filters, detail, summary, CSV](phase-05-web-history-url-filters-detail-export.md) | FE | 6 | 01 (tích hợp: 02) | done (chưa test trình duyệt) |
| 06 | [Web Thống kê: drill-down + so sánh](phase-06-web-query-stats-drilldown-compare.md) | FE | 4 | 01 (tích hợp: 04) | done |
| 07 | [Web Insights: top, user, IP, bất thường](phase-07-web-query-insights-pages.md) | FE | 7 | 01 (tích hợp: 03) | code xong (typecheck/lint/vitest/build pass); chưa kiểm trình duyệt |
| 08 | [EXPLAIN + index migration](phase-08-explain-and-index-migration.md) | DB | 2.5 | 02, 03 | done (2 index thêm; còn đề xuất sửa NULLS LAST + sharedIdentity) |
| 09 | [Sinh dữ liệu demo + thử UI thủ công](phase-09-demo-query-log-data-and-manual-check.md) | script | 3 | 01 (chạy UI: 05–07) | script xong (chưa chạy trên dev); kiểm UI pending |
| 10 | [Đối chiếu cuối, review, docs](phase-10-final-reconciliation-review-docs.md) | all | 2.5 | tất cả | docs done; test toàn bộ + review còn chờ |

## Thứ tự & song song
```
01 ──┬─ 02 ─┐            (BE agent A: apps/api/src/history/**, seed.ts)
     ├─ 03 ─┼─ 08 ─┐     (BE agent B: apps/api/src/query-insights/**, app.module.ts)
     ├─ 04 ─┘      │     (BE agent C: apps/api/src/query-stats/**)
     ├─ 05 ────────┤     (FE agent D: features/history/**, vi-history.ts)
     ├─ 06 ────────┤     (FE agent E: features/admin/query-stats/**, vi-admin-query-stats.ts)
     ├─ 07 ────────┤     (FE agent F: features/admin/query-insights/**, app-routes, sidebar, vi.ts)
     └─ 09 ────────┴─ 10
```
- 01 phải xong trước (đóng băng contract trong `packages/shared`; sau 01 không agent nào sửa shared, cần đổi → báo lead).
- Sau khi sửa shared: `pnpm --filter @app/shared build` trước typecheck api/web.

## File ownership (chống xung đột)
- `packages/shared/**`, `apps/api/src/history/query-log-filter/**`, `apps/api/src/audit/**`, `apps/api/src/common/csv/**`, `history/sensitive-value-mask.util.ts`, `apps/web/src/lib/api-client.ts`: **chỉ 01**.
- `apps/api/prisma/schema.prisma`, `migrations/**`: chỉ 08. `apps/api/prisma/seed.ts`: chỉ 02.
- `apps/web/src/routes/app-routes.tsx`, `sidebar-nav.tsx(.test)`, `i18n/vi.ts`: chỉ 07.
- `scripts/seed-demo-query-logs.ts`, `apps/api/package.json` (script): chỉ 09. `docs/**`: chỉ 10.

## Lệnh kiểm tra mỗi phase
`pnpm typecheck && pnpm lint && pnpm test`; e2e (DB test 55434, KHÔNG 55432):
`cd apps/api && pnpm exec dotenv -e ../../.env -o -- env DATABASE_URL='postgresql://app_user:app_password@localhost:55434/app_tra_cuu' pnpm exec jest --config ./test/jest-e2e.json --runInBand --forceExit <file>`

## Ngoài phạm vi
Retention/dọn log (ghi docs hỏi leader); ML; lọc theo giá trị CCCD trong Lịch sử; cursor pagination UI.

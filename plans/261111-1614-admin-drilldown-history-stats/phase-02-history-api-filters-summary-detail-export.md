# Phase 02 — History API: lọc phong phú, sort, summary, detail, CSV

## Context Links
- phase-01 (builder, scope, CSV util, audit capture)
- `apps/api/src/history/{history.controller.ts, history.service.ts, dto/list-history-query.dto.ts}`
- `apps/api/test/history-scoping.e2e-spec.ts`

## Status
DONE (2026-11-11). Lệch nhỏ so với plan: reconciliation + filters + export + fixture đã làm; `/history/datasources` vẫn view_all; thêm header `X-Export-Exported`; e2e test truncation gọi service với maxRows=2; test seed qua upsert permission trong fixture.

## Overview
P1. BE agent A. Chuyển `GET /history` sang builder chung, thêm sort, summary, detail mở rộng, export CSV stream + audit, quyền `history:export` vào seed. 6h. Ownership: `apps/api/src/history/**` (trừ `query-log-filter/`), `apps/api/prisma/seed.ts`, `apps/api/test/history-*.e2e-spec.ts`, `apps/api/test/fixtures/query-log-e2e-fixtures.ts`.

## Key Insights
- **Offset, không cursor** cho UI: cần `total` để khớp số Thống kê và hiện "trang N/M"; quy mô ~50 user; sort theo duration/recordCount (có NULL) làm cursor phức tạp. Chống trôi: tie-break `id DESC`; drill-down luôn có `to` cố định. Trần `page*pageSize ≤ 10.000` (422 + gợi ý thu hẹp/xuất CSV). CSV dùng keyset nội bộ.
- `history.service.ts` 165 dòng → phải tách khi thêm raw SQL.

## Requirements / Endpoints
| Method/Path | Quyền | Zod | Response (shared) | Audit |
|---|---|---|---|---|
| `GET /history` | view_own \| view_all | `queryLogFilterQuerySchema.extend({sort: enum HistorySortField default createdAt, order: asc\|desc default desc, page, pageSize ≤100})` | `HistoryListResponse` | không (tránh spam mỗi lần lật trang; ghi rõ trong docs) |
| `GET /history/summary` | view_all | `queryLogFilterQuerySchema` | `HistorySummaryResponse` | không |
| `GET /history/export.csv` | `history:export` (scope theo view_all/own) | `queryLogFilterQuerySchema` | `text/csv; charset=utf-8` stream | `@AuditAction('query_log.export_csv','query_log',{capture:'request'})`, `auditExtra = {matched, exported, truncated, maxRows}` |
| `GET /history/:id` | view_own \| view_all | `id` uuid (zod, hiện chưa validate) | `QueryLogDetail` (+ip, userAgent) | `@AuditAction('query_log.view_detail','query_log',{capture:'request'})` |

- Route tĩnh `summary`, `export.csv`, `datasources` khai báo **trước** `:id`.
- Sort SQL: whitelist map `{createdAt:'created_at', durationMs:'duration_ms', recordCount:'record_count'}` qua `Prisma.raw`, `NULLS LAST`, rồi `, id DESC`.
- Summary: một query `SELECT COUNTERS, P95 FROM app.query_logs WHERE <builder>`; `successRate = success/total` (null nếu 0), `gap/empty` tính như `toCounters` (tái dùng `toCounters` từ stats util — dời `toCounters` sang `query-log-filter/` nếu cần tránh import chéo module; quyết khi code, ưu tiên import pure function).
- Detail: ai có view_own xem row người khác → 404 (giữ). Audit ghi cho mọi lần xem chi tiết (đơn giản, không điều kiện).
- CSV: cột tiếng Việt: `ID, Thời điểm (giờ VN, ISO +07:00), Tên đăng nhập, User ID, Nguồn, Điều kiện tra cứu (đã che), Trạng thái, HTTP status, Mã lỗi, Thông báo lỗi, Số bản ghi, Thời gian xử lý (ms), Upstream request ID, IP, User-Agent`. **Không** xuất `queryParams` JSON; `querySummary` qua cùng mapper che `sensitive` theo `history:view_sensitive`. BOM UTF-8, CRLF. Thứ tự luôn `created_at DESC, id DESC` (ghi docs: CSV không theo sort UI). Keyset batch 1000 bằng `(created_at, id) < ($c, $id)`; ghim `to = min(filter.to, now)` lúc bắt đầu. COUNT trước để set header `X-Export-Total`, `X-Export-Truncated`. Tên file `lich-su-tra-cuu-YYYYMMDD-HHmm.csv` (giờ VN).

## Architecture (tách file)
- `history-list-sql.repository.ts`: `list(where, sort, offset, limit)`, `count(where)`, `summary(where)`, `exportBatch(where, cursor, limit)` — SELECT cột alias camelCase, `ip::text`, `status::text`.
- `query-log-row-mapper.ts`: `toListItem/toDetail/maskedParams` (dời khỏi service; nhận `QueryLogRowView` chung cho row raw + row Prisma).
- `history-export-csv.service.ts`: tạo `Readable.from(asyncGenerator)` → `StreamableFile`.
- `history.service.ts`: điều phối (scope → builder → repo → mapper), < 120 dòng.
- `dto/list-history-query.dto.ts`: extend schema chung (giữ tên file).
- `seed.ts`: thêm `{ code: 'history:export', name: 'Export query history (CSV)' }`.

## Implementation Steps
1. Tách mapper + repo; list/count qua builder; giữ e2e `history-scoping` xanh (sửa test nếu nó dựa vào `to` inclusive).
2. Sort + trần offset.
3. Summary endpoint.
4. Detail: zod uuid, ip/userAgent, audit.
5. Export CSV + seed quyền; chạy seed trên DB test & dev (idempotent).
6. E2E (dùng fixture helper chung, mỗi file <200 dòng):
   - `history-drilldown-reconciliation.e2e-spec.ts`: dữ liệu mốc (datasource code riêng theo suffix): success rc>0, rc=0, rc NULL; failed (rc NULL và **rc>0** để chứng minh gap ≠ hasRecords=false); denied (errorCode null, statusCode 403); row statusCode NULL; mốc `T16:59:59.999Z` (23:59:59.999 VN) và `T17:00:00.000Z` (00:00 VN), cuối tháng/năm. Với 3 range custom (1 ngày→hour, 10 ngày→day, 100 ngày→month): lấy stats overview + detail; **với mọi bucket × mọi counter trong `STATS_COUNTER_HISTORY_FILTER`** gọi `/history?<vnBucketRange>&datasourceCode&<mapping>&pageSize=1` → `total === counter`; và `/history/summary` khớp totals. Top errors: mỗi item → `/history?status=failed,denied&errorCode=..|__null__&statusCode=..|__null__` khớp `count`.
   - `history-filters-and-scope.e2e-spec.ts`: view_own gửi `userId/username/ip` khác vẫn chỉ thấy row mình; view_own gọi summary/export → 403; detail row người khác → 404; từng filter mới (statusCode, errorCode `__null__`, ip, duration min/max, hasRecords, upstreamRequestId, offHours); sort 3 trường + NULLS LAST; offset vượt trần → 422; `to` nửa mở (row đúng `to` không lọt).
   - `history-export-csv.e2e-spec.ts`: row có username `=cmd|' /C calc'!A0`, summary `+1+1`, errorMessage `@SUM(A1)`, `-2+3`, chứa `"` và xuống dòng → ô có tiền tố `'` và quote đúng; role không `view_sensitive` thấy `********1234`, role có thấy giá trị thật; không có `history:export` → 403; vượt `maxRows` (test truyền qua env/const nhỏ? → dùng hằng shared, test bằng cách kiểm header `X-Export-Total` & `X-Export-Truncated=false`; truncation kiểm ở unit test service với limit inject); **audit_logs** có row `query_log.export_csv` với `after.filters` = query gửi, và `after` không chứa CCCD thật.
   - Audit detail: row `query_log.view_detail`, `targetId = id`, `after` không có `queryParams`.

## Todo List
- [x] tách repo/mapper/service; list qua builder
- [x] sort + trần offset
- [x] summary
- [x] detail + audit
- [x] export CSV stream + audit + seed `history:export`
- [x] 3 e2e file + fixture helper
- [x] typecheck/lint/test

## Success Criteria
Reconciliation e2e xanh cho 8 counter × 3 granularity × mọi bucket; scope test xanh; CSV injection test xanh; audit row tồn tại và không chứa response.

## Risk Assessment
- Map raw row (status text, inet) sai kiểu → test mapper.
- `StreamableFile` + interceptor: audit ghi khi handler trả về (trước khi stream xong) — chấp nhận, `auditExtra` đã có số dự kiến.
- Seed chưa chạy ở prod → export 403 cho admin; ghi deployment-guide (chạy lại seed).

## Security Considerations
Scope ép ở `resolve-query-log-scope`; CSV che sensitive cùng mapper với UI; không xuất JSON params; audit request-only.

## Next Steps
Phase 05 tích hợp; phase 08 EXPLAIN.

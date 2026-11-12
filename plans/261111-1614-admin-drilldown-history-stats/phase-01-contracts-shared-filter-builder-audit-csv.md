# Phase 01 — Contracts, where-builder dùng chung, audit capture, CSV util

## Context Links
- [requirements.md](requirements.md), `docs/query-stats-dashboard.md` (công thức)
- `apps/api/src/query-stats/query-stats-sql.repository.ts` (COUNTERS, `where()` hiện tại)
- `apps/api/src/history/history.service.ts` (`buildWhere` Prisma, `lte` cho `to`)
- `apps/api/src/audit/audit.interceptor.ts` (đang ghi `after: result` = toàn bộ response)

## Status
DONE (2026-11-11). Ghi chú: seed `history:export` thuộc phase 02 (seed.ts); `previous` trong query-stats-types để optional tới khi phase 04 xong; thêm `default: throw` tạm trong query-stats-date-range.util.ts (phase 04 thay) và ip/userAgent trong toDetail (phase 02 giữ).

## Overview
Ưu tiên P1, chặn mọi phase khác. Đóng băng contract (types + bảng ánh xạ) trong `packages/shared`, tạo **một** where-builder SQL tham số hóa, chuyển stats sang dùng nó (không đổi số), thêm chế độ audit "chỉ ghi request", util CSV chống injection. Ước lượng 6h.

## Key Insights
- Stats dùng `$queryRaw`, history dùng Prisma `findMany` → hai cách lọc = nguy cơ lệch số. Không thể dịch `WhereInput` sang SQL, nên **chuẩn hoá về Prisma.sql** cho mọi nơi đọc tập query_logs (detail by id vẫn dùng `findUnique`).
- `empty` phải bao cả `record_count IS NULL`: dùng `COALESCE(record_count,0) <= 0`. `answered` giữ `record_count > 0` (NULL → không answered, đúng như COUNTERS). Do đó 3 vị từ là phần bù chính xác của nhau.
- History `to` hiện `lte` + FE gửi `YYYY-MM-DD` parse thành 00:00 UTC (= 07:00 VN) → đang lệch 7h. Sửa thành nửa mở + giờ VN.
- AuditInterceptor ghi `after: result`: với endpoint đọc, admin có `view_sensitive` sẽ làm **CCCD thật lọt vào audit_logs** → bắt buộc có chế độ không ghi response.
- `packages/shared` không có zod và không có test runner → shared chỉ chứa types + hàm thuần; zod ở api; test hàm shared viết trong jest api.

## Requirements
- Contract shared đủ cho 02–07 (không ai sửa shared sau phase này).
- Refactor stats: e2e `query-stats.e2e-spec.ts` hiện có phải vẫn xanh, không đổi số.

## Architecture

### Shared (packages/shared/src)
- `query-log-filter-types.ts` (mới):
  - `QUERY_LOG_NULL_TOKEN = '__null__'` (lọc `IS NULL` cho errorCode/statusCode/userId — cần vì denied có errorCode null, row cũ statusCode null; topErrors gom cả nhóm null).
  - `QueryLogOutcome = 'answered' | 'empty' | 'gap'`.
  - `QueryLogFilterParams` (dạng chuỗi URL/API, tên khóa giống hệt API): `from, to, datasourceCode, status (CSV "failed,denied"), outcome, userId, username, statusCode, errorCode, ip, durationMinMs, durationMaxMs, hasRecords ('true'|'false'), upstreamRequestId, offHours ('true')`.
  - `QUERY_LOG_FILTER_KEYS` (mảng khóa, FE dùng parse/serialize URL).
  - `QueryStatsCounterKey = 'requests'|'answered'|'gap'|'success'|'empty'|'failed'|'denied'|'errors'`.
  - `STATS_COUNTER_HISTORY_FILTER: Record<QueryStatsCounterKey, Partial<QueryLogFilterParams>>`:
    requests `{}`; answered `{outcome:'answered'}`; gap `{outcome:'gap'}`; empty `{outcome:'empty'}`; success `{status:'success'}`; failed/denied `{status:x}`; errors `{status:'failed,denied'}`.
  - `buildHistorySearchParams(params): URLSearchParams` (bỏ rỗng, thứ tự ổn định).
- `query-log-time-range.ts` (mới, hàm thuần, UTC+7 cố định): `vnBucketRange(bucket, granularity) → {from,to}` ISO UTC; `vnDateStartIso('YYYY-MM-DD')`; `vnNextDateStartIso(...)`. FE dùng cho bar click, BE dùng chuẩn hoá `from/to` dạng ngày.
- `history-types.ts` (sửa): `QueryLogDetail` thêm `ip: string|null`, `userAgent: string|null`; `HistorySortField = 'createdAt'|'durationMs'|'recordCount'`; `HistorySummaryResponse {total, success, failed, denied, answered, gap, empty, successRate: number|null, avgDurationMs: number|null, p95DurationMs: number|null}`; `HISTORY_EXPORT_MAX_ROWS = 50_000`; `HISTORY_MAX_OFFSET = 10_000`.
- `query-stats-types.ts` (sửa): preset thêm `last_24h|last_7d|last_30d|last_90d|last_month`, `QUERY_STATS_DEFAULT_PRESET='last_7d'`; overview/detail response thêm `previous: {from,to,totals: QueryStatsCounters} | null`.
- `query-insights-types.ts` (mới): xem phase-03 (đặt types ở đây ngay phase 01).
- `permission-codes.ts`: thêm `HISTORY_EXPORT: 'history:export'`.

### Quyền — lý do
- Dữ liệu dòng (list/detail/user/IP/bất thường) = "ai tra ai" → `history:view_all` (AUDITOR có sẵn, đúng vai trò kiểm tra). Không tạo quyền xem mới → không đổi seed cho xem.
- **`history:export`** mới: xuất hàng loạt là kênh rò rỉ khác hẳn xem từng trang; tách để có thể cấp view_all mà không cho xuất. Seed: thêm vào `FEATURE_PERMISSIONS` (phase 02 sửa seed.ts); ADMIN tự nhận mọi feature perm; AUDITOR/OPERATOR không. **Không cần migration** (permission là row). Endpoint export yêu cầu `history:export`, scope vẫn theo view_all/view_own như list → CSV luôn = đúng tập list.
- Stats tổng hợp giữ `admin:query_stats`. FE chỉ hiện link drill-down khi user có cả `history:view_all` (nếu không, số Lịch sử sẽ bị scope về user → không khớp).

### API-side (apps/api/src)
- `history/query-log-filter/query-log-filter-query.schema.ts`: zod `queryLogFilterQuerySchema` → transform ra `QueryLogFilter` (typed: `from?: Date; to?: Date; status?: QueryLogStatus[]; userId?: string|null; statusCode?: number|null; errorCode?: string|null; ...`).
  - `from/to`: ISO datetime **có offset** (`z.iso.datetime({offset:true})`) hoặc `YYYY-MM-DD` (= 00:00 VN; với `to` dạng ngày → 00:00 VN ngày kế, tức "đến hết ngày"). Refine `from < to`.
  - `status`: CSV, mỗi phần tử ∈ enum, unique. `statusCode`: int 100–599 | `__null__`. `errorCode`: `^[A-Z0-9_]{1,100}$`i | `__null__`. `userId`: uuid | `__null__`. `ip`: `z.union([z.ipv4(), z.ipv6()])`. duration: int ≥0, min ≤ max. `upstreamRequestId`: 1–255. `username`: 1–100.
- `history/query-log-filter/query-log-where-sql.builder.ts`:
  ```ts
  export interface QueryLogScope { forcedUserId?: string } // set khi chỉ có view_own
  export function buildQueryLogWhereSql(f: QueryLogFilter, scope: QueryLogScope): Prisma.Sql
  ```
  Điều kiện (join `AND`, mặc định `TRUE`):
  `created_at >= $from`, `created_at < $to`, `datasource_code = $`, `status = ANY($::app."QueryStatus"[])` (kiểm tên enum type thật bằng `\dT app.*`),
  outcome: answered `status='success' AND record_count > 0`; empty `status='success' AND COALESCE(record_count,0) <= 0`; gap `NOT (status='success' AND COALESCE(record_count,0) > 0)`,
  `user_id = $` / `IS NULL`, `username_snapshot ILIKE $ ESCAPE '\'` (escape `% _ \`), `status_code = $`/`IS NULL`, `error_code = $`/`IS NULL`, `ip = $::inet`, `duration_ms >= $` / `<= $` (row duration NULL bị loại — ghi docs), hasRecords `COALESCE(record_count,0) > 0` / `<= 0`, `upstream_request_id = $`,
  offHours: `(EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (6,7) OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT BETWEEN ${WORK_START} AND ${WORK_END-1})`.
  **Scope luôn AND cuối**: `forcedUserId` → `user_id = $forced`, đồng thời builder **bỏ qua** `userId/username/ip` của filter (khớp hành vi cũ, không tin query string).
- `history/query-log-filter/query-log-counters.sql.ts`: chuyển `COUNTERS` từ stats repo sang đây + `P95_DURATION_SQL = ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int` (bỏ qua NULL, nội suy tuyến tính — ghi docs).
- `history/query-log-filter/resolve-query-log-scope.ts`: `(user, perms) → { scope, canViewAll, canViewSensitive }` — nơi duy nhất quyết scope.
- `query-stats-sql.repository.ts`: `where(range, code)` → `buildQueryLogWhereSql({from,to,datasourceCode:code}, {})`; import COUNTERS.
- `audit/audit-action.decorator.ts`: `AuditAction(action, targetType, opts?: { capture?: 'result'|'request'; targetParam?: string })`, mặc định `'result'` (không đổi route cũ).
- `audit/audit.interceptor.ts`: `capture:'request'` → `before: undefined`, `after: { filters: request.query, params: request.params, ...request.auditExtra }`; targetId lấy `params[targetParam]` nếu có. `rbac/express-request.d.ts`: thêm `auditExtra?: Record<string, unknown>`.
- `history/sensitive-value-mask.util.ts`: tách `getSensitiveInputFieldNames(entry)` (dùng lại trong `summarizeQueryParams` và phase 03 rule CCCD) — tránh phase 02/03 cùng sửa file.
- `common/csv/csv-safe-cell.util.ts`: `toCsvCell(v)`: null/undefined→''; chuỗi bắt đầu `= + - @ \t \r` → tiền tố `'`; luôn bọc `"` + nhân đôi `"`; số/boolean in thẳng. `toCsvRow(cells) + '\r\n'`; `CSV_UTF8_BOM`.

### Web (nhỏ, để 05 và 07 cùng dùng không xung đột)
- `apps/web/src/lib/api-client.ts`: tổng quát `requestBlob` → `apiFetchBlob(path): Promise<{blob, headers}>`; `apiFetchImageBlob` gọi lại nó (không đổi call-site ảnh). Test trong `api-client.test.ts`.

## Related Code Files
- Create: `packages/shared/src/query-log-filter-types.ts`, `query-log-time-range.ts`, `query-insights-types.ts`; `apps/api/src/history/query-log-filter/{query-log-filter-query.schema.ts, query-log-where-sql.builder.ts, query-log-counters.sql.ts, resolve-query-log-scope.ts}` + `*.spec.ts`; `apps/api/src/common/csv/csv-safe-cell.util.ts(+spec)`; `apps/api/src/history/query-log-filter/query-log-time-range.spec.ts` (test hàm shared).
- Modify: `packages/shared/src/{index.ts, history-types.ts, query-stats-types.ts, permission-codes.ts}`, `query-stats-sql.repository.ts`, `history/sensitive-value-mask.util.ts`, `apps/web/src/lib/api-client.ts(+test)`, `audit-action.decorator.ts`, `audit.interceptor.ts`, `rbac/express-request.d.ts`.

## Implementation Steps
1. Viết types/hàm shared; export ở `index.ts`; build shared.
2. Viết zod schema + builder + counters + scope resolver.
3. Refactor stats repo dùng builder; chạy unit + e2e query-stats (phải xanh nguyên).
4. Audit capture mode + augment Request; unit test interceptor (request mode không chứa result).
5. CSV util + spec.

## Todo List
- [x] shared types + `STATS_COUNTER_HISTORY_FILTER` + `vnBucketRange`
- [x] zod filter schema (+spec: datetime offset, date-only VN, `__null__`, CSV status, ip v4/v6, min>max lỗi)
- [x] where builder (+spec: từng điều kiện → SQL text & values; scope ghi đè userId/username/ip)
- [x] COUNTERS + P95 dời sang module chung; stats repo dùng builder
- [x] audit `capture:'request'` + `targetParam`
- [x] CSV util (+spec injection)
- [x] typecheck/lint/test + e2e query-stats xanh

## Success Criteria
- e2e `query-stats.e2e-spec.ts` xanh không sửa assertion.
- Spec builder chứng minh: không chuỗi nào từ input nối vào SQL (chỉ `Prisma.raw` cho hằng whitelist).
- `vnBucketRange('2026-11-12T00','hour')` = `2026-11-11T17:00Z..18:00Z`; `('2026-12','month')` = `2026-11-30T17:00Z..2026-12-31T17:00Z`.

## Risk Assessment
- Tên enum PG (`app."QueryStatus"`) sai → lỗi runtime; mitigation: dùng `status::text = ANY($::text[])` (đơn giản, index không dùng status nên không mất gì).
- Đổi `lte`→`lt` là breaking nhỏ cho FE cũ — FE sửa ở phase 05; ghi changelog.

## Security Considerations
- Mọi giá trị qua placeholder; `ILIKE` escape ký tự đại diện.
- Scope ép ở builder + resolver, controller không quyết.
- Audit không chứa response.

## Next Steps
Mở khoá 02, 03, 04, 05, 06, 07, 09 song song.

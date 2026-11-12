# Phase 02 — API thống kê (range util, SQL, service, controller)

## Context Links
- Schema: `apps/api/prisma/schema.prisma` (`QueryLog` → `app.query_logs`, enum `QueryStatus` map lowercase `success|failed|denied`)
- Pattern controller admin: `apps/api/src/audit/audit-logs.controller.ts` (class-level `@RequirePermission`, `ZodValidationPipe`)
- Registry tên datasource: `DatasourceRegistryService.getAll()` (xem `HistoryService.listDatasourceOptions`)
- Phase 01 types: `packages/shared/src/query-stats-types.ts`

## Overview
Priority P2 · Status pending · Module mới `query-stats` read-only trên `query_logs`.

## Key Insights
- Cần `FILTER (WHERE ...)`, `date_trunc` theo giờ VN → Prisma `groupBy` không làm được gọn → dùng `$queryRaw` với tagged template `Prisma.sql` (tham số hoá, chống SQL injection). `Prisma.raw` CHỈ dùng cho unit `date_trunc` lấy từ map whitelist, không bao giờ từ input.
- Index sẵn có đủ dùng: `WHERE created_at >= $from AND created_at < $to` → `(created_at DESC)`; thêm `datasource_code = $code` → `(datasource_code, created_at DESC)`. Group-by trên kết quả đã lọc (quy mô ~50 user, vài chục nghìn row/tháng) — không cần bảng tổng hợp/materialized view (YAGNI).
- Lọc theo khoảng UTC đã tính sẵn ở TS (không `AT TIME ZONE` trong WHERE) để index được dùng; `AT TIME ZONE` chỉ ở SELECT/GROUP BY bucket.
- `COUNT(*)` trả `bigint` → cast `::int` trong SQL.
- Denied row: `error_code` null, `status_code` 403; row cũ `status_code` null → topErrors giữ nguyên null, FE hiển thị nhãn.

## Requirements
- `GET /api/v1/admin/query-stats/overview` → `QueryStatsOverviewResponse`
- `GET /api/v1/admin/query-stats/datasources/:code` → `QueryStatsDatasourceDetailResponse`
- Query chung: `preset` (default `today`), `from`,`to` (`YYYY-MM-DD`, bắt buộc khi `preset=custom`, `from<=to`, ≤366 ngày).
- Overview `byDatasource` gồm cả datasource trong config có 0 lượt (merge registry), + code chỉ có trong log (đã xoá khỏi config, `name: null`). Sort `requests DESC`.
- `:code` regex `^[A-Za-z0-9_-]{1,100}$`; code lạ trả số 0 (không 404 — log lịch sử vẫn hợp lệ).

## Architecture
Mốc thời gian (util thuần, `now` inject để test), offset cố định +07:00:
| preset | [from, to) giờ VN | granularity |
|---|---|---|
| today | 00:00 hôm nay → 00:00 mai | hour |
| yesterday | 00:00 hôm qua → 00:00 hôm nay | hour |
| this_month | 00:00 ngày 1 → 00:00 ngày 1 tháng sau | day |
| this_year | 01-01 → 01-01 năm sau | month |
| custom | from 00:00 → (to+1) 00:00 | ≤2 ngày hour, ≤92 day, còn lại month |

SQL (1 fragment counters dùng chung — DRY):
```sql
COUNT(*)::int requests,
COUNT(*) FILTER (WHERE status='success' AND record_count>0)::int answered,
COUNT(*) FILTER (WHERE status='success')::int success,
COUNT(*) FILTER (WHERE status='failed')::int failed,
COUNT(*) FILTER (WHERE status='denied')::int denied,
COALESCE(SUM(record_count),0)::int records,
ROUND(AVG(duration_ms))::int avg_duration_ms
FROM app.query_logs WHERE created_at >= $from AND created_at < $to [AND datasource_code=$code]
```
`gap/empty/errors` tính ở TS (`requests-answered`, `success-answered`, `failed+denied`) → 1 hàm `toCounters(row)`.
3 query (Promise.all): `aggregateByDatasource(range, code?)` (GROUP BY datasource_code; totals overview = cộng dồn TS, detail = 1 row), `timeseries(range, code?)` (GROUP BY `to_char(date_trunc(unit, created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), fmt)`), `topErrors(range, code?)` (WHERE status<>'success' GROUP BY error_code,status_code ORDER BY count DESC LIMIT 10). Timeseries fill bucket trống = 0 ở TS để chart liền mạch.

## Related Code Files
Create (`apps/api/src/query-stats/`):
- `query-stats-date-range.util.ts` — `resolveQueryStatsRange(query, now)` + `listBucketKeys(range)`
- `dto/query-stats-query.dto.ts` — zod schema (preset/from/to + refine)
- `query-stats-sql.repository.ts` — 3 hàm `$queryRaw`, fragment counters
- `query-stats.service.ts` — ghép kết quả, merge registry name, fill bucket
- `query-stats.controller.ts` — `@Controller('admin/query-stats')` + `@RequirePermission(ADMIN_QUERY_STATS)`; route tĩnh `overview` trước `datasources/:code`
- `query-stats.module.ts` — imports `DatasourcesModule`
Modify: `apps/api/src/app.module.ts` (import module)

## Implementation Steps
1. Range util + zod DTO (custom refine: from/to bắt buộc, thứ tự, ≤366 ngày → 422 qua `ZodValidationPipe`).
2. Repository raw SQL; map row snake_case → camelCase; whitelist unit/format: `{hour:['hour','YYYY-MM-DD"T"HH24'], day:['day','YYYY-MM-DD'], month:['month','YYYY-MM']}`.
3. Service: `overview(query)`, `datasourceDetail(code, query)`; dùng `new Date()` mặc định, cho phép inject clock (constructor param/token đơn giản) để e2e/unit ổn định.
4. Controller + module + đăng ký AppModule; Swagger tags `Admin — Query stats`.
5. `pnpm --filter api build` + lint.
6. Kiểm `EXPLAIN` 1 lần trên DB dev (ghi kết quả vào commit/PR, không cần code).

## Todo List
- [ ] range util
- [ ] zod DTO
- [ ] SQL repository
- [ ] service (merge registry, fill bucket)
- [ ] controller + module + AppModule
- [ ] build/lint pass, EXPLAIN dùng index

## Success Criteria
- 2 endpoint trả đúng shape types shared; non-admin 403; input sai 422.
- Mỗi file < 200 dòng.

## Risk Assessment
- Sai tên bảng/schema/enum trong raw SQL → chỉ lộ khi chạy thật → e2e phase 03 bắt.
- Ranh giới ngày lệch timezone → unit test các mốc 23:59/00:00 VN.
- Route `:code` nuốt `overview` → dùng prefix `datasources/:code` riêng.

## Security Considerations
- Chỉ `admin:query_stats`; JWT guard global có sẵn.
- Không trả `query_params`, `error_message`, username → không lộ PII/chi tiết upstream.
- Toàn bộ input qua `Prisma.sql` param; `Prisma.raw` chỉ hằng số whitelist.

## Next Steps
- Phase 03 (test), Phase 04 (FE).

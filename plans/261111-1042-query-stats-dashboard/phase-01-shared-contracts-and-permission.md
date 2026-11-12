# Phase 01 — Shared contracts + permission

## Context Links
- `packages/shared/src/permission-codes.ts`, `packages/shared/src/admin-types.ts`, `packages/shared/src/index.ts`
- `apps/api/prisma/seed.ts` (`FEATURE_PERMISSIONS`, ADMIN nhận mọi feature perm trong `seedRoles`)
- [plan.md](plan.md) — bảng định nghĩa chỉ số

## Overview
Priority P2 · Status pending · Định nghĩa permission + DTO dùng chung BE/FE trước mọi phase khác.

## Key Insights
- Permission là ROW trong bảng `permissions` → thêm code mới chỉ cần seed upsert, không migration.
- Deploy prod chạy `seed` tự động (postgres → migrate → seed → api), ADMIN tự có quyền mới sau deploy.
- Không tái dùng `admin:audit`: AUDITOR/role khác có thể được cấp audit nhưng không nên thấy thống kê (và ngược lại) — tách quyền rẻ, rõ.

## Requirements
- Code `admin:query_stats` ("View query statistics dashboard").
- Types cho request query + response của 2 endpoint (phase 02).

## Architecture — types mới (`packages/shared/src/query-stats-types.ts`)
```ts
export type QueryStatsPreset = 'today' | 'yesterday' | 'this_month' | 'this_year' | 'custom';
export type QueryStatsGranularity = 'hour' | 'day' | 'month';
export interface QueryStatsRange { preset: QueryStatsPreset; from: string; to: string; // ISO UTC, [from,to)
  granularity: QueryStatsGranularity; timeZone: 'Asia/Ho_Chi_Minh'; }
export interface QueryStatsCounters { requests: number; answered: number; gap: number; success: number;
  empty: number; failed: number; denied: number; errors: number; records: number; avgDurationMs: number | null; }
export interface QueryStatsBucket extends QueryStatsCounters { bucket: string; } // 'YYYY-MM-DD[THH]' giờ VN
export interface QueryStatsErrorItem { errorCode: string | null; statusCode: number | null; count: number; }
export interface QueryStatsDatasourceRow extends QueryStatsCounters { datasourceCode: string; name: string | null; }
export interface QueryStatsOverviewResponse { range: QueryStatsRange; totals: QueryStatsCounters;
  byDatasource: QueryStatsDatasourceRow[]; timeseries: QueryStatsBucket[]; topErrors: QueryStatsErrorItem[]; }
export interface QueryStatsDatasourceDetailResponse { range: QueryStatsRange;
  datasource: { code: string; name: string | null }; totals: QueryStatsCounters;
  timeseries: QueryStatsBucket[]; topErrors: QueryStatsErrorItem[]; }
```
- Hằng `QUERY_STATS_TIME_ZONE = 'Asia/Ho_Chi_Minh'`, `QUERY_STATS_MAX_RANGE_DAYS = 366` đặt cùng file (BE validate, FE hiển thị).

## Related Code Files
- Create: `packages/shared/src/query-stats-types.ts`
- Modify: `packages/shared/src/permission-codes.ts` (thêm `ADMIN_QUERY_STATS`), `packages/shared/src/index.ts` (export), `apps/api/prisma/seed.ts` (thêm row)

## Implementation Steps
1. Thêm `ADMIN_QUERY_STATS: 'admin:query_stats'` vào `FEATURE_PERMISSION_CODES` + comment.
2. Thêm `{ code: 'admin:query_stats', name: 'View query statistics dashboard' }` vào `FEATURE_PERMISSIONS` seed.
3. Tạo `query-stats-types.ts`, export từ `index.ts`.
4. `pnpm -r build` / typecheck shared + api + web.

## Todo List
- [ ] permission code shared
- [ ] seed row
- [ ] types file + export
- [ ] typecheck 3 package

## Success Criteria
- `pnpm --filter api prisma db seed` chạy lại idempotent, ADMIN có `admin:query_stats` (kiểm `GET /auth/me`).
- Typecheck pass.

## Risk Assessment
- Quên re-seed ở DB dev/test → e2e 403. Mitigation: ghi chú trong phase 03 + deployment doc.

## Security Considerations
- Quyền không cấp mặc định cho OPERATOR/AUDITOR.

## Next Steps
- Phase 02, 04.

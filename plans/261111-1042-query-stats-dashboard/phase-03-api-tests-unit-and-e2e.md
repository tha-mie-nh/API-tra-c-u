# Phase 03 — Test API (unit + e2e DB thật)

## Context Links
- Pattern e2e: `apps/api/test/history-scoping.e2e-spec.ts` (AppModule thật, tạo role/user với suffix `Date.now()`, login lấy token, cleanup)
- Config: `apps/api/test/jest-e2e.json`, `docker-compose.test.yml`
- Unit pattern: `*.spec.ts` cạnh source (vd `date-format-parser.util.spec.ts`)

## Overview
Priority P2 · Status pending · Phụ thuộc phase 02. Không mock Prisma/DB.

## Key Insights
- Range util là hàm thuần → unit test không cần DB, inject `now`.
- Raw SQL chỉ kiểm được trên Postgres thật → e2e insert row `query_logs` trực tiếp bằng `prisma.queryLog.createMany` với `createdAt` cố định + `datasourceCode` riêng cho test (vd `E2E_STATS_${suffix}`) để không lẫn dữ liệu khác trong DB test.
- Dùng `preset=custom` với ngày cố định trong quá khứ (vd 2020-03-14..2020-03-15) → kết quả tất định, không phụ thuộc giờ chạy test.

## Requirements / Test cases
Unit `query-stats-date-range.util.spec.ts`:
- today/yesterday/this_month/this_year với `now` = 2026-11-11T17:30Z (đã là 12-11 giờ VN) → kiểm ranh giới UTC đúng (+07).
- 31-12 23:59 VN → this_year đúng năm; 01 tháng 00:00 VN.
- custom: granularity hour/day/month theo độ dài; `listBucketKeys` đủ số bucket.
Unit `query-stats.service.spec.ts` (chỉ phần thuần): `toCounters` (gap/empty/errors), merge registry (datasource 0 lượt, code mồ côi `name:null`) — tách hàm thuần để test không cần mock.
Zod DTO: custom thiếu from/to, from>to, >366 ngày → lỗi.

E2E `apps/api/test/query-stats.e2e-spec.ts`:
- Seed: admin role có `admin:query_stats`, user không quyền.
- Insert ~10 row trên 2 code test: success recordCount 3, success recordCount 0, failed 504 `UPSTREAM_TIMEOUT`, failed 422 `VALIDATION_ERROR`, denied 403, 1 row ngoài khoảng (ngày trước 00:00 VN 1 phút → phải bị loại), 1 row 23:59 VN cuối ngày (phải có).
- Assert overview custom: totals requests/answered/gap/records/failed/denied đúng; byDatasource chứa 2 code test; timeseries bucket đúng ngày VN; topErrors thứ tự + có (null,403).
- Assert detail `/datasources/:code` chỉ số của 1 code.
- 403 cho user không quyền; 401 không token; 422 custom sai.
- Lưu ý: totals overview bị lẫn dữ liệu khác nếu DB test có row cùng ngày → assert trên `byDatasource` (theo code test) + detail, còn totals chỉ assert `>=`.
- afterAll: xoá row theo `datasourceCode` test, user, role.

## Related Code Files
Create: `apps/api/src/query-stats/query-stats-date-range.util.spec.ts`, `apps/api/src/query-stats/query-stats.service.spec.ts`, `apps/api/test/query-stats.e2e-spec.ts`

## Implementation Steps
1. Viết unit test range + counters + DTO.
2. Viết e2e theo pattern history-scoping (re-seed trước nếu DB test cũ chưa có permission: `prisma db seed`).
3. `pnpm --filter api test` và `pnpm --filter api test:e2e` (cần Postgres test up).

## Todo List
- [ ] unit range util
- [ ] unit counters/merge/DTO
- [ ] e2e happy path + biên giờ VN
- [ ] e2e 401/403/422
- [ ] toàn bộ suite cũ vẫn pass

## Success Criteria
- Mọi test pass, không mock DB; test cũ không vỡ.

## Risk Assessment
- DB test thiếu permission row → `findUniqueOrThrow` fail; mitigation: chạy seed trong setup doc.
- Flaky do giờ hệ thống → chỉ dùng custom range cố định ở e2e.

## Security Considerations
- E2E bao gồm kiểm 403 (chống lộ thống kê cho non-admin).

## Next Steps
- Phase 06 docs.

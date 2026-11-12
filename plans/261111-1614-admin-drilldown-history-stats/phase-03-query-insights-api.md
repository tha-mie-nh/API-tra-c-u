# Phase 03 — Query insights API: top, latency, hoạt động user/IP, bất thường

## Context Links
- phase-01 (builder, COUNTERS/P95, audit capture, CSV util, `query-insights-types.ts`)
- `apps/api/src/history/sensitive-value-mask.util.ts` (quy tắc sensitive)
- `apps/api/src/main.ts` (chưa set `trust proxy`)

## Status
done (2026-11-11). e2e: query-insights 16 + anomalies 11 pass.

## Overview
P1. BE agent B. Module mới `apps/api/src/query-insights/`, controller `admin/query-insights`, quyền **`history:view_all`** cho mọi route (CSV: `history:export`). 7h. Ownership: `apps/api/src/query-insights/**`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (chỉ trust proxy), `apps/api/test/query-insights*.e2e-spec.ts`.

## Key Insights
- Mọi bảng nhận cùng `queryLogFilterQuerySchema` → số top khớp tuyệt đối với `/history?<cùng filter>&userId=..`.
- **`query_params` lưu giá trị thật** (QueryLogService `mask:false`) → đếm "một CCCD bị nhiều user tra" làm **chính xác** được ở SQL. Giới hạn: chỉ field input trùng tên field output `sensitive:true` (cùng quy tắc che); row cũ ghi trước khi đổi sang lưu thật có giá trị đã che (`****1234`) → loại các giá trị chứa `*`; datasource không khai `sensitive` → không phát hiện; không chuẩn hoá ngoài `trim`+`upper`.
- Không có `trust proxy` → sau nginx/docker `request.ip` = IP proxy → trang IP vô nghĩa. Thêm env `TRUST_PROXY` (vd `loopback, uniquelocal`), mặc định tắt (giữ hành vi cũ); ghi deployment-guide.

## Endpoints (types trong `packages/shared/src/query-insights-types.ts`)
| Path (GET, prefix `/api/v1/admin/query-insights`) | Zod | Response | Audit |
|---|---|---|---|
| `/top-users` | filter + `metric: requests\|failed\|denied\|gap` (default requests), `limit` 1–100 (20) | `QueryInsightsTopUserRow[]` = `{userId\|null, username, ...QueryStatsCounters, p95DurationMs, lastAt}` | — |
| `/top-errors` | filter + limit | `QueryInsightsErrorRow[]` `{errorCode\|null, statusCode\|null, count}` (vị từ `status<>'success'`, tái dùng SQL topErrors của stats) | — |
| `/datasource-latency` | filter | `QueryInsightsLatencyRow[]` `{datasourceCode, name, requests, avgDurationMs, p95DurationMs, maxDurationMs}` sort p95 desc NULLS LAST | — |
| `/users/:userId/activity` | `userId` uuid; filter (range) | `QueryInsightsUserActivity {user:{id,username,fullName,status,lastLoginAt}\|null, username, firstAt, lastAt (toàn thời gian), totals, byDatasource[], ips[{ip,count,firstAt,lastAt}], userAgents[{userAgent,count,lastAt}]}` | `query_log.view_user_activity`, targetType `user`, `targetParam:'userId'` |
| `/ips/:ip/activity` | `ip` v4/v6; filter | `QueryInsightsIpActivity {ip, firstAt, lastAt, totals, users[{userId,username,count,firstAt,lastAt}], multiAccount, byDatasource[], userAgents[]}` | `query_log.view_ip_activity`, targetType `ip`, `targetParam:'ip'` |
| `/anomalies` | filter (from/to bắt buộc, ≤ 90 ngày) | `QueryInsightsAnomalies {rules, spikes[], offHours[], sharedIdentities[], sharedIps[]}`, mỗi list ≤100 | `query_insights.view_anomalies`, targetType `query_insights` |
| `/export.csv` | `table: top-users\|top-errors\|datasource-latency\|anomalies-spikes\|anomalies-off-hours\|anomalies-shared-identities\|anomalies-shared-ips` + filter | CSV | `query_insights.export_csv`, `auditExtra={table, rows}` — quyền `history:export` |

- Timeline của user/IP = `GET /history?userId=` / `?ip=` (DRY, không endpoint riêng).
- Metric `ORDER BY` qua map whitelist `Prisma.raw`.

## Quy tắc bất thường (hằng trong shared `QUERY_INSIGHTS_RULES`, trả về trong `rules` để UI hiện)
1. **Spike**: theo user × ngày VN `D` trong range. `count(D)` vs `baseline = SUM(count D-7..D-1)/7` (ngày không có query = 0, tính bằng window `RANGE BETWEEN INTERVAL '7 days' PRECEDING AND INTERVAL '1 day' PRECEDING` trên `date` VN; truy vấn mở rộng `from-7d`). Cờ khi `count ≥ 20 AND count ≥ 3 × baseline`. User mới (baseline 0) bị cờ khi ≥20 — chủ ý. Row: `{userId, username, day, count, baselineAvg}` → drill-down chính xác `/lich-su?userId&from=<D 00:00 VN>&to=<D+1>`.
2. **Ngoài giờ làm việc**: giờ VN; giờ làm = **Thứ 2–Thứ 6, 07:00–17:59** (`[07:00,18:00)`); T7, CN = ngoài giờ cả ngày. **Không** biết ngày lễ (nói rõ). Row theo user: `{userId, username, offHoursCount, total, ratio, firstAt, lastAt}`, chỉ user có offHoursCount ≥ 1, sort desc. Drill-down chính xác qua filter `offHours=true` (cùng biểu thức SQL trong builder).
3. **Một CCCD/tham số bị nhiều user tra**: `CROSS JOIN LATERAL jsonb_each_text(query_params) p(key,value)`, `p.key = ANY($sensitiveKeys)` (tính từ registry, helper `getSensitiveInputFieldNames(entry)` đã tách ở phase 01 trong `sensitive-value-mask.util.ts` — phase 03 chỉ import), `status <> 'denied'`, `value NOT LIKE '%*%'`, gom theo `upper(trim(value))`; cờ khi `COUNT(DISTINCT user_id) ≥ 3`. Row: `{fieldNames[], valueDisplay (maskValue trừ khi view_sensitive), datasourceCodes[], distinctUsers, requests, users[{userId,username,count}], firstAt, lastAt}`. **Drill-down không chính xác** (Lịch sử không có lọc theo giá trị tham số — ngoài phạm vi để không đưa CCCD vào URL/audit); UI dẫn sang từng user + datasource + range (ghi rõ "xấp xỉ").
4. **IP dùng nhiều tài khoản** (phục vụ yêu cầu trang IP): IP có `COUNT(DISTINCT user_id) ≥ 2` trong range. Row `{ip, distinctUsers, usernames[], requests, lastAt}` → `/quan-tri/phan-tich-tra-cuu/ip/:ip`.

## Architecture
- `query-insights.module.ts`, `query-insights.controller.ts` (<200 dòng; nếu vượt tách `query-insights-activity.controller.ts`).
- `query-insights-top-sql.repository.ts` (top-users/errors/latency), `query-insights-activity-sql.repository.ts` (user/IP), `query-insights-anomaly-sql.repository.ts` (4 rule).
- `query-insights.service.ts` (ghép, che `valueDisplay`), `query-insights-csv.service.ts` (cột theo table, dùng `toCsvCell`).
- `dto/query-insights-query.dto.ts` (extend schema chung).

## Implementation Steps
1. Module + top-users/top-errors/latency.
2. User/IP activity + audit.
3. Anomaly 4 rule (từng SQL có spec ở mức e2e vì phụ thuộc PG).
4. CSV export.
5. `TRUST_PROXY` trong main.ts + `.env.example` (phase 03 sở hữu `.env.example` dòng này).
6. E2E (`query-insights.e2e-spec.ts`, `query-insights-anomalies.e2e-spec.ts`):
   - top-users mỗi row: `requests/failed/denied` = `/history?userId=..&<filter>` total; latency p95 so với tính tay trên fixture (percentile_cont nội suy).
   - view_own → 403 mọi route; view_all không `export` → 403 CSV.
   - audit row cho user/IP activity, anomalies, CSV; `after.filters` đúng; không có danh sách users/values trong audit.
   - spike: user 25 query ngày D, 7 query rải 7 ngày trước → cờ; user 25 vs baseline 10/ngày → không cờ. off-hours: row 17:59:59 VN T6 không cờ, 18:00:00 cờ, 06:59:59 cờ, T7 10:00 cờ. shared identity: 3 user cùng CCCD (khác datasource) → cờ; 2 user → không; giá trị chứa `*` bị loại; role không view_sensitive thấy giá trị che.

## Todo List
- [x] module + top/latency
- [x] user/IP activity + audit
- [x] anomalies 4 rule
- [x] CSV insights
- [x] TRUST_PROXY
- [x] 2 e2e file

## Success Criteria
E2E xanh; số top = số Lịch sử cùng filter; không lộ giá trị sensitive cho người thiếu `view_sensitive`.

## Risk Assessment
- `jsonb_each_text` trên range dài chậm → giới hạn 90 ngày + EXPLAIN ở phase 08.
- Ngưỡng (20, ×3, 3 user, giờ 7–18) là phỏng đoán → hằng shared, dễ chỉnh; hỏi leader.

## Security Considerations
Toàn bộ view_all; audit mọi lần xem user/IP/bất thường/CSV; không đưa giá trị CCCD vào URL hay audit.

## Next Steps
Phase 07 (UI), 08 (EXPLAIN).

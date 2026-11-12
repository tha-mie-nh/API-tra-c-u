# Kiến trúc hệ thống

Monorepo pnpm gồm 3 package: `apps/api` (NestJS + Prisma), `apps/web` (React + Vite) và
`packages/shared` (type/hằng số dùng chung FE + BE). Dữ liệu chính ở Postgres, schema `app`.
Chi tiết API và bộ lọc drill-down: [`query-log-drilldown-and-insights.md`](./query-log-drilldown-and-insights.md).

## Contents
- [Thành phần](#1-thành-phần)
- [Luồng ghi: lượt tra cứu → query_logs](#2-luồng-ghi-lượt-tra-cứu--query_logs)
- [Luồng đọc: query_logs → Thống kê / Lịch sử / Phân tích](#3-luồng-đọc-query_logs--thống-kê--lịch-sử--phân-tích)
- [Where-builder dùng chung](#4-where-builder-dùng-chung-nguồn-duy-nhất-của-bộ-lọc)
- [Phân quyền](#5-phân-quyền)
- [Audit (capture: request)](#6-audit-capture-request)
- [CSV an toàn](#7-csv-an-toàn)
- [Che dữ liệu nhạy cảm](#8-che-dữ-liệu-nhạy-cảm)
- [Múi giờ và khoảng thời gian](#9-múi-giờ-và-khoảng-thời-gian)
- [Phân trang](#10-phân-trang)

## 1. Thành phần

| Package / module | Vai trò |
|---|---|
| `apps/api/src/query/` | `POST /query/:code`: chạy lượt tra cứu, quyền `api:*` theo `:code` |
| `apps/api/src/history/` | Ghi `query_logs` (`QueryLogService`, writer duy nhất) + đọc Lịch sử (list/summary/detail/CSV) |
| `apps/api/src/history/query-log-filter/` | Zod schema bộ lọc, `resolveQueryLogScope`, `buildQueryLogWhereSql`, biểu thức đếm `COUNTERS` / `GAP_SQL` |
| `apps/api/src/query-stats/` | Thống kê tổng hợp theo preset/granularity + so sánh kỳ trước (`admin:query_stats`) |
| `apps/api/src/query-insights/` | Top user/lỗi/độ trễ, hoạt động user/IP, bất thường, CSV (`history:view_all`) |
| `apps/api/src/audit/` | `@AuditAction` + `AuditInterceptor` (global) ghi `audit_logs` |
| `apps/api/src/common/csv/` | `toCsvRow` / `toCsvCell` chống CSV injection |
| `apps/web/src/features/history/` | Trang Lịch sử: bộ lọc trên URL, bảng, summary, dialog chi tiết, xuất CSV |
| `apps/web/src/features/admin/query-stats/` | Thống kê: thẻ số, biểu đồ, bảng; số bấm được → Lịch sử |
| `apps/web/src/features/admin/query-insights/` | Phân tích: tab Tổng quan / Bất thường, trang user và IP |
| `packages/shared/src/query-log-filter-types.ts` | Từ vựng bộ lọc (`QUERY_LOG_FILTER_KEYS`), `__null__`, `STATS_COUNTER_HISTORY_FILTER` |
| `packages/shared/src/query-insights-types.ts` | `QUERY_INSIGHTS_RULES` (ngưỡng bất thường) + type response |
| `packages/shared/src/permission-codes.ts` | Hằng số quyền feature |

Bảng dữ liệu: `app.query_logs` (một dòng mỗi lượt tra cứu, kể cả lượt bị từ chối).

## 2. Luồng ghi: lượt tra cứu → query_logs

```
POST /query/:code
  ├─ DatasourcePermissionGuard ── không có api:* ──► QueryLogService.recordDenied (status=denied, 403)
  ├─ validate params (zod từ config) ── lỗi ──► ghi failed (status_code 422)
  ├─ adapter gọi upstream ── lỗi ──────────────► ghi failed (status_code = HTTP đã dịch, vd 504)
  └─ thành công ──► ghi success (200) + record_count = số bản ghi trong trang trả về
                         │
                         ▼
QueryLogService.record()  (writer DUY NHẤT)
  - params: lưu giá trị THẬT (summarizeQueryParams mask:false)
  - ip: normalizeClientIp → IP hợp lệ, '::ffff:x.x.x.x' → 'x.x.x.x', IP rác → NULL
  - lỗi ghi log: chỉ log lỗi, không làm hỏng lượt tra cứu của user
```

Ghi chú:
- Denied được ghi ngay tại guard, trước khi biết params (không có `params`, `record_count`).
- `ip` lấy từ `request.ip`. Sau reverse proxy phải đặt `TRUST_PROXY` (xem [`deployment-guide.md`](./deployment-guide.md)).

## 3. Luồng đọc: query_logs → Thống kê / Lịch sử / Phân tích

```
                       ┌─ buildQueryLogWhereSql(filter, scope) ─┐
app.query_logs ◄───────┤  (cùng một mệnh đề WHERE cho mọi nơi)  │
                       └────────────────────────────────────────┘
  │                         │                          │
  ▼                         ▼                          ▼
query-stats            history (/history)         query-insights
 overview, detail       list, summary, :id,        top-users, top-errors,
 (aggregate theo        export.csv                 datasource-latency,
  bucket VN)            (SQL tham số hóa)          users/:id/activity,
                                                   ips/:ip/activity,
                                                   anomalies, export.csv
```

Hệ quả: một số đếm ở Thống kê và tổng số dòng ở Lịch sử với cùng bộ lọc **phải bằng nhau**. Bảng
ánh xạ số → bộ lọc nằm trong `STATS_COUNTER_HISTORY_FILTER` (shared), FE và test đối chiếu cùng dùng bảng đó.

## 4. Where-builder dùng chung (nguồn duy nhất của bộ lọc)

File: `apps/api/src/history/query-log-filter/query-log-where-sql.builder.ts`.

| Quy tắc | Nội dung |
|---|---|
| Một nguồn | Stats, Lịch sử (list/summary/CSV/count), Phân tích đều gọi `buildQueryLogWhereSql` |
| Khoảng thời gian | Nửa mở `[from, to)`: `created_at >= from AND created_at < to` |
| Tham số hóa | Mọi giá trị người dùng là bind parameter (`Prisma.sql`), không nối chuỗi |
| Scope ép cuối | `scope.forcedUserId` (view_own) được AND vào sau cùng và xoá `userId/username/ip` từ filter |
| Outcome | `answered`, `empty`, `gap` dùng đúng công thức đã định nghĩa (xem tài liệu drill-down) |
| Off-hours | Điều kiện giờ làm việc lấy từ `QUERY_INSIGHTS_RULES` (hằng số, không phải input) |
| Ghép SQL | Chỉ `Prisma.raw` cho hằng số whitelist (cột sắp xếp, bucket, metric) |

Validate đầu vào: `query-log-filter-query.schema.ts` (zod). Dùng cho `/history`, `/history/summary`,
`/history/export.csv`, `/admin/query-insights/*`. Thống kê dùng `query-stats/*.dto.ts` (preset/custom) và
gọi builder với `from`, `to`, `datasourceCode`.

## 5. Phân quyền

| Quyền | Loại | Seed cấp cho | Cho phép |
|---|---|---|---|
| `history:view_own` | FEATURE | OPERATOR | `/history` và `/history/:id` chỉ của chính mình; `userId/username/ip` trong query bị bỏ qua |
| `history:view_all` | FEATURE | AUDITOR, ADMIN | Toàn bộ `/history` (kể cả summary, datasources), toàn bộ `/admin/query-insights/*` |
| `history:view_sensitive` | FEATURE | ADMIN | Xem giá trị sensitive chưa che |
| `history:export` | FEATURE | ADMIN | `export.csv` lịch sử (cần thêm view_own hoặc view_all); `export.csv` phân tích (cần thêm view_all) |
| `admin:query_stats` | FEATURE | ADMIN | `/admin/query-stats/*` |

- **Một điểm quyết định scope:** `resolveQueryLogScope` (`query-log-filter/resolve-query-log-scope.ts`).
  Không có `history:view_all` → scope bị ép về `user.id`. Không đọc scope từ query string.
- Trả về 404 (không 403) khi view_own xem bản ghi của người khác: không xác nhận sự tồn tại.
- Quyền chỉ là feature/API: `history:export` một mình không đủ để xem dòng nào.
- Chi tiết gán quyền và seed: [`deployment-guide.md`](./deployment-guide.md) mục "Cập nhật".

## 6. Audit (capture: request)

`@AuditAction(action, targetType, { capture: 'request' })` ghi:
- `after = { filters: request.query, params: request.params, ...request.auditExtra }`;
- **không ghi response.** Response của Lịch sử/Phân tích có thể chứa CCCD thật, nên không được đưa vào `audit_logs`.

Các action đang dùng: `query_log.view_detail`, `query_log.export_csv`, `query_log.view_user_activity`,
`query_log.view_ip_activity`, `query_insights.view_anomalies`, `query_insights.export_csv`
(danh sách đầy đủ và nội dung ghi: [`query-log-drilldown-and-insights.md`](./query-log-drilldown-and-insights.md#9-audit)).
Export ghi thêm số dòng (`matched`, `exported`, `truncated`, `maxRows` hoặc `table`, `rows`) qua `req.auditExtra`.

## 7. CSV an toàn

File: `apps/api/src/common/csv/csv-safe-cell.util.ts`.
- Mọi ô được bọc `"..."`, dấu `"` nhân đôi; `null` thành ô trống; số/boolean không bọc.
- Ô bắt đầu bằng `=`, `+`, `-`, `@`, TAB hoặc CR được thêm `'` ở đầu (chống công thức Excel).
- BOM UTF-8 ở đầu file, xuống dòng CRLF.
- Lịch sử: stream theo batch keyset `(created_at, id)`, trần `HISTORY_EXPORT_MAX_ROWS` = 50.000 dòng.
  `to` được ghim tại thời điểm bắt đầu xuất để dòng mới không làm lệch phân trang.
- Phân tích: tối đa 100 dòng mỗi bảng (`maxRowsPerList`).

## 8. Che dữ liệu nhạy cảm

- `query_logs.query_params` lưu **giá trị thật** (không che lúc ghi). Comment cũ "masked before storage" đã lỗi thời.
- Che xảy ra **lúc đọc**, theo quyền `history:view_sensitive`: chỉ giữ 4 ký tự cuối, phần còn lại là `*`.
  Áp dụng cho list, detail, CSV, và `valueDisplay` của bất thường "CCCD dùng chung".
- Chỉ các field input có cùng tên với field `sensitive: true` trong `config.json` mới bị che.
- Dòng cũ đã lưu dạng `*` bị loại khỏi phát hiện "dùng chung".

## 9. Múi giờ và khoảng thời gian

- Múi giờ cố định `Asia/Ho_Chi_Minh` = UTC+7 (không DST), tính trong SQL (`AT TIME ZONE`) và trong code (`packages/shared/src/query-log-time-range.ts`).
- Bucket giờ/ngày/tháng cắt theo VN ở cả SQL lẫn FE. Không dùng UTC.
- Tất cả khoảng là **nửa mở `[from, to)`**:
  - `from` = `YYYY-MM-DD` → 00:00 VN ngày đó.
  - `to` = `YYYY-MM-DD` → 00:00 VN **ngày hôm sau** (bao trọn ngày `to`).
  - `to` dạng datetime có offset → đúng thời điểm đó (exclusive).
  - FE khi chọn `to` có giờ:phút sẽ gửi phút kế tiếp để gồm cả phút đã chọn.

## 10. Phân trang

| Nơi | Cách | Giới hạn |
|---|---|---|
| `/history` | Offset (`page`, `pageSize`), `total` chính xác | `page * pageSize <= 10.000`; `pageSize` tối đa 100 |
| Sắp xếp | Whitelist `createdAt`, `durationMs`, `recordCount` + tie-break `id DESC` | Không nhận chuỗi sắp xếp tự do |
| CSV lịch sử | Keyset `(created_at, id)` nội bộ | 50.000 dòng |
| Top / bất thường | `LIMIT` cố định hoặc theo `limit` | Tối đa 100 dòng |

Lý do chọn offset cho UI: giữ `total` khớp số Thống kê. Cursor UI chưa làm (ngoài phạm vi).
Chỉ mục phục vụ truy vấn: `(user_id, created_at)`, `(datasource_code, created_at)`, `(created_at)`,
`(ip, created_at)`, `(upstream_request_id)`. Chi tiết đo đạc: `plans/reports/fullstack-developer-261111-1736-phase-08-explain-query-logs.md`.

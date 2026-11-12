# Drill-down Lịch sử và Phân tích tra cứu

Admin đi từ một con số trên **Thống kê** → danh sách lượt tra cứu tạo ra nó (**Lịch sử**) → chi tiết
từng lượt → toàn bộ hoạt động của user hoặc IP → **Bất thường**. Mọi số hiển thị đều tính bằng cùng một
bộ lọc, nên số Thống kê bằng tổng số dòng Lịch sử khi bấm vào.

Kiến trúc và where-builder: [`system-architecture.md`](./system-architecture.md).
Công thức Thống kê gốc: [`query-stats-dashboard.md`](./query-stats-dashboard.md).

## Contents
- [Ai dùng được gì](#1-ai-dùng-được-gì)
- [Bộ lọc Lịch sử](#2-bộ-lọc-lịch-sử)
- [Outcome: answered / empty / gap](#3-outcome-answered--empty--gap)
- [Drill-down: số Thống kê → bộ lọc Lịch sử](#4-drill-down-số-thống-kê--bộ-lọc-lịch-sử)
- [API](#5-api)
- [Hoạt động user và IP](#6-hoạt-động-user-và-ip)
- [Bất thường](#7-bất-thường)
- [Xuất CSV](#8-xuất-csv)
- [Audit](#9-audit)
- [Che dữ liệu nhạy cảm](#10-che-dữ-liệu-nhạy-cảm)
- [Hiệu năng đã đo](#11-hiệu-năng-đã-đo)
- [Giới hạn đã biết và việc cần hỏi leader](#12-giới-hạn-đã-biết-và-việc-cần-hỏi-leader)

## 1. Ai dùng được gì

| Quyền | Lịch sử | Thống kê | Phân tích (`/admin/query-insights`) | CSV |
|---|---|---|---|---|
| `history:view_own` (OPERATOR) | Chỉ lượt của mình | — | — | Chỉ khi có thêm `history:export` |
| `history:view_all` (AUDITOR) | Toàn bộ | — | Toàn bộ | Cần thêm `history:export` (AUDITOR không có) |
| `admin:query_stats` (ADMIN) | — | Có | — | — |
| `history:export` (ADMIN) | — | — | Cần thêm `history:view_all` | Có |
| `history:view_sensitive` (ADMIN) | Thấy giá trị sensitive chưa che | — | Thấy CCCD chưa che trong "dùng chung" | Thấy chưa che |

- Link drill-down từ Thống kê chỉ hiện khi có `history:view_all` (vì Lịch sử của view_own bị ép về chính user).
- Quyền chỉ kiểm ở backend. Ẩn menu/nút ở FE chỉ là UX.

## 2. Bộ lọc Lịch sử

Dùng chung cho `/history`, `/history/summary`, `/history/export.csv`, `/admin/query-insights/*`
(trừ `metric`, `limit`). Tất cả tham số nằm trên URL của trang Lịch sử, nên reload, Back và chia sẻ link đều giữ nguyên.

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| `from` | `YYYY-MM-DD` hoặc datetime có offset | Date-only = 00:00 VN; nửa mở |
| `to` | `YYYY-MM-DD` hoặc datetime có offset | Date-only = bao trọn ngày (00:00 VN ngày sau); nửa mở `[from, to)` |
| `datasourceCode` | mã nguồn | Khớp đúng |
| `status` | CSV của `success`, `failed`, `denied` | Ví dụ `failed,denied` |
| `outcome` | `answered`, `empty`, `gap` | Xem mục 3 |
| `userId` | UUID hoặc `__null__` | `view_own`: bị bỏ qua |
| `username` | chuỗi | Chứa, không phân biệt hoa thường; `view_own`: bị bỏ qua |
| `statusCode` | 100–599 hoặc `__null__` | HTTP status thực tế |
| `errorCode` | `[A-Z0-9_]`, tối đa 100 ký tự, hoặc `__null__` | |
| `ip` | IPv4 hoặc IPv6 hợp lệ | `view_own`: bị bỏ qua. Khớp cả dạng `::ffff:x.x.x.x` cũ |
| `durationMinMs`, `durationMaxMs` | số nguyên ≥ 0 | `min > max` → 422. Dòng `durationMs` NULL không khớp khoảng |
| `hasRecords` | `true` / `false` | `true` = `record_count > 0`; `false` = `COALESCE(record_count,0) <= 0` |
| `upstreamRequestId` | chuỗi khớp đúng | |
| `offHours` | `true` | Chỉ lượt ngoài giờ làm việc (mục 7) |

Chỉ có trên `/history`: `page` (mặc định 1), `pageSize` (1–100, mặc định 20), `sort` (`createdAt` mặc định,
`durationMs`, `recordCount`), `order` (`asc` / `desc`, mặc định `desc`). Trên URL FE còn có `detail=<id>` để mở dialog chi tiết.

Quy tắc chung:
- Giá trị rỗng (`?status=`) được coi như không lọc.
- `__null__` là token duy nhất để lọc `IS NULL` (ví dụ `userId=__null__` = lượt không gắn user, `statusCode=__null__` = dòng cũ chưa có mã HTTP).
- `from >= to` → 422.

## 3. Outcome: answered / empty / gap

Định nghĩa trong `packages/shared/src/query-log-filter-types.ts` và `query-log-counters.sql.ts`.

| Outcome | Điều kiện SQL | Ý nghĩa |
|---|---|---|
| `answered` | `status = 'success' AND record_count > 0` | Có kết quả trả ra |
| `empty` | `status = 'success' AND COALESCE(record_count, 0) <= 0` | Thành công nhưng không có bản ghi (kể cả `record_count` NULL) |
| `gap` | `NOT (status = 'success' AND COALESCE(record_count, 0) > 0)` | Vào nhưng không ra kết quả = `requests − answered` |

Quan hệ: `answered + gap = requests`; `success = answered + empty`. Lượt `failed`/`denied` luôn nằm trong `gap`.
Với `record_count` NULL: lượt `success` là `empty`; lượt không phải `success` là `gap`.
Trong `GET /history/summary` các giá trị này được trả về là `answered`, `gap`, `empty`.

## 4. Drill-down: số Thống kê → bộ lọc Lịch sử

Bảng `STATS_COUNTER_HISTORY_FILTER` (`packages/shared/src/query-log-filter-types.ts`) là nguồn duy nhất
cho ánh xạ này. FE (`build-stats-drilldown-href.ts`) và test đối chiếu cùng dùng bảng đó.

| Số trên Thống kê | Bộ lọc Lịch sử thêm vào |
|---|---|
| Lượt tra (`requests`) | (không lọc trạng thái) |
| Có kết quả (`answered`) | `outcome=answered` |
| Chênh lệch vào-ra (`gap`) | `outcome=gap` |
| Rỗng (`empty`) | `outcome=empty` |
| Thành công (`success`) | `status=success` |
| Thất bại (`failed`) | `status=failed` |
| Bị từ chối (`denied`) | `status=denied` |
| Lỗi (`errors`) | `status=failed,denied` |
| Dòng "Mã lỗi phổ biến" (`errorCode`, `statusCode`) | `status=failed,denied`, `errorCode=<mã>` hoặc `__null__`, `statusCode=<mã>` hoặc `__null__` |

Thời gian và datasource:
- Ô tổng (thẻ): khoảng `range` của Thống kê.
- Cột biểu đồ (bucket): khoảng của bucket, **cắt theo khoảng của Thống kê** để cạnh biên khớp đúng.
- Dòng datasource: thêm `datasourceCode`.

Phân tích → Lịch sử: user trong bảng top gắn bộ lọc counter và `userId`; số "lượt ngoài giờ" gắn `offHours=true`;
số "lượt" trong bảng spike là đúng một ngày VN (`from`=00:00 ngày đó, `to`=00:00 ngày sau) và `userId`; số requests
của IP dùng chung gắn `ip`.

## 5. API

Base: `/api/v1` (Bearer token). Lỗi validate → `422`; thiếu quyền → `403` (`FORBIDDEN_API`).

### 5.1 Lịch sử (`/history`)

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/history` | `view_own` hoặc `view_all` | Danh sách, phân trang offset: `{ items, page, pageSize, total }` |
| GET | `/history/summary` | `view_all` | `total, success, failed, denied, answered, gap, empty, successRate, avgDurationMs, p95DurationMs`. Cùng bộ lọc với list, nên `total` = list `total` |
| GET | `/history/datasources` | `view_all` | Nguồn đang bật để chọn lọc |
| GET | `/history/export.csv` | `history:export` + (`view_own` hoặc `view_all`) | CSV, xem mục 8 |
| GET | `/history/:id` | `view_own` hoặc `view_all` | Chi tiết. Của người khác (view_own) → 404 |

Chi tiết (`QueryLogDetail`) có thêm: `queryParams` (đã che theo quyền), `errorMessage`, `upstreamRequestId`, `ip`, `userAgent`.

`p95DurationMs` dùng `percentile_cont(0.95)` (nội suy tuyến tính), bỏ qua `duration_ms` NULL, trả `null` khi không có dữ liệu.
`successRate = success / total` (`null` khi `total = 0`).

### 5.2 Thống kê (`/admin/query-stats`, quyền `admin:query_stats`)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/admin/query-stats/overview` | Tổng hợp toàn hệ thống |
| GET | `/admin/query-stats/datasources/:code` | Chi tiết 1 nguồn (`:code` không tồn tại → số 0, không 404) |

Tham số: `preset`, `granularity` (`hour` / `day` / `month`, ghi đè granularity tự động), `from`, `to` (chỉ khi `preset=custom`, `YYYY-MM-DD`).

| Preset | Khoảng (giờ VN) | Granularity mặc định |
|---|---|---|
| `today` | Hôm nay | `hour` |
| `yesterday` | Hôm qua | `hour` |
| `last_24h` | 24 giờ tròn kết thúc ở giờ hiện tại | `hour` |
| `last_7d` (**mặc định**) | 7 ngày gồm hôm nay | `day` |
| `last_30d` | 30 ngày gồm hôm nay | `day` |
| `last_90d` | 90 ngày gồm hôm nay | `day` |
| `this_month` | Tháng này | `day` |
| `last_month` | Tháng trước | `day` |
| `this_year` | Năm nay | `month` |
| `custom` | `from`..`to` (bao trọn ngày `to`), tối đa 366 ngày | Theo span |

Granularity tự động (khi không ghi đè): ≤ 2 ngày → `hour`; ≤ 90 ngày → `day`; > 90 ngày → `month`.
Số bucket tối đa 800: ví dụ `granularity=hour` cho 90 ngày (2.160 bucket) → `422`.

Phần `previous` (kỳ so sánh, nửa mở ISO UTC) trong `overview` và `datasources/:code`:

| Preset | Kỳ so sánh |
|---|---|
| `today`, `this_month`, `this_year` (đang chạy) | Cùng số giờ đã trôi qua, bắt đầu từ đầu ngày/tháng/năm trước; không vượt điểm bắt đầu kỳ hiện tại |
| `yesterday` | Ngày trước đó |
| `last_month` | Tháng trước đó |
| Các preset rolling, `custom` | Cùng độ dài, liền trước `from` |

Ở FE, chênh lệch ±% = `(current − previous) / previous`, làm tròn 1 chữ số; `null` khi `previous = 0`.

Bảng "Mã lỗi phổ biến" của Thống kê chỉ trả **10** dòng; Phân tích trả tối đa `limit` (mặc định 20, tối đa 100).

### 5.3 Phân tích (`/admin/query-insights`, quyền `history:view_all`)

| Method | Path | Tham số riêng | Trả về |
|---|---|---|---|
| GET | `/admin/query-insights/top-users` | `metric` = `requests` (mặc định) / `failed` / `denied` / `gap`; `limit` | Mỗi user: `requests, answered, gap, success, empty, failed, denied, errors, records, avgDurationMs, userId, username, p95DurationMs, lastAt` |
| GET | `/admin/query-insights/top-errors` | `limit` | `errorCode, statusCode, count` (không tính `success`) |
| GET | `/admin/query-insights/datasource-latency` | | `datasourceCode, name, requests, avgDurationMs, p95DurationMs, maxDurationMs`, sắp theo p95 giảm dần |
| GET | `/admin/query-insights/users/:userId/activity` | | Mục 6 |
| GET | `/admin/query-insights/ips/:ip/activity` | | Mục 6 |
| GET | `/admin/query-insights/anomalies` | | Mục 7 |
| GET | `/admin/query-insights/export.csv` | `table` (bắt buộc) | Mục 8 (cần thêm `history:export`) |

Mọi route Phân tích yêu cầu `from` và `to` (VN date hoặc datetime), khoảng tối đa **90 ngày**; vượt → `422`.
Thiếu `from`/`to` → `422`.

Ví dụ:
```bash
curl -s "http://localhost:3000/api/v1/admin/query-insights/top-users?from=2026-11-01&to=2026-11-11&metric=failed&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

## 6. Hoạt động user và IP

**`GET /admin/query-insights/users/:userId/activity`**
- Trong khoảng lọc: `totals` (counter như top-users), `byDatasource`, `ips` (tối đa 100, theo số lượt), `userAgents` (tối đa 100).
- Ngoài khoảng lọc (toàn thời gian): `firstAt`, `lastAt`.
- `user` = bản ghi user hiện tại (`null` nếu đã xoá); `username` lấy từ snapshot trong log nếu user đã xoá.
- Không có user và không có lượt nào → `404` (`USER_NOT_FOUND`).
- Lượt có `user_id` NULL không thuộc user nào: xem bằng `userId=__null__` trên Lịch sử.

**`GET /admin/query-insights/ips/:ip/activity`**
- `users`: user đã dùng IP này (tối đa 100 dòng), kèm số lượt và thời gian đầu/cuối.
- `multiAccount = true` khi có từ `sharedIpMinUsers` (2) tài khoản khác nhau.
- IP được gom theo dạng chuẩn: `::ffff:1.2.3.4` và `1.2.3.4` là một IP.

FE: trang user và trang IP là `/quan-tri/phan-tich-tra-cuu/nguoi-dung/:userId` và `/quan-tri/phan-tich-tra-cuu/ip/:ip`.
Dòng thời gian của user là danh sách Lịch sử lọc theo `userId`.

## 7. Bất thường

Trả về `rules` (ngưỡng đang áp dụng) cùng 4 danh sách. Tất cả chỉ là **đánh dấu để admin xem**, không tự khoá
hay cảnh báo. Ngưỡng nằm trong `QUERY_INSIGHTS_RULES` (`packages/shared/src/query-insights-types.ts`), FE đọc từ `rules` để hiển thị.

| Ngưỡng | Giá trị |
|---|---|
| `spikeMinCount` | 20 lượt/ngày |
| `spikeBaselineMultiplier` | 3 |
| `spikeBaselineDays` | 7 |
| `workStartHour` / `workEndHour` | 7 / 18 (giờ VN, `[7, 18)`) |
| `sharedIdentityMinUsers` | 3 user |
| `sharedIpMinUsers` | 2 user |
| `maxRangeDays` | 90 |
| `maxRowsPerList` | 100 |

### 7.1 Tăng đột biến (`spikes`)
- Đơn vị: một user trong một ngày VN.
- Cảnh báo khi: `count >= 20` **và** `count × 7 >= 3 × tổng lượt của 7 ngày VN liền trước` (tức là `count >= 3 ×` trung bình 7 ngày trước).
- Kết quả: `userId, username, day, count, baselineAvg` (`baselineAvg` = tổng 7 ngày / 7). Sắp theo `count` giảm dần, tối đa 100.
- Baseline dùng **cùng bộ lọc** với khoảng (datasource, status...), chỉ kéo `from` lùi thêm 7 ngày.
- Baseline bằng 0 (user mới, hoặc 7 ngày trước không có lượt) → mọi ngày có từ 20 lượt đều bị đánh dấu (xem mục 12).

### 7.2 Ngoài giờ (`offHours`)
- Lượt "ngoài giờ" = thứ 7, chủ nhật (VN), hoặc giờ VN `< 7` hoặc `>= 18`.
- Một user được liệt kê khi có **ít nhất 1** lượt ngoài giờ. Không có ngưỡng số lượng.
- Kết quả: `offHoursCount, total, ratio` (làm tròn 3 chữ số), `firstAt, lastAt` (của lượt ngoài giờ). Sắp theo `offHoursCount` giảm dần, tối đa 100.
- Ngày lễ **không** được tính là ngoài giờ.

### 7.3 CCCD / tham số dùng chung (`sharedIdentities`)
- Chỉ xét field **input** có cùng tên với field output `sensitive: true` của cùng nguồn (lấy từ `config.json`).
- Chỉ xét lượt có `user_id` và không phải `denied`. Bỏ giá trị rỗng và giá trị chứa `*` (dòng cũ đã che).
- Chuẩn hoá `UPPER(TRIM(value))`, gom theo giá trị. Cảnh báo khi có từ `3` user khác nhau.
- Gom theo **giá trị**, không theo field hay nguồn: cùng một giá trị ở 2 field khác nhau vẫn tính chung.
- Kết quả: `fieldNames`, `valueDisplay` (che 4 ký tự cuối nếu không có `history:view_sensitive`), `datasourceCodes`,
  `distinctUsers`, `requests`, `users` (tối đa 20 user, theo số lượt), `firstAt`, `lastAt`. Sắp theo số user giảm dần, tối đa 100.
- Đây là so khớp **chuỗi đúng**, chỉ xấp xỉ: không chuẩn hoá định dạng CCCD (khoảng trắng bên trong, dấu chấm, số 0 đầu)
  nên các cách viết khác nhau không được gộp.

### 7.4 IP dùng chung (`sharedIps`)
- Chỉ xét lượt có IP và có `user_id`. IP được gom theo dạng chuẩn.
- Cảnh báo khi có từ `2` user khác nhau dùng cùng IP.
- Kết quả: `ip, distinctUsers, usernames` (tối đa 10), `requests`, `lastAt`. Sắp theo số user giảm dần, tối đa 100.
- **Chỉ có ý nghĩa khi `TRUST_PROXY` đúng.** Sau proxy mà chưa cấu hình, mọi user đều có IP của proxy và danh sách sẽ đầy "IP dùng chung" giả.
  Xem [`deployment-guide.md`](./deployment-guide.md#trust_proxy-ip-thật-sau-reverse-proxy).

## 8. Xuất CSV

| Endpoint | Quyền | Nội dung | Giới hạn | Tên file |
|---|---|---|---|---|
| `GET /history/export.csv` | `history:export` + (`view_own` hoặc `view_all`) | Đúng các dòng của danh sách Lịch sử theo bộ lọc hiện tại (15 cột) | **50.000 dòng** | `lich-su-tra-cuu-YYYYMMDD-HHmm.csv` (giờ VN) |
| `GET /admin/query-insights/export.csv?table=...` | `history:export` + `history:view_all` | Đúng các bảng JSON của Phân tích | **100 dòng/bảng** | `phan-tich-tra-cuu-<table>-YYYYMMDD-HHmm.csv` |

Giá trị `table`: `top-users`, `top-errors`, `datasource-latency`, `anomalies-spikes`, `anomalies-off-hours`,
`anomalies-shared-identities`, `anomalies-shared-ips`.

- Lịch sử: `to` được ghim tại lúc bắt đầu xuất, nên dòng mới phát sinh trong lúc xuất không làm lệch phân trang.
  Khi kết quả vượt 50.000, file chỉ có 50.000 dòng đầu (sắp mới nhất trước) và header `X-Export-Truncated: true`.
- Header phản hồi: `X-Export-Total` (số khớp), `X-Export-Exported` (số dòng ghi), `X-Export-Truncated`.
- Ô bắt đầu bằng `= + - @` có tiền tố `'`; mọi ô được bọc `"`; có BOM UTF-8 và CRLF. Chi tiết: [`system-architecture.md`](./system-architecture.md#7-csv-an-toàn).
- Cột `Điều kiện tra cứu (đã che)` được che theo quyền xem. `errorMessage`, `userAgent`, `upstreamRequestId` không che (hiện là thông báo cố định, không chứa dữ liệu đầu vào).

## 9. Audit

Các route dưới đây ghi `audit_logs` với `capture: 'request'`: `after` = `{ filters, params, ...extra }`, **không ghi response**.

| Action | Target | Khi nào | Nội dung chính |
|---|---|---|---|
| `query_log.view_detail` | `query_log` / id | `GET /history/:id` thành công | `filters`, `params` (có `id`) |
| `query_log.export_csv` | `query_log` | `GET /history/export.csv` | `filters`, `matched`, `exported`, `truncated`, `maxRows` |
| `query_log.view_user_activity` | `user` / userId | `GET .../users/:userId/activity` | `filters`, `params` |
| `query_log.view_ip_activity` | `ip` / ip | `GET .../ips/:ip/activity` | `filters`, `params` |
| `query_insights.view_anomalies` | `query_insights` | `GET .../anomalies` | `filters` |
| `query_insights.export_csv` | `query_insights` | `GET .../export.csv` | `filters`, `table`, `rows` |

Lưu ý:
- `filters` lấy từ `request.query` **chưa qua whitelist** (xem mục 12).
- Dòng audit của export được ghi khi handler trả về, trước khi stream CSV đọc hết. Nếu client ngắt giữa chừng, `exported` vẫn ghi số dòng đầy đủ.
- **Không** có audit cho: `GET /history` (list), `/history/summary`, `/history/datasources`, Thống kê (`/admin/query-stats/*`), top-users, top-errors, datasource-latency.
  Đây là chủ ý theo mức nhạy cảm đã chọn; nếu cần đổi, cần quyết định của leader.

## 10. Che dữ liệu nhạy cảm

- `query_logs.query_params` lưu **giá trị thật** của tham số (để ADMIN thấy đúng mã tra cứu). Không có bước che lúc ghi.
- Che lúc đọc, theo `history:view_sensitive`, áp dụng cho: list, detail, CSV, `valueDisplay` của "CCCD dùng chung".
- Chỉ che field có tên trùng field `sensitive` trong `config.json`. Nếu đổi tên field hoặc bỏ cờ `sensitive` trong config,
  giá trị của dòng cũ có thể hiện ra cho người không có quyền (hành vi an toàn đã ghi trong code, nhưng cần nhớ khi sửa config).
- Lượt bị từ chối (`denied`) không có params.

## 11. Hiệu năng đã đo

Đo trên Postgres test với **2.000.000 dòng** giả, 366 ngày, 50 user, 12 nguồn, 1.800 IP (WSL2, `shared_buffers` 128 MB,
trung vị 3 lần). Chi tiết: [`plans/reports/fullstack-developer-261111-1736-phase-08-explain-query-logs.md`](../plans/reports/fullstack-developer-261111-1736-phase-08-explain-query-logs.md).

| Truy vấn | Thời gian (ms) |
|---|---|
| Lịch sử, 30 ngày, sắp theo thời gian (sau khi bỏ `NULLS LAST` cho `created_at`) | ~1 |
| Lịch sử, lọc `ip` không khoảng thời gian (sau index mới) | ~10 |
| Lịch sử, `upstreamRequestId` (sau index mới) | ~0,2 |
| Đếm / summary + p95, 30 ngày | 100–700 |
| Thống kê gom 90–366 ngày (timeseries, top-users, latency, spikes, sharedIps) | khoảng 1.000–4.000 |
| Bất thường "CCCD dùng chung", 90 ngày | khoảng 15.000–20.000 (chưa tối ưu) |

Số đo trên WSL, dữ liệu giả, một lần chạy; chỉ dùng để so sánh tương đối.

## 12. Giới hạn đã biết và việc cần hỏi leader

### 12.1 Cần quyết định (hỏi leader)

| # | Việc | Trạng thái |
|---|---|---|
| Q-A | **Retention / dọn `query_logs`** chưa làm: không có job xoá hay gộp log cũ. Bảng sẽ phình theo thời gian và các truy vấn 90–366 ngày chậm dần. | Ngoài phạm vi lần này (theo yêu cầu). Cần quyết thời hạn lưu |
| Q-B | **Ngưỡng bất thường và giờ làm việc là phỏng đoán**: 20 lượt/ngày, gấp 3 lần, 3 user cho CCCD, 2 user cho IP, giờ làm 7–18 T2–T6. | Cần xác nhận với nghiệp vụ |
| Q-C | **Ngày lễ không được tính** là ngoài giờ. | Chưa có danh sách ngày lễ |
| Q-D | **AUDITOR** có `history:view_all` nên xem được **toàn bộ** Phân tích (top, user, IP, bất thường; CCCD vẫn che). | Có nên tách quyền riêng cho Phân tích? |
| Q-E | **Spike khi baseline = 0**: user mới có ≥20 lượt trong ngày đầu bị đánh dấu. Cần ngưỡng baseline tối thiểu? | Chưa quyết (review: Q1) |
| Q-F | **Clock của `created_at`**: export pin `to` theo giờ app; nếu giờ DB lệch giờ app có thể mất dòng ở mép. | Cần xác nhận DB default `now()` và đồng bộ giờ |

### 12.2 Giới hạn kỹ thuật

| Giới hạn | Tác động |
|---|---|
| `GET /history`, `/history/summary`, `/history/export.csv` **không bắt buộc khoảng thời gian** | Không có `from`/`to` = quét cả bảng (`COUNT`, p95). Có thể chậm rõ khi bảng rất lớn. Nên thêm giới hạn hoặc mặc định khoảng |
| Thống kê gom 90–366 ngày trên 2 triệu dòng | Khoảng 1–4 s (đo ở mục 11) |
| "CCCD dùng chung" trên 2 triệu dòng, 90 ngày | Khoảng 15–20 s. Chưa tối ưu (phương án đã thử nhưng chưa áp dụng: `GROUP BY` thường trước khi `string_agg`) |
| Anomaly CSV tính lại cả 4 truy vấn bất thường mỗi lần xuất một bảng | Tốn thời gian khi xuất; cần chỉ chạy đúng truy vấn của bảng |
| `sharedIdentities` gom user bằng `jsonb_agg` rồi cắt 20 trong JS | Tốn bộ nhớ khi giá trị có nhiều user |
| `records` (`SUM(record_count)`) ép về `int4` | Tràn nếu tổng vượt 2,1 tỷ (rất khó xảy ra; `records` chỉ để tham khảo) |
| Audit `filters` lấy từ `request.query` thô | Có thể chứa key lạ hoặc username/ip; chưa whitelist |
| Dữ liệu cũ IP `::ffff:x.x.x.x` chưa migrate | Đọc và lọc được cả hai dạng; không ghi lại dữ liệu cũ |
| `TRUST_PROXY` chưa cấu hình trên prod | IP là IP của proxy: trang IP và "IP dùng chung" vô nghĩa |
| Số lượt top/bất thường bị giới hạn 100 | Dòng ngoài top không hiển thị; CSV cũng chỉ 100 dòng/bảng |
| Chưa kiểm tra giao diện trên trình duyệt thật | Mới kiểm bằng unit/e2e và typecheck |
| `apps/api/test/query.e2e-spec.ts` fail 5/7 từ trước | Dùng datasource `CITIZEN_BASIC` đã tắt trong `config.json`, không liên quan tính năng này |

Các mục khác đã sửa trong đợt này (không còn là giới hạn): khoảng `to` có giờ:phút gồm cả phút đã chọn; `outcome=gap`
và top-users dùng cùng công thức (NULL `record_count` tính là gap); IP rác không còn làm mất dòng log (lưu NULL).

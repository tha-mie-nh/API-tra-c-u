# Thống kê tra cứu (Query stats dashboard)

Dashboard cho admin xem luồng tra cứu: lượt vào, lượt có kết quả trả ra, chênh lệch, lỗi và mã lỗi.
Tổng hợp toàn hệ thống và chi tiết từng datasource, theo 9 preset cố định hoặc khoảng tự chọn.
Mỗi số bấm được và mở **Lịch sử** với đúng bộ lọc đó (xem [`query-log-drilldown-and-insights.md`](./query-log-drilldown-and-insights.md)).
Dữ liệu đọc trực tiếp từ bảng `app.query_logs`, không có bảng tổng hợp.

## Contents
- [Quyền](#quyền)
- [API](#api)
- [Granularity và bucket](#granularity-và-bucket)
- [Kỳ so sánh (previous)](#kỳ-so-sánh-previous)
- [Công thức chỉ số](#công-thức-chỉ-số)
- [Màn hình và drill-down](#màn-hình-và-drill-down)
- [Giới hạn đã biết](#giới-hạn-đã-biết)

## Quyền

| Permission | Kind | Ai có |
|---|---|---|
| `admin:query_stats` | FEATURE | ADMIN (seed tự cấp). Role khác: tick "Thống kê tra cứu" ở **Quản trị → Vai trò & quyền** |

Thiếu quyền → `403`. Không có token → `401`.
Bấm số để mở Lịch sử chỉ hiện khi người xem có thêm `history:view_all`.

## API

Base path: `/api/v1/admin/query-stats` (Bearer token, Swagger tag `Admin — Query stats`).

| Method | Path | Mô tả |
|---|---|---|
| GET | `/overview` | Tổng hợp toàn hệ thống: `range`, `totals`, `previous`, `byDatasource`, `timeseries`, `topErrors` |
| GET | `/datasources/:code` | Chi tiết 1 datasource: `range`, `datasource`, `totals`, `previous`, `timeseries`, `topErrors` |

`:code` khớp `^[A-Za-z0-9_-]{1,100}$`. Code không tồn tại (hoặc đã xoá khỏi config) trả số 0, **không** 404.

### Query params (dùng chung cho cả 2 endpoint)

| Tham số | Giá trị | Mặc định | Ghi chú |
|---|---|---|---|
| `preset` | `today`, `yesterday`, `last_24h`, `last_7d`, `last_30d`, `last_90d`, `this_month`, `last_month`, `this_year`, `custom` | `last_7d` (7 ngày qua) | Khoảng theo lịch VN, xem bảng dưới |
| `granularity` | `hour`, `day`, `month` | Tự động theo khoảng | Ghi đè granularity tự động |
| `from` | `YYYY-MM-DD` | — | Bắt buộc khi `preset=custom` |
| `to` | `YYYY-MM-DD` | — | Bắt buộc khi `preset=custom`; `from <= to`; tối đa 366 ngày (tính cả 2 đầu) |

Input sai (thiếu `from`/`to`, sai định dạng, ngày không tồn tại, vượt 366 ngày, granularity làm vượt 800 bucket) → `422`.

| Preset | Khoảng (giờ VN) |
|---|---|
| `today` / `yesterday` | Hôm nay / hôm qua |
| `last_24h` | 24 giờ tròn kết thúc ở giờ hiện tại |
| `last_7d` / `last_30d` / `last_90d` | 7 / 30 / 90 ngày gồm hôm nay |
| `this_month` / `last_month` | Tháng này / tháng trước |
| `this_year` | Năm nay |
| `custom` | `from` đến hết ngày `to` |

```bash
curl -s "http://localhost:3000/api/v1/admin/query-stats/overview?preset=custom&from=2026-11-01&to=2026-11-10" \
  -H "Authorization: Bearer $TOKEN"
```

### Response (rút gọn)

```json
{
  "range": { "preset": "last_7d", "from": "...Z", "to": "...Z", "granularity": "day", "timeZone": "Asia/Ho_Chi_Minh" },
  "totals": { "requests": 0, "answered": 0, "gap": 0, "success": 0, "empty": 0, "failed": 0, "denied": 0, "errors": 0, "records": 0, "avgDurationMs": null },
  "previous": { "from": "...Z", "to": "...Z", "totals": { "requests": 0 } },
  "byDatasource": [{ "datasourceCode": "PASSPORT_INFO", "name": "...", "requests": 0 }],
  "timeseries": [{ "bucket": "2026-11-10", "requests": 0 }],
  "topErrors": [{ "errorCode": "UPSTREAM_TIMEOUT", "statusCode": 504, "count": 0 }]
}
```

- Mỗi counter (`requests`, `answered`, `gap`, `success`, `empty`, `failed`, `denied`, `errors`, `records`, `avgDurationMs`) có đủ trong `totals`, từng dòng `byDatasource`, từng `timeseries` bucket và trong `previous.totals`.
- Detail endpoint thay `byDatasource` bằng `datasource: { code, name }` (`name` = `null` nếu đã xoá khỏi config).
- `range.from`/`range.to` là ISO UTC, nửa mở `[from, to)`.
- `byDatasource` gồm cả datasource đang cấu hình có 0 lượt; sắp xếp `requests` giảm dần.

## Granularity và bucket

Granularity tự động theo độ dài khoảng: **≤ 2 ngày → `hour`; ≤ 90 ngày → `day`; > 90 ngày → `month`.**
Có thể ghi đè bằng `granularity`. Số bucket tối đa 800: `hour` cho 90 ngày (2.160 bucket) → `422`.

| Bucket key | Dạng | Ví dụ |
|---|---|---|
| `hour` | `YYYY-MM-DDTHH` (giờ VN) | `2026-11-10T09` |
| `day` | `YYYY-MM-DD` (ngày VN) | `2026-11-10` |
| `month` | `YYYY-MM` | `2026-11` |

Bucket không có lượt nào vẫn được trả về với số 0 để biểu đồ liền mạch. Múi giờ cố định UTC+7
(Việt Nam không có DST), tính ở backend và ở FE. Bucket biên được cắt theo khoảng của Thống kê.

## Kỳ so sánh (previous)

`previous` là kỳ so sánh, nửa mở ISO UTC `[from, to)`. FE hiển thị chênh lệch ±% =
`(current − previous) / previous`, làm tròn 1 chữ số; `null` khi `previous = 0`.

| Preset | Kỳ so sánh |
|---|---|
| `today`, `this_month`, `this_year` (đang chạy) | Cùng số giờ đã trôi qua, bắt đầu từ đầu ngày/tháng/năm trước; không vượt điểm bắt đầu kỳ hiện tại (không tạo ra mức "giảm" giả) |
| `yesterday` | Ngày trước đó |
| `last_month` | Tháng trước đó |
| `last_24h`, `last_7d`, `last_30d`, `last_90d`, `custom` | Cùng độ dài, liền trước `from` |

## Công thức chỉ số

Đây là **nguồn duy nhất** định nghĩa chỉ số. Các tài liệu khác chỉ link về đây.

| Chỉ số | Công thức (trên `app.query_logs`, khoảng thời gian VN) |
|---|---|
| `requests` (lượt vào) | `COUNT(*)` |
| `answered` (có kết quả trả ra) | `COUNT(*) FILTER (WHERE status='success' AND record_count > 0)` |
| `gap` (chênh lệch vào-ra) | `requests - answered` (= failed + denied + success rỗng) |
| `success` | `status = 'success'` |
| `empty` | `success - answered` (success nhưng `record_count` = 0 hoặc null) |
| `failed` / `denied` | `status = 'failed'` / `status = 'denied'` |
| `errors` | `failed + denied` |
| `records` | `COALESCE(SUM(record_count), 0)`, chỉ hiển thị phụ, **không** dùng tính `gap` |
| `avgDurationMs` | `ROUND(AVG(duration_ms))`, `null` nếu không có lượt |
| `topErrors` | Top 10 nhóm `(error_code, status_code)` với `status <> 'success'`, sắp theo `count` giảm dần |

Định nghĩa `answered`, `empty`, `gap` giống hệt bộ lọc `outcome` của Lịch sử (xem
[mục 3 của tài liệu drill-down](./query-log-drilldown-and-insights.md#3-outcome-answered--empty--gap)).

## Màn hình và drill-down

| Route (web) | Màn hình |
|---|---|
| `/quan-tri/thong-ke` | Tổng hợp: chọn preset/khoảng ngày, chọn granularity, thẻ chỉ số có ±% so với kỳ trước, biểu đồ cột theo thời gian (không lỗi / lỗi), bảng theo luồng, bảng mã lỗi phổ biến |
| `/quan-tri/thong-ke/:code` | Chi tiết 1 luồng, cùng bộ thẻ/biểu đồ/mã lỗi, có nút "Quay lại tổng hợp" |

Menu: **Quản trị → Thống kê tra cứu** (chỉ hiện khi có `admin:query_stats`). Biểu đồ là bar chart
viết bằng div + Tailwind, không dùng thư viện chart.

Drill-down (chỉ với `history:view_all`):

| Bấm vào | Mở Lịch sử với |
|---|---|
| Thẻ chỉ số (requests, answered, gap, empty, success, failed, denied, errors) | Bộ lọc tương ứng + khoảng của Thống kê |
| Cột biểu đồ | Khoảng của bucket (cắt theo khoảng Thống kê) + bộ lọc của counter |
| Dòng datasource | Thêm `datasourceCode` |
| Dòng mã lỗi | `status=failed,denied`, `errorCode`, `statusCode` (`__null__` nếu rỗng) |

Bảng ánh xạ đầy đủ: `STATS_COUNTER_HISTORY_FILTER` trong `packages/shared/src/query-log-filter-types.ts`.

## Giới hạn đã biết

- **`records` không phải tổng bản ghi upstream.** `record_count` lưu số bản ghi trong trang trả về
  (giới hạn theo pageSize). Chỉ số này để tham khảo, không cộng/so sánh với `answered`.
- **Log cũ không có `statusCode`.** Các dòng ghi trước khi có cột `status_code` có `statusCode = null`;
  giao diện hiển thị "—".
- **Không cache, không bảng tổng hợp.** Mỗi lần gọi là một aggregate trên `query_logs`. Đo 2 triệu dòng:
  gom 90–366 ngày khoảng 1–4 s (xem mục 11 của tài liệu drill-down). Nếu log phình to, cần cân nhắc bảng tổng hợp
  hoặc retention (chưa quyết, hỏi leader).
- **Chưa kiểm trên trình duyệt thật.** Đã kiểm bằng unit/e2e và typecheck; chưa thao tác UI thật.

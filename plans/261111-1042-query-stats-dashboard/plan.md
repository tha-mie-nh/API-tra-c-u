---
title: "Dashboard thống kê luồng tra cứu"
description: "Admin xem thống kê QueryLog (lượt vào, kết quả ra, chênh lệch, lỗi, mã lỗi) tổng hợp + theo từng datasource, theo hôm nay/hôm qua/tháng/năm/tuỳ chọn."
status: completed
priority: P2
effort: 11h
branch: main
tags: [admin, stats, query-log, dashboard, nestjs, react]
created: 2026-11-11
---

# Dashboard thống kê luồng tra cứu

Nguồn dữ liệu: bảng `app.query_logs` có sẵn (KHÔNG migration, KHÔNG cột mới). Ghi log duy nhất ở
`apps/api/src/history/query-log.service.ts` (success/failed từ `QueryService`, denied từ guard).

## Định nghĩa chỉ số (chốt, dùng thống nhất BE+FE)

| Chỉ số | Công thức SQL (trên khoảng thời gian, VN time) |
|---|---|
| `requests` (lượt vào) | `COUNT(*)` |
| `answered` (lượt có kết quả trả ra) | `COUNT(*) FILTER (WHERE status='success' AND record_count > 0)` |
| `gap` (chênh lệch vào-ra) | `requests - answered` (= failed + denied + success rỗng) |
| `success` / `empty` / `failed` / `denied` | FILTER theo `status` (`empty` = success AND COALESCE(record_count,0)=0) |
| `records` (tổng bản ghi trả ra) | `COALESCE(SUM(record_count),0)` — chỉ hiển thị phụ, KHÔNG dùng tính gap (khác đơn vị) |
| `errors` | `failed + denied` |
| `avgDurationMs` | `AVG(duration_ms)` làm tròn |
| Mã lỗi | top 10 `(error_code, status_code)` WHERE status<>'success' |

Lưu ý: `record_count` = `envelope.page.returned` (giới hạn theo pageSize), nên `records` là "số bản ghi đã trả", không phải tổng upstream.

## Phases

| # | Phase | Effort | Phụ thuộc | Status |
|---|---|---|---|---|
| 01 | [Shared contracts + permission](phase-01-shared-contracts-and-permission.md) | 1h | — | completed |
| 02 | [API thống kê (range util, SQL, service, controller)](phase-02-api-query-stats-endpoints.md) | 3h | 01 | completed |
| 03 | [Test API (unit + e2e DB thật)](phase-03-api-tests-unit-and-e2e.md) | 2h | 02 | completed |
| 04 | [FE trang tổng hợp](phase-04-web-overview-dashboard-page.md) | 2.5h | 01 (chạy thật cần 02) | completed |
| 05 | [FE trang chi tiết từng luồng + test FE](phase-05-web-datasource-detail-page-and-tests.md) | 2h | 04 | completed |
| 06 | [Cập nhật docs](phase-06-docs-update.md) | 0.5h | 03, 05 | completed |

Phase 03 và 04 có thể chạy song song sau 02 (không đụng chung file).

## Quyết định kiến trúc chính
- Permission mới `admin:query_stats` (feature, seed upsert → ADMIN tự có; không migration vì permission là row).
- 2 endpoint dưới `/api/v1/admin/query-stats` dùng chung 1 service, `$queryRaw` + `Prisma.sql` (tham số hoá) để dùng `FILTER`, `date_trunc(... AT TIME ZONE 'Asia/Ho_Chi_Minh')`.
- Mốc thời gian tính ở BE (util thuần, inject `now`), UTC+7 cố định (VN không DST); FE chỉ gửi `preset` hoặc `from/to` (YYYY-MM-DD).
- Chart: bar chart bằng div + Tailwind, KHÔNG thêm thư viện chart.

## Rủi ro chính
- Raw SQL sai tên enum/schema (`app.query_logs`, giá trị enum lowercase `success|failed|denied`) → e2e bắt.
- `COUNT` trả `bigint` → phải `Number()` trước khi serialize.
- Dải tuỳ chọn quá lớn → giới hạn 366 ngày.

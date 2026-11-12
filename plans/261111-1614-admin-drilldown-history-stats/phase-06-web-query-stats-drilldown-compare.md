# Phase 06 — Web Thống kê: drill-down, preset mới, granularity, so sánh kỳ trước

## Context Links
- `apps/web/src/features/admin/query-stats/**`
- phase-01 (`STATS_COUNTER_HISTORY_FILTER`, `vnBucketRange`, `buildHistorySearchParams`), phase-04 (API)

## Overview
P1. Status: done (chưa kiểm tra trình duyệt thật). FE agent E. 4h. Ownership: `apps/web/src/features/admin/query-stats/**`, `apps/web/src/i18n/vi-admin-query-stats.ts`.

## Requirements
- **Drill-down** (chỉ khi user có `history:view_all`; không có → hiện số thường, tooltip "cần quyền xem lịch sử toàn bộ" — vì scope view_own làm số không khớp):
  - Thẻ tổng: requests, answered, gap, empty (thêm thẻ/hint), success, failed, denied, errors → `/lich-su?from=range.from&to=range.to[&datasourceCode]&<STATS_COUNTER_HISTORY_FILTER[k]>`.
  - Cột biểu đồ: click = `requests` của bucket (`vnBucketRange(bucket, granularity)`); click đoạn đỏ = `errors` của bucket. Tooltip liệt kê đủ counter. Bucket đầu/cuối cắt theo range (`max(from)`/`min(to)`) — bucket luôn nằm trọn trong range với preset hiện có, nhưng `last_24h` + granularity thủ công `day` có thể lệch → cắt bằng `[max(bucket.from, range.from), min(bucket.to, range.to))` để khớp số.
  - Bảng theo luồng: mỗi ô số là link (stopPropagation, row click vẫn mở trang chi tiết).
  - Top lỗi: dòng → `status=failed,denied&errorCode=<code|__null__>&statusCode=<n|__null__>`.
  - Một hàm duy nhất `buildStatsDrilldownHref({range, bucket?, datasourceCode?, counter | errorItem})` (+test) — dùng chung cho mọi điểm bấm.
- Range picker: preset mới (24 giờ, 7 ngày, 30 ngày, 90 ngày, tháng trước) + giữ hôm nay/hôm qua/tháng này/năm nay/tuỳ chọn; mặc định 7 ngày; select granularity (Tự động/Giờ/Ngày/Tháng) lưu URL `granularity=`; lỗi 422 trần bucket → thông báo.
- So sánh kỳ trước: mỗi thẻ hiện `±x%` (prev=0 → "—"; màu: tăng lỗi = đỏ), tooltip khoảng kỳ trước (giờ VN).
- Múi giờ: label bucket chỉ cắt chuỗi khóa (đã đúng, không `new Date`); thêm test label cho `T00`/`T23` và range hiển thị `to − 1ms` theo VN.

## Architecture
- `build-stats-drilldown-href.ts` (+test), `query-stats-summary-cards.tsx` (sửa, link + delta), `query-stats-delta-badge.tsx`, `query-stats-bar-chart.tsx` (sửa, click), `query-stats-datasource-table.tsx` (sửa), `query-stats-top-errors-table.tsx` (sửa), `query-stats-range-picker.tsx` (+ `query-stats-granularity-select.tsx`), `use-query-stats-range-search-params.ts` (preset list từ shared, default last_7d, granularity).

## Implementation Steps
1. Hàm href + test (mọi counter, bucket hour/day/month, null errorCode).
2. Gắn link vào thẻ/biểu đồ/bảng/top lỗi.
3. Preset/granularity/delta.
4. Vitest cập nhật (range picker, URL hook default, bar click điều hướng).

## Todo List
- [x] build-stats-drilldown-href (+test)
- [x] link ở cards/chart/table/top errors (ẩn khi thiếu view_all)
- [x] preset mới + default + granularity select
- [x] delta ±%
- [x] vitest

## Success Criteria
Bấm bất kỳ số nào → Lịch sử `total` bằng đúng số đó (kiểm thủ công ở phase 09 + e2e BE dùng cùng bảng ánh xạ).

## Risk Assessment
Row click + cell link lồng nhau → dùng `<Link>` + `e.stopPropagation()`; test bàn phím.

## Security Considerations
Không thêm quyền; link chỉ là UI.

## Next Steps
Phase 09 kiểm thủ công.

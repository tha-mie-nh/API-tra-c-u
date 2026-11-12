# Phase 05 — Web Lịch sử: bộ lọc trong URL, lọc mới, sort, summary, chi tiết, CSV

## Context Links
- `apps/web/src/features/history/**`, `use-query-stats-range-search-params.ts` (mẫu URL state)
- `apps/web/src/lib/api-client.ts` (`requestBlob` chỉ cho ảnh)
- phase-01 (`QUERY_LOG_FILTER_KEYS`, `buildHistorySearchParams`, `vnDateStartIso`), phase-02 (API)

## Overview
P1. Status: DONE (code+vitest; chưa kiểm tra trên trình duyệt; link user-insights chờ phase 07). FE agent D. 6h. Bắt đầu ngay sau 01 (contract cố định), tích hợp thật sau 02. Ownership: `apps/web/src/features/history/**`, `apps/web/src/i18n/vi-history.ts`.

## Requirements
- **URL là nguồn sự thật**: `/lich-su?from&to&status&datasourceCode&username&userId&statusCode&errorCode&ip&durationMinMs&durationMaxMs&hasRecords&upstreamRequestId&offHours&outcome&sort&order&page&pageSize&detail=<id>`. Tên khóa = tên API (không lớp ánh xạ; lệch nhẹ so với ví dụ `datasource` trong requirements — chủ ý DRY). Reload/Back/share giữ nguyên; `replace` khi đổi trang, `push` khi Apply.
- `from/to`: input ngày + giờ (HH:mm, giờ VN) — date-only → `vnDateStartIso` / `vnNextDateStartIso`; drill-down mang ISO đầy đủ, UI hiển thị lại theo giờ VN. Hiện chip "Đang lọc theo: …" cho các tham số không có control (outcome, userId, offHours) + nút bỏ từng chip.
- Control mới (chỉ hiện với `history:view_all`, trừ status/datasource/thời gian): statusCode, errorCode (ô text + lựa chọn "không có mã"), IP, duration min/max, có/không kết quả, upstreamRequestId; status chọn nhiều.
- Sort: header bảng bấm được cho Thời gian / Thời gian xử lý / Số bản ghi.
- Summary (view_all): thẻ tổng số, tỉ lệ thành công, TB / p95 thời gian xử lý, gap/empty — gọi `/history/summary` cùng filter.
- Chi tiết: giữ dialog, mở bằng `?detail=<id>` (link chia sẻ được, không cần route mới → không đụng app-routes). Bổ sung phần thiếu so với `history-detail-dialog.tsx` hiện có: **id**, **querySummary**, **statusCode cạnh status**, **errorCode** (đang chỉ có errorMessage), **IP**, **userAgent** + parse trình duyệt/OS (regex nhỏ, không thêm lib), **nút copy** upstreamRequestId (và id), **user → link** `/quan-tri/phan-tich-tra-cuu/nguoi-dung/:userId` (view_all), link "Query tương tự": cùng user+datasource (`?userId&datasourceCode`), cùng IP (`?ip`), cùng errorCode (`?errorCode&status=failed,denied`).
- Nút "Xuất CSV" (chỉ khi có `history:export`): tải blob bằng `apiFetchBlob('/history/export.csv?<filter>')`, đọc header truncated → toast "Đã cắt ở 50.000 dòng".
- Trần offset từ API (422) → hiện thông báo thu hẹp bộ lọc.

## Architecture (file < 200 dòng)
- `use-history-search-params.ts` (+test): parse/serialize bằng `QUERY_LOG_FILTER_KEYS`, chuẩn hoá.
- `history-filters.tsx` tách: `history-filters-basic-fields.tsx`, `history-filters-advanced-fields.tsx`, `history-active-filter-chips.tsx`, `history-datetime-input.tsx`.
- `history-summary-cards.tsx`, `history-export-csv-button.tsx`, `history-detail-dialog.tsx` (sửa) + `history-detail-related-links.tsx`, `parse-user-agent.ts` (+test), `copy-to-clipboard-button.tsx` (trong feature; nếu đã có component chung thì dùng lại).
- `history-api.ts`: `HistoryListParams` = `QueryLogFilterParams & {sort, order, page, pageSize}`; thêm `fetchHistorySummary`, `downloadHistoryCsv`.
- Dùng `apiFetchBlob` (đã thêm ở phase 01).
- `vi-history.ts`: chuỗi mới (nếu >200 dòng tách `vi-history-filters.ts`).

## Implementation Steps
1. Hook URL + test round-trip (gồm ký tự đặc biệt, `__null__`, status nhiều giá trị, giá trị rác bị bỏ).
2. Thay `useState` trong `history-page.tsx` bằng hook; filters đọc/ghi URL.
3. Control mới + chips + datetime.
4. Sort header, summary, CSV, detail dialog bổ sung.
5. Vitest: hook URL, chips, parse UA, detail render đủ trường + link tương tự, nút CSV ẩn khi thiếu quyền, view_own không thấy control admin.

## Todo List
- [x] use-history-search-params (+test)
- [x] filters tách file + control mới + chips + datetime
- [x] sort, summary, CSV
- [x] detail bổ sung + `?detail=`
- [x] vitest + typecheck/lint

## Success Criteria
Mở link drill-down từ Thống kê → bảng hiện đúng filter, `total` = số trên Thống kê; reload/Back giữ nguyên.

## Risk Assessment
DateTextInput hiện chỉ có ngày → component datetime mới; tránh `new Date('YYYY-MM-DD')` (UTC) — chỉ dùng hàm shared.

## Security Considerations
Ẩn control chỉ là UX; scope ép ở BE. Hiển thị text thuần (không HTML) cho params/userAgent/errorMessage.

## Next Steps
Phase 06/07 link tới đây bằng `buildHistorySearchParams`.

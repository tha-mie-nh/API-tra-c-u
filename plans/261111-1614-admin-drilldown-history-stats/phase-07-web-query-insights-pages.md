# Phase 07 — Web Phân tích tra cứu: top, độ trễ, user, IP, bất thường

## Context Links
- phase-03 (API + types `query-insights-types.ts`), phase-05 (link Lịch sử), `apps/web/src/routes/app-routes.tsx`, `components/layout/sidebar-nav.tsx`

## Overview
Trạng thái: code xong, chưa kiểm trình duyệt.

P2. FE agent F. 7h. Ownership: `apps/web/src/features/admin/query-insights/**`, `apps/web/src/i18n/vi-admin-query-insights.ts`, `apps/web/src/i18n/vi.ts`, `apps/web/src/routes/app-routes.tsx`, `apps/web/src/components/layout/sidebar-nav.tsx(+test)`.

## Requirements
- Route (guard `RequirePermission anyOf=[history:view_all]`), menu "Quản trị → Phân tích tra cứu":
  - `/quan-tri/phan-tich-tra-cuu` — tabs (URL `?tab=top|anomalies`): **Top** (top user theo metric chọn được requests/failed/denied/gap; top errorCode/statusCode; datasource chậm nhất avg/p95/max) và **Bất thường** (4 bảng: tăng đột biến, ngoài giờ, CCCD/tham số nhiều user tra, IP nhiều tài khoản; hiện ngưỡng từ `rules`).
  - `/quan-tri/phan-tich-tra-cuu/nguoi-dung/:userId` — thông tin user, lần đầu/gần nhất, tổng theo datasource, IP/thiết bị (UA parse dùng lại `parse-user-agent.ts` của phase 05 — import từ features/history), dòng thời gian = bảng `HistoryTable` + phân trang với filter `userId` (tái dùng component, không viết lại).
  - `/quan-tri/phan-tich-tra-cuu/ip/:ip` — tương tự; nổi bật cờ "nhiều tài khoản"; danh sách user → link trang user.
- Bộ lọc thời gian + datasource ở đầu trang: tái dùng range state dạng `from/to` ISO (dùng hook URL của phase 05 cho các khóa filter chung; mặc định 7 ngày VN qua `vnDateStartIso`).
- Mọi số trong bảng top/activity = link `/lich-su?<cùng filter>&userId|ip|errorCode…` (exact). Bảng CCCD dùng chung: link theo user ghi chú "xấp xỉ".
- Nút "Xuất CSV" từng bảng (chỉ với `history:export`) → `/admin/query-insights/export.csv?table=..&<filter>`.
- Giá trị CCCD hiển thị như API trả (đã che nếu thiếu `view_sensitive`); không đưa vào URL.

## Architecture (mỗi file < 200 dòng)
- `query-insights-api.ts`, `query-insights-page.tsx` (tabs), `query-insights-top-users-table.tsx`, `query-insights-top-errors-table.tsx`, `query-insights-latency-table.tsx`, `query-insights-anomalies-panel.tsx` (+ 1 file/bảng nếu dài), `query-insights-user-activity-page.tsx`, `query-insights-ip-activity-page.tsx`, `query-insights-activity-breakdown.tsx` (byDatasource/ips/UA dùng chung user & IP), `query-insights-export-csv-button.tsx` (dùng `apiFetchBlob`; nếu giống nút ở phase 05 → chuyển nút đó thành component chung ở `components/common/` trong phase 10 refactor nhỏ).

## Implementation Steps
1. API client + route + menu + i18n.
2. Tab Top.
3. Trang user + IP.
4. Tab Bất thường.
5. Vitest: route guard, menu hiện theo quyền, link drill-down đúng query string, nút CSV ẩn khi thiếu quyền.

## Todo List
- [x] route/menu/i18n
- [x] tab Top
- [x] user activity
- [x] IP activity
- [x] anomalies
- [x] vitest + typecheck/lint

## Success Criteria
Từ top user → trang user → bấm 1 query → dialog chi tiết; mọi số khớp Lịch sử.

## Risk Assessment
IPv6 trong path: `encodeURIComponent`. IP proxy (nếu `TRUST_PROXY` chưa bật) làm trang IP gộp mọi user → hiện cảnh báo khi 1 IP chiếm >90% lượt? (YAGNI — chỉ ghi docs).

## Security Considerations
Guard UI theo view_all; BE ép thật. Mỗi lần mở trang user/IP/bất thường sinh audit (BE).

## Next Steps
Phase 09 kiểm thủ công.

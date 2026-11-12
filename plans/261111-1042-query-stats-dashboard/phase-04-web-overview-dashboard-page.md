# Phase 04 — FE trang tổng hợp

## Context Links
- Routes: `apps/web/src/routes/app-routes.tsx` (lazy + `RequirePermission anyOf`)
- Menu "Quản trị": `apps/web/src/components/layout/sidebar-nav.tsx` (+ `sidebar-nav.test.tsx`)
- Pattern feature admin: `apps/web/src/features/admin/audit/*` (`*-api.ts` dùng `apiFetch`, page + table)
- i18n: `apps/web/src/i18n/vi.ts` + `vi-admin-*.ts`; format giờ VN: `apps/web/src/lib/format.ts`
- UI có sẵn: `components/ui/card|table|select|button|input|badge|skeleton`; TanStack Query; lucide-react

## Overview
Priority P2 · Status pending · Trang `/quan-tri/thong-ke`. Phụ thuộc 01 (types); chạy thật cần 02.

## Key Insights
- Chưa có lib chart → bar chart bằng div + Tailwind (height % theo max) — đủ cho ≤31 bucket ngày / 24 giờ / 12 tháng. Không thêm recharts (YAGNI, bundle).
- State khoảng thời gian để trong URL search params (`?preset=this_month` / `?preset=custom&from=..&to=..`) → F5/back/chia sẻ link giữ nguyên, và trang chi tiết dùng lại cùng hook.
- FE KHÔNG tự tính mốc ngày; BE trả `range` → FE chỉ hiển thị `range.from/to` bằng `format.ts`.

## Requirements
- Range picker: 4 nút preset (Hôm nay / Hôm qua / Tháng này / Năm nay) + "Tuỳ chọn" (2 `<input type="date">`, validate from≤to, ≤366 ngày trước khi gọi API).
- Thẻ tổng: Lượt truy vấn, Có kết quả trả ra, Chênh lệch vào-ra (tooltip công thức), Lỗi (failed+denied), Tổng bản ghi, TB thời gian.
- Bar chart theo bucket (requests, phần lỗi tô màu khác).
- Bảng theo luồng: tên/code, requests, answered, gap, failed, denied, records, avg ms; click dòng → `/quan-tri/thong-ke/:code` (giữ search params).
- Bảng top mã lỗi: errorCode (null → "—"), statusCode, số lượt, % trên tổng lỗi; nhãn tiếng Việt cho mã phổ biến (403 denied = "Bị từ chối quyền").
- Loading skeleton, empty state, error state.

## Architecture (`apps/web/src/features/admin/query-stats/`)
- `query-stats-api.ts` — `fetchQueryStatsOverview(params)`, `fetchQueryStatsDatasourceDetail(code, params)` (DRY buildQueryString như audit-api)
- `use-query-stats-range-search-params.ts` — đọc/ghi preset/from/to từ URL
- `query-stats-range-picker.tsx`
- `query-stats-summary-cards.tsx`
- `query-stats-bar-chart.tsx` — nhận `QueryStatsBucket[]` + granularity → nhãn trục (HH, dd, MM)
- `query-stats-top-errors-table.tsx`
- `query-stats-datasource-table.tsx`
- `query-stats-overview-page.tsx`
- `apps/web/src/i18n/vi-admin-query-stats.ts`
Thẻ/chart/top-errors là component dùng chung với trang chi tiết (phase 05).

## Related Code Files
- Create: các file trên
- Modify: `app-routes.tsx` (route `quan-tri/thong-ke`, permission `ADMIN_QUERY_STATS`), `sidebar-nav.tsx` (link + `canViewQueryStats` vào `showAdminSection`, icon `BarChart3`), `sidebar-nav.test.tsx`, `vi.ts` (`nav.adminQueryStats: 'Thống kê tra cứu'`, import vi-admin-query-stats)

## Implementation Steps
1. i18n + api client + hook search params.
2. Components cards/chart/top-errors/datasource-table.
3. Page ghép, `useQuery(['query-stats','overview',params])`.
4. Route + sidebar + cập nhật test sidebar.
5. `pnpm --filter web build` + lint.

## Todo List
- [ ] i18n
- [ ] api + hook
- [ ] 4 component hiển thị
- [ ] overview page
- [ ] route + sidebar (+test)
- [ ] build pass

## Success Criteria
- Admin vào menu "Quản trị → Thống kê tra cứu", đổi preset thấy số liệu đổi; non-admin không thấy menu, vào URL trực tiếp → 403 page.

## Risk Assessment
- Nhiều bucket (custom dài, granularity day 92) → chart chật; mitigation: overflow-x scroll, nhãn thưa.

## Security Considerations
- Guard FE chỉ là UX; BE là nguồn chặn thật.

## Next Steps
- Phase 05.

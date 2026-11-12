# Phase 05 — FE trang chi tiết từng luồng + test FE

## Context Links
- Phase 04 components (`apps/web/src/features/admin/query-stats/*`)
- Test FE pattern: vitest + Testing Library (`history-filters.test.tsx`, `sidebar-nav.test.tsx`)

## Overview
Priority P2 · Status pending · Trang `/quan-tri/thong-ke/:code`, tái dùng component phase 04.

## Key Insights
- Chỉ khác overview: không có bảng theo luồng; có header tên luồng + nút "Quay lại tổng hợp". Không làm dropdown chuyển luồng (cần thêm API/quyền `history:view_all` — YAGNI).
- Link sang lịch sử đã lọc (`/lich-su?datasourceCode=..`) nếu history page hỗ trợ query param — kiểm khi làm, nếu không thì bỏ (YAGNI).

## Requirements
- Header: tên (hoặc code nếu `name=null`, badge "đã xoá khỏi cấu hình").
- Range picker (cùng hook URL), cards, bar chart, top errors (đủ bảng phân bổ statusCode).
- Code không có dữ liệu → empty state, không lỗi.

## Architecture
- `query-stats-datasource-detail-page.tsx` (page)
- Route `quan-tri/thong-ke/:code` trong `app-routes.tsx` cùng permission.

## Related Code Files
- Create: `query-stats-datasource-detail-page.tsx`, tests: `use-query-stats-range-search-params.test.ts`, `query-stats-bar-chart.test.tsx`, `query-stats-range-picker.test.tsx`
- Modify: `app-routes.tsx`

## Implementation Steps
1. Page chi tiết + route.
2. Test FE (logic thuần/hiển thị, không mock API network bằng dữ liệu giả lập backend — chỉ test component nhận props):
   - hook: đọc/ghi URL, preset mặc định `today`, custom thiếu ngày → không gọi.
   - range picker: chọn custom from>to hiện lỗi, không submit.
   - bar chart: số cột = số bucket, nhãn đúng granularity, max=0 không chia 0.
   - sidebar: admin có `admin:query_stats` thấy link; không có thì không.
3. `pnpm --filter web test` + build.
4. Smoke thủ công với API thật (docker compose dev): tạo vài lượt tra cứu thành công/lỗi rồi xem dashboard hôm nay.

## Todo List
- [ ] detail page + route
- [ ] FE tests
- [ ] smoke thủ công end-to-end

## Success Criteria
- Click dòng ở overview → detail giữ nguyên khoảng thời gian; số trên detail khớp dòng tương ứng ở overview.
- `pnpm --filter web test` pass.

## Risk Assessment
- Lệch số overview vs detail → cùng 1 SQL fragment ở BE nên không thể lệch; nếu lệch là bug BE.

## Security Considerations
- `:code` encode khi build URL (`encodeURIComponent`).

## Next Steps
- Phase 06.

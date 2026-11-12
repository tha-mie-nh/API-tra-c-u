# Phase 04 — Stats: preset mới, granularity tự/thủ công, so sánh kỳ trước

## Context Links
- `apps/api/src/query-stats/{query-stats-date-range.util.ts(+spec), dto/query-stats-query.dto.ts, query-stats.service.ts}`
- phase-01 (types preset/`previous` đã có trong shared)

## Overview
P2. BE agent C. **Status: DONE (2026-11-11)**. 3h. Ownership: `apps/api/src/query-stats/**`, `apps/api/test/query-stats.e2e-spec.ts`.

## Requirements
- Preset: giữ `today, yesterday, this_month, this_year, custom`; thêm `last_24h, last_7d, last_30d, last_90d, last_month`. Default **`last_7d`** (zod default + FE).
- Định nghĩa (giờ VN, nửa mở):
  - `last_24h` = `[floorHour(now)−23h, floorHour(now)+1h)` → đúng 24 bucket giờ, gồm giờ hiện tại.
  - `last_Nd` = `[00:00 VN (hôm nay − (N−1)), 00:00 VN ngày mai)` → N ngày lịch gồm hôm nay.
  - `last_month` = tháng lịch trước.
- Granularity tự động theo độ dài: ≤ 2 ngày `hour`, ≤ **90** ngày `day` (đổi từ 92 → sửa spec), dài hơn `month`. Tham số `granularity` tuỳ chọn (`hour|day|month`) ghi đè; số bucket > 800 → 422 (vd hour cho 90 ngày = 2160).
- So sánh kỳ trước: response `previous: {from, to, totals}` luôn trả (thêm 1 aggregate):
  - Preset "đến hiện tại" (`today, this_month, this_year`): kỳ trước cùng độ dài đã trôi: `[prevStart, prevStart + (now − from))` với prevStart = đầu ngày/tháng/năm trước (so sánh cùng kỳ, tránh -50% giả do kỳ hiện tại chưa hết).
  - `yesterday, last_month`: đơn vị lịch liền trước.
  - Rolling & `custom`: cửa sổ cùng độ dài liền trước `[from − len, from)`.
  - Detail endpoint áp cùng `datasourceCode`.
- Xác nhận múi giờ: SQL đã `date_trunc(... AT TIME ZONE 'Asia/Ho_Chi_Minh')`; thêm test e2e row tại `16:59:59.999Z` vào bucket `…T23`/ngày D và `17:00:00.000Z` vào `T00`/ngày D+1, cả month (31/12 → 01/01).

## Architecture
- `query-stats-date-range.util.ts` có thể vượt 200 dòng → tách `query-stats-preset-range.util.ts` (resolve presets) và `query-stats-previous-range.util.ts`; `listBucketKeys` giữ chỗ cũ.
- Zod: `preset` enum mới, `granularity` optional; refine số bucket.
- Service: `previous` qua `repo.aggregateByDatasource(prevRange, code)` + `sumRaw`.

## Implementation Steps
1. Preset + granularity + spec (gồm `now` ở 23:59 / 00:00 VN, 1/1, tháng 2 nhuận).
2. Previous range + spec.
3. Service/response; e2e cập nhật (preset default đổi → test `defaults preset to today` sửa thành `last_7d`).

## Todo List
- [x] presets mới + default last_7d
- [x] granularity auto(≤90) + override + trần 800 bucket
- [x] previous period
- [x] spec + e2e ranh giới nửa đêm/tháng/năm

## Success Criteria
Unit + e2e xanh; overview trả `previous`.

## Risk Assessment
Đổi ngưỡng 92→90 là thay đổi hành vi nhỏ (91–92 ngày từ day → month) — ghi changelog.

## Security Considerations
Không đổi quyền (`admin:query_stats`).

## Next Steps
Phase 06 FE.

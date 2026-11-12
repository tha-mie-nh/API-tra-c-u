# Phase 10 — Chạy toàn bộ test, review, cập nhật docs

## Overview
P1. 2.5h. Lead điều phối; docs-manager sở hữu `docs/**`.

**Status:** docs xong (docs-manager). Chạy toàn bộ test/e2e và code-review sửa lỗi: chưa làm trong đợt docs này.

## Test plan tổng (đã viết trong từng phase — ở đây chạy lại toàn bộ)
| Nhóm | File | Phase |
|---|---|---|
| Đối chiếu Thống kê = Lịch sử: 8 counter (requests/answered/gap/success/empty/failed/denied/errors) × hour/day/month × mọi bucket; summary = totals; top lỗi (gồm NULL) | `history-drilldown-reconciliation.e2e-spec.ts` | 02 |
| Top users/latency = Lịch sử cùng filter | `query-insights.e2e-spec.ts` | 03 |
| Scope view_own vs view_all (list, detail 404, summary/export/insights 403, filter userId/username/ip bị bỏ qua) | `history-filters-and-scope.e2e-spec.ts`, `query-insights.e2e-spec.ts` | 02, 03 |
| Múi giờ 23:59:59.999 / 00:00 VN, cuối tháng/năm (SQL bucket + `vnBucketRange` + preset) | reconciliation e2e, `query-log-time-range.spec.ts`, date-range spec, `query-stats.e2e-spec.ts` | 01, 02, 04 |
| CSV injection + che sensitive + quyền export | `csv-safe-cell.util.spec.ts`, `history-export-csv.e2e-spec.ts` | 01, 02 |
| Audit được ghi + không chứa response | export/detail/insights e2e, interceptor spec | 01–03 |
| Bất thường (ranh giới giờ, ngưỡng) | `query-insights-anomalies.e2e-spec.ts` | 03 |
| FE URL round-trip, drill-down href, quyền UI | vitest | 05–07 |

Lệnh: `pnpm typecheck && pnpm lint && pnpm test` + từng e2e trên 55434 (lệnh ở plan.md). Không bỏ qua test fail.

## Review
- `code-reviewer` agent: trọng tâm SQL tham số hoá, scope, che sensitive ở CSV/anomaly, audit payload, file < 200 dòng.

## Docs cập nhật
- `docs/query-stats-dashboard.md`: preset mới/default, granularity override, `previous`, drill-down mapping (bảng `STATS_COUNTER_HISTORY_FILTER`), ngưỡng 90 ngày.
- `docs/query-log-drilldown-and-insights.md` (mới): API history mở rộng + insights, filter list, `__null__`, offset vs cursor, p95 (`percentile_cont` nội suy), quy tắc bất thường + giới hạn (ngày lễ, CCCD chỉ field sensitive, row cũ che), quyền `history:export`, audit actions.
- `docs/codebase-summary.md`: module `query-insights`, `history/query-log-filter/`.
- `docs/deployment-guide.md`: chạy lại seed (quyền `history:export`), `TRUST_PROXY`, migration index (nếu có).
- `docs/demo-guide.md`: kịch bản demo drill-down + script dữ liệu demo.
- `docs/project-changelog.md`: thay đổi + breaking nhỏ (`to` nửa mở, default preset, ngưỡng 92→90).
- `docs/system-architecture.md`: **chưa tồn tại** — tạo mới ngắn (luồng query_logs → where-builder → stats/history/insights/CSV/audit) theo yêu cầu requirements.
- Ghi "Retention query_logs: chưa quyết, hỏi leader" ở `query-log-drilldown-and-insights.md`.
- Sửa comment lỗi thời ở `schema.prisma` ("masked before storage") — làm trong phase 08 (owner schema).

## Todo List
- [ ] toàn bộ test xanh
- [ ] code review + sửa
- [x] docs
- [x] cập nhật status plan.md

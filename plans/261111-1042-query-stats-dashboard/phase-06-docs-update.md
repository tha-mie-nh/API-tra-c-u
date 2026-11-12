# Phase 06 — Cập nhật docs

## Context Links
- `docs/codebase-summary.md`, `docs/demo-guide.md`, `docs/deployment-guide.md`
- `plans/260920-2200-app-tra-cuu-du-lieu/reference-api-specification.md`, `reference-screens-and-ux.md`

## Overview
Priority P3 · Status completed · Phụ thuộc 03, 05.

## Requirements
- API spec: 2 endpoint, query params, response, permission `admin:query_stats`, bảng công thức chỉ số (copy từ plan.md — 1 nguồn duy nhất, các nơi khác link tới).
- Screens: trang tổng hợp + chi tiết, route, preset.
- codebase-summary: module `query-stats` (read-only trên `query_logs`), feature FE.
- deployment-guide: quyền mới cần `seed` chạy (đã tự động trong prod compose); role tuỳ chỉnh muốn xem phải cấp `admin:query_stats` qua UI vai trò.
- demo-guide: bước demo dashboard cho Egor.
- `docs/project-changelog.md`: không tồn tại → đã tạo mới 1 mục. Roadmap: chưa tạo (chờ xác nhận).

## Implementation Steps
1. Cập nhật các file trên (giao `docs-manager`).
2. Kiểm link nội bộ.

## Todo List
- [x] API spec + công thức (`docs/query-stats-dashboard.md`)
- [x] screens
- [x] codebase-summary
- [x] deployment + demo guide (`deployment-guide.md`, `demo-guide.md` mục 6)
- [x] `docs/project-changelog.md` tạo mới (theo yêu cầu, 1 mục)

## Success Criteria
- Docs khớp code thực tế; công thức chỉ số chỉ định nghĩa 1 chỗ.

## Risk Assessment / Security
- Không ghi credential/ví dụ dữ liệu thật vào docs.

## Next Steps
- Code review (`code-reviewer`), commit conventional `feat(query-stats): ...`.

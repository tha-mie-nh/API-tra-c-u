---
title: "Monitor đầu vào/đầu ra chính xác của mọi request (admin)"
description: "Lưu snapshot request gửi upstream + phản hồi upstream + phản hồi trả client cho mỗi query_logs; admin xem/tải ở chi tiết Lịch sử."
status: code-done-awaiting-ui-check
priority: P1
branch: main
created: 2026-11-12
---

# Plan: Request I/O monitoring

Yêu cầu: admin phải xem được **chính xác** đầu vào và đầu ra của mọi request. Hiện `query_logs` chỉ có tham số + recordCount. Bắt buộc làm; rủi ro dữ liệu nhạy cảm xử lý bằng thiết kế (không bỏ tính năng).

## Contract (đã đóng băng, KHÔNG sửa packages/shared nếu không báo lead)
`packages/shared/src/query-log-payload-types.ts` + quyền `history:view_payload` (FEATURE_PERMISSION_CODES.HISTORY_VIEW_PAYLOAD).

## Thiết kế
- Bảng mới `app.query_log_payloads` (PK = `query_log_id` uuid FK→query_logs ON DELETE CASCADE): `upstream_request jsonb`, `upstream_response jsonb`, `client_response jsonb`, `created_at timestamptz` (index để purge). Tách bảng để list/stats không kéo jsonb nặng.
- Ghi cùng lúc với query_logs (nested create trong `QueryLogService.record`); lỗi ghi payload KHÔNG được làm hỏng query của user (nuốt + log).
- Capture điểm: `HttpInfoAdapter` trả thêm `exchange` ({request, response}) trong result VÀ gắn vào `UpstreamError`/timeout (đọc cả body lỗi 4xx/5xx thay vì bỏ). Mock/minio-pg adapter: exchange tối thiểu. `QueryService`: client response = envelope thật (success) hoặc `{error:{code,message,details?}}` (failed/denied/validation).
- An toàn: không bao giờ lưu giá trị header auth/API key (`[redacted]`); ảnh base64 → `ImagePlaceholder`; mỗi phần > `QUERY_LOG_PAYLOAD_MAX_BYTES` (mặc định 262144) → `TruncatedMarker`.
- Env: `QUERY_LOG_PAYLOAD_ENABLED` (default true), `QUERY_LOG_PAYLOAD_MAX_BYTES`, `QUERY_LOG_PAYLOAD_RETENTION_DAYS` (default 30; purge job hằng ngày, chỉ xóa payload không xóa query_logs).
- API: `GET /history/:id/payload` — `history:view_payload` (+ scope: chỉ view_all). Ghi audit `query_log.view_payload` (capture request). Che giá trị trường `sensitive` thành "***" nếu viewer thiếu `history:view_sensitive` (client response theo `name`, upstream response theo `from`, upstream request body theo `mapTo`). Không có payload → `captured:false` (200, không 404).
- Seed: cấp `history:view_payload` cho ADMIN (seed.ts upsert permission + role).
- FE: dialog chi tiết Lịch sử thêm tab **Tổng quan | Đầu vào | Đầu ra** (hiện nếu có `history:view_payload`); JSON viewer (collapse, copy, tải .json), badge status upstream, cảnh báo truncated/masked/not-captured. Plain text/`<pre>`, KHÔNG render HTML.

## Phases
| # | Phase | Owner | Trạng thái |
|---|---|---|---|
| 01 | BE: migration, capture, sanitizer, env | agent BE | done |
| 02 | BE: API payload + seed + audit (đã bỏ mask + purge theo yêu cầu user 2026-11-12) | agent BE | done |
| 03 | FE: tab Đầu vào/Đầu ra + JSON viewer + i18n + test | agent FE | done |
| 04 | Test e2e, docs, changelog (xong); xem UI thủ công, review, build image | lead | docs done; UI check pending |

## File ownership
- BE: `apps/api/**` (trừ shared). FE: `apps/web/**`. Lead: `packages/shared/**`, `docs/**`, `plans/**`, `.env.example`.
- e2e: DB test 55434 (KHÔNG 55432). Lệnh: xem plan 261111-1614-admin-drilldown-history-stats/plan.md.

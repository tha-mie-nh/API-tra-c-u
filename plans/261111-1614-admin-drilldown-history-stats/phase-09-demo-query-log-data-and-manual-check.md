# Phase 09 — Sinh dữ liệu demo đa dạng + kiểm thủ công trên UI

## Context Links
- `scripts/mock-upstream-server.js` (cổng 4100), `scripts/seed-minio-mock-images.ts` (mẫu script TS)
- Stack dev: web 5173, api 3000, DB dev 55432

## Overview
P2. 3h (script 1.5h viết sau 01; kiểm UI 1.5h sau 05–07). Ownership: `scripts/seed-demo-query-logs.ts`, `scripts/generate-live-queries-through-api.sh`, `apps/api/package.json` (thêm script).

## Hai nguồn dữ liệu
1. **Ghi thẳng DB (chính)** — cần vì API không thể lùi `created_at` (spike cần baseline 7 ngày, nhiều giờ/ngày/tháng). `scripts/seed-demo-query-logs.ts` (Prisma):
   - Chặn an toàn: từ chối nếu `NODE_ENV=production` hoặc host DB không phải `localhost`/port ≠ 55432 (trừ khi `--allow-db=<port>`); mọi row gắn `user_agent` bắt đầu `demo-seed/` và `upstream_request_id` tiền tố `demo-` để `--clean` xóa đúng.
   - 8 user demo (tạo nếu thiếu, role OPERATOR; 1 user bị xoá → `user_id NULL`), 45 ngày gần nhất.
   - Phân bố: giờ hành chính nhiều, lác đác 19h–23h và cuối tuần (off-hours); **1 user spike** 40 query một ngày (baseline ~5/ngày); **1 CCCD tra bởi 4 user** khác datasource; **1 IP dùng bởi 3 tài khoản**; trạng thái: success rc>0, rc=0, rc NULL; failed 422/502/504 với errorCode (`VALIDATION_FAILED`, `UPSTREAM_BAD_GATEWAY`, `UPSTREAM_TIMEOUT`); denied 403 errorCode NULL; vài row statusCode NULL (log cũ); duration đuôi dài (5–30000 ms); row đúng 23:59:59.999 và 00:00:00.000 VN; username/summary chứa `=`, `+`, `@` để thử CSV injection.
   - Lệnh: `pnpm --filter api exec ts-node ../../scripts/seed-demo-query-logs.ts [--clean]` (đặt script `seed:demo-logs` trong apps/api/package.json).
2. **Qua API thật (bổ sung, kiểm luồng ghi log)** — `scripts/generate-live-queries-through-api.sh`: login 3 user (admin + 2 operator demo), gọi `POST /api/v1/query/:code` body `{"params":{...}}` với input hợp lệ / sai (422) / datasource không có quyền (denied); **≤ 25 lượt/phút/user** (sleep 2.5 s mỗi lượt, giới hạn là 30/phút/user), chạy các user song song. Cần mock 4100 chạy.
   - Lưu ý hook máy: lệnh bash không được chứa chuỗi "node_modules"/"dist".

## Kiểm thủ công (checklist, ghi kết quả vào báo cáo)
- [ ] Thống kê 7 ngày: bấm requests/answered/gap/empty/success/failed/denied/errors → Lịch sử total khớp.
- [ ] Bấm cột giờ 00h và 23h; đổi granularity Giờ/Ngày/Tháng; bucket tháng.
- [ ] Top lỗi (gồm nhóm errorCode NULL) → Lịch sử khớp.
- [ ] Reload / Back / mở link ở tab ẩn danh (login lại) giữ filter.
- [ ] Chi tiết: copy upstreamRequestId, link query tương tự, link user.
- [ ] Trang user, IP (IP 3 tài khoản có cờ), tab bất thường thấy spike/off-hours/CCCD/IP.
- [ ] CSV Lịch sử + bảng top mở bằng Excel/LibreOffice: tiếng Việt đúng, ô `=..` không thành công thức.
- [ ] Login OPERATOR (view_own): không thấy control admin, URL `?userId=<khác>` vẫn chỉ ra row của mình; AUDITOR: thấy Lịch sử/Phân tích, không có nút CSV, CCCD bị che.
- [ ] `/quan-tri/nhat-ky` thấy audit `query_log.view_detail`, `view_user_activity`, `view_ip_activity`, `query_insights.view_anomalies`, `*.export_csv` kèm filter.

## Success Criteria
Checklist đạt; `--clean` xóa sạch dữ liệu demo.

## Security Considerations
Script không chạy được vào prod; CCCD demo là số giả.

## Trạng thái triển khai (script)
Status: script DONE, CHƯA chạy trên dev (55432); kiểm UI thủ công pending.
- [x] `scripts/seed-demo-query-logs.ts` (+ `seed-demo-query-logs-data.ts` generator thuần): --dry-run, --clean, --confirm-write=<port>, --seed, --days, --reset-passwords; chặn prod/host không local/port ngoài 55432|55434. Đã thử ghi + clean trên DB test 55434.
- [x] `scripts/generate-live-queries-through-api.ts` (TS thay .sh; mật khẩu qua env LIVE_USERS) — mới dry-run, chưa gọi API thật.
- [ ] Không sửa `apps/api/package.json` (ngoài ownership); chạy bằng `pnpm --filter api exec ts-node ...`.
- [ ] Kiểm thủ công UI (checklist trên).

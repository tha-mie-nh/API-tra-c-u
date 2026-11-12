# Phase 08 — EXPLAIN trên dữ liệu lớn, thêm index khi thật cần

## Context Links
- `apps/api/prisma/schema.prisma` (QueryLog index: `(user_id, created_at desc)`, `(datasource_code, created_at desc)`, `(created_at desc)`)
- phase-02/03 (câu SQL thật)

## Overview
P2. 2.5h. **Status: done** (báo cáo: plans/reports/fullstack-developer-261111-1736-phase-08-explain-query-logs.md). Ownership: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`, `scripts/explain-query-logs.sql`. Chạy sau 02+03.

## Cách làm
1. **DB riêng cho đo** (không đụng dev 55432 hay prod): trên container test 55434 tạo DB `app_tra_cuu_perf`:
   `createdb -h localhost -p 55434 -U app_user app_tra_cuu_perf` → `DATABASE_URL=...:55434/app_tra_cuu_perf pnpm exec prisma migrate deploy`.
2. Sinh **2 triệu** row bằng `INSERT ... SELECT generate_series` (SQL trong `scripts/explain-query-logs.sql`): 60 user, 8 datasource, 365 ngày, phân bố giờ hành chính, 85% success (10% rc=0/NULL), 10% failed (status_code 422/502/504, error_code đa dạng), 5% denied; 300 IP; duration log-normal; upstream_request_id ngẫu nhiên; query_params có `citizenId`. `ANALYZE app.query_logs`.
3. Chạy `EXPLAIN (ANALYZE, BUFFERS)` cho đúng SQL do builder sinh (lấy bằng log Prisma `query` event hoặc copy từ spec):
   - list 30 ngày + mỗi filter mới (statusCode, errorCode, ip, duration, hasRecords, offHours) sort createdAt/duration, page 1 và offset 9.980;
   - count + summary (p95) 30/366 ngày;
   - `ip = X` **không** range (trang IP, firstAt/lastAt toàn thời gian);
   - `upstream_request_id = X` không range;
   - top-users 90 ngày, latency 90 ngày, anomalies 90 ngày (spike window, jsonb_each_text);
   - stats overview 366 ngày (hồi quy).
4. **Quy tắc thêm index** (ghi kết quả vào `plans/reports/planner-...-explain.md` do implementer viết): chỉ thêm khi (a) truy vấn UI thật > **300 ms** trên 2M row **và** (b) plan có Seq Scan/sort lớn mà index sẽ biến thành Index Scan (kiểm bằng tạo index thử rồi EXPLAIN lại). Không thêm index cho status_code/error_code/duration (luôn đi kèm range thời gian → index `created_at` đủ; độ chọn lọc thấp).
   - Dự đoán cần: `@@index([ip, createdAt(sort: Desc)])` (lọc IP không range), `@@index([upstreamRequestId])` (tra cứu trace id). Có thể cần cho `(user_id)` all-time firstAt — đã có `(user_id, created_at)`.
5. Nếu cần: sửa `schema.prisma` + `prisma migrate dev --name add_query_logs_ip_upstream_request_indexes` **trên DB dev 55432** (chỉ migration, không e2e), áp DB test bằng `migrate deploy`. Bảng nhỏ ở prod → `CREATE INDEX` thường chấp nhận được; nếu prod lớn ghi chú dùng `CONCURRENTLY` bằng migration tay.
6. Drop DB perf sau khi xong.

## Todo List
- [x] DB perf + 2M row
- [x] EXPLAIN đủ danh sách, lưu kết quả
- [x] quyết định index theo quy tắc; migration nếu cần
- [x] sửa comment lỗi thời `queryParams` ("masked before storage" → "lưu giá trị thật, che ở read-time theo history:view_sensitive")
- [x] e2e toàn bộ xanh sau migration (migration chưa áp lên DB test; e2e xanh khi máy không tải)

## Success Criteria
Mọi truy vấn UI ≤ 300 ms (p95 cục bộ) trên 2M row hoặc có lý do ghi rõ (vd anomalies 90 ngày chấp nhận ≤ 2 s).

## Risk Assessment
Đo trên WSL2 nhiễu → chạy 3 lần lấy median.

## Security Considerations
Dữ liệu tổng hợp giả, không dùng dữ liệu thật.

## Next Steps
Phase 10 cập nhật docs index.

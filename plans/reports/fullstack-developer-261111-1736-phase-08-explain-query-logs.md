# Phase 08 — EXPLAIN query_logs 2M dòng

Môi trường: Postgres test container (55434), DB riêng `app_tra_cuu_perf` (đã DROP). shared_buffers 128MB, work_mem 4MB, WSL2 (nhiễu). 2.000.000 dòng, 50 user (lệch), 12 datasource, 366 ngày, 1800 IP, 85/10/5% success/failed/denied, 15% duration NULL, heap 456MB.
Median của 3 lần. Script: `scripts/perf-seed-query-logs.sql`, `perf-explain-query-logs.sql`, `perf-run-explain-summary.sh`.

## Kết quả (ms) — trước / sau index

| Truy vấn | Trước | Sau | Ghi chú |
|---|---|---|---|
| list 30d mặc định (createdAt DESC) | 400 | ~(nhiễu 950) | Bitmap + top-N sort 165k dòng — xem phát hiện #1 |
| list 30d offset 9980 | 689 | 616 | cùng nguyên nhân |
| list 30d sort duration | 377 | 468 | sort 165k dòng, index không giúp |
| list 366d | 761 | 1009 | Seq Scan + sort (cùng #1) |
| list 30d statusCode=504 / errorCode / duration range / outcome=gap | 654 / 791 / 850 / 901 | 423 / 382 / 386 / 414 | cùng #1 |
| list 30d + ip | 283 | 1.2 | index mới (ip,created_at) |
| list ip không range | 212 (Seq) | 10 | index mới |
| list upstreamRequestId không range | 187 (Seq) | 0.2 | index mới |
| list 30d + upstreamRequestId | 357 | 0.2 | index mới |
| count 30d / 366d / 30d+statusCode | 250 / 1280 / 359 | 108 / 520 / 385 | volume-bound |
| summary+p95 30d / 366d | 392 / 1174 | 711 / 2457 | percentile_cont sort, volume-bound |
| trang IP: totals / span / users (không range) | 197 / 21 / 170 | 9.5 / 0.3 / 3.6 | index mới |
| trang user: span all-time / ips 90d / byDatasource 90d | 0.2 / 36 / 10 | 0.4 / 69 / 16 | OK (đã có (user_id,created_at)) |
| stats overview by datasource 366d | 587 | 906 | Seq Scan hợp lý (đọc 100% bảng) |
| stats timeseries hour 90d / day 366d / month 366d | 1584 / 2009 / 1562 | 2957 / 3739 / 2877 | volume-bound (date_trunc AT TIME ZONE) |
| stats topErrors 366d | 297 | 447 | |
| insights top-users 90d / top-errors / latency | 1194 / 373 / 1016 | 2116 / 573 / 1597 | percentile + group 490k dòng |
| anomaly spikes 90d(+30d baseline) | 1805 | 2826 | |
| anomaly offHours 90d | 844 | 1048 | |
| anomaly sharedIps 90d | 1204 | 2226 | |
| anomaly sharedIdentity 90d (jsonb_each_text) | 14873 | 20075 | xem #2 |

Lưu ý: lần đo "sau" chạy chậm đồng loạt ~1.5-2x ở cả truy vấn không liên quan index (nhiễu WSL/cache sau khi thêm 173MB index; shared_buffers nhỏ). So sánh có ý nghĩa chỉ với các dòng "index mới". Các số "trước" là baseline đáng tin hơn.

## Phát hiện

1. **`ORDER BY created_at DESC NULLS LAST, id DESC` chặn index** (`history-list-sql.repository.ts` `list()`): `created_at` NOT NULL nhưng planner không biết bỏ NULLS LAST; index Prisma `(created_at DESC)` là NULLS FIRST => Bitmap Scan + sort 165k dòng (317ms) thay vì Index Scan + Incremental Sort (0.37ms). Thử bỏ `NULLS LAST` khi sort theo created_at (đo trên cùng data): list 30d 400 -> 1.1ms; 366d 761 -> 0.3; statusCode 654 -> 5.5; errorCode 791 -> 1.0; duration-range 850 -> 2.8; outcome-gap 901 -> 0.3; offset 9980 689 -> 87. Chỉ giữ NULLS LAST cho cột nullable (duration_ms, record_count). Không sửa vì ngoài ownership; Prisma không biểu diễn được index NULLS LAST nên không thêm index cho việc này. **Đề xuất sửa 1 dòng** (SORT_COLUMN created_at -> không NULLS LAST; id DESC giữ).
2. **sharedIdentity** 15s: sort ngoài đĩa của `string_agg(DISTINCT ...)` trên ~220k nhóm (val,user) (dữ liệu giả có 300k CCCD ngẫu nhiên, nhiều nhóm hơn thực tế). Prototype (không áp dụng): tính `per_user` bằng GROUP BY thường (MIN(fkey)/MIN(ds)), lọc `HAVING COUNT(*)>=3` theo val trước, rồi mới `string_agg`/`jsonb_agg` => ~1.7s (work_mem 16MB). Lưu ý prototype đổi ngữ nghĩa field_names/datasource_codes (mỗi user chỉ lấy MIN) — cần giữ DISTINCT trên tập đã lọc nhỏ.
3. Các aggregate 90/366 ngày (timeseries, top-users, latency, spikes, offHours, sharedIps, summary p95) 0.8-3.7s: đọc 0.5-2M dòng, bound bởi volume; index không sửa được (cần covering index lớn hoặc bảng rollup). Seq Scan ở 366d là đúng (đọc 100% bảng).

## Quyết định index

THÊM 2 index (migration `20261111180000_add_query_logs_ip_and_upstream_request_id_indexes`, @@index trong schema.prisma):
- `(ip, created_at DESC)`: trang IP (3 truy vấn 170-210ms Seq Scan, tổng > 300ms) và list lọc ip 283ms -> 1-10ms. Size 60MB.
- `(upstream_request_id)`: list+upstreamRequestId 30d 357ms (>300) -> 0.2ms; không range 187 Seq -> 0.2ms. Size 113MB (dữ liệu giả toàn bộ non-null & distinct; thực tế nhỏ hơn nếu nhiều NULL).
Chi phí ghi: +173MB (index hiện có 316MB, heap 456MB) và +2 index mỗi INSERT query_logs — chấp nhận (1 INSERT/lookup). KHÔNG thêm index status_code/error_code/duration (luôn kèm range, độ chọn lọc thấp; sau fix #1 các truy vấn này đều < 6ms).
Kiểm drift: `prisma migrate diff` perf DB vs schema chỉ báo drift có sẵn ở `refresh_tokens` (không liên quan).
Prod bảng lớn: nên `CREATE INDEX CONCURRENTLY` thủ công rồi `prisma migrate resolve --applied`.

## Dọn
DB perf đã DROP. Dữ liệu seed không còn. Dựng lại: `docker exec app-tra-cuu-du-lieu-test-postgres-1 psql -U app_user -d postgres -c "CREATE DATABASE app_tra_cuu_perf"` -> `prisma migrate deploy` (DATABASE_URL perf) -> `psql < scripts/perf-seed-query-logs.sql` (~3.5 phút).

## Chưa rõ
- Có áp dụng fix #1 (bỏ NULLS LAST cho created_at) và prototype #2 không (cần chủ sở hữu history/query-insights)?
- Migration chưa áp lên DB test `app_tra_cuu` / dev / prod (theo yêu cầu).

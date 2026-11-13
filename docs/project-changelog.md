# Nhật ký thay đổi

Ghi lại các thay đổi đáng chú ý theo ngày. Mới nhất ở trên cùng.

## 2026-11-13

### Bảo mật: vá libxslt trong image web (giữ nguyên tag `web-v15`)
- `libxslt` trong image web (`nginx:1.27-alpine`, Alpine 3.21) là `1.1.42-r2`, dính 4 CVE được vá ở `1.1.42-r3`
  (CVE-2025-10911, CVE-2026-9947, CVE-2026-87636, CVE-2026-125350 — theo secdb Alpine). Image api chạy Debian và không cài libxslt nên không ảnh hưởng.
- Nguyên nhân bản cũ còn `r2`: `web.Dockerfile` đã có `apk upgrade` nhưng lớp runtime bị Docker cache giữ kết quả cũ.
  Không đổi mã nguồn/Dockerfile; build lại lớp runtime không cache: `docker build --no-cache-filter runtime -f docker/web.Dockerfile -t gthanh/app_tra_cuu:web-v15 .`
- Kiểm tra sau build: libxslt `r2 → r3`, nginx `1.27.5` và nội dung `/usr/share/nginx/html` không đổi (cùng mã băm), `nginx -t` ok, `GET /` 200.
- **Đã ghi đè tag `web-v15` trên Docker Hub** (digest `sha256:8841c17c3743379fa2074ccd2cf66e17612cbbc6e20a22ae0a265a7b99628ac1`).
  Máy nào đã pull `web-v15` trước đó phải `docker pull gthanh/app_tra_cuu:web-v15` rồi `up -d` lại để nhận bản vá.

## 2026-11-12

### Tính năng: monitor đầu vào/đầu ra của mọi request (admin)
- Mỗi lần tra cứu lưu thêm 3 phần vào bảng riêng `app.query_log_payloads`: request gửi upstream (method, url, header, body, lần thử),
  phản hồi upstream (mã HTTP, thời gian, body, kể cả body lỗi 4xx/5xx/timeout) và phản hồi trả client (kể cả lỗi/từ chối quyền/validate).
- API `GET /history/:id/payload` (quyền mới `history:view_payload`, chỉ ADMIN qua seed; mỗi lần xem ghi audit `query_log.view_payload`).
  Giá trị lưu và hiển thị **nguyên văn**, không che. User thường không có quyền này.
- Giao diện: dialog chi tiết ở Lịch sử có tab **Đầu vào / Đầu ra** (xem JSON, copy, tải .json).
- Không bao giờ lưu giá trị header xác thực/API key (`[redacted]`); ảnh base64 không lưu, thay bằng kích thước + sha256 + mime.
- Mỗi phần tối đa `QUERY_LOG_PAYLOAD_MAX_BYTES` (mặc định 2 MB), vượt thì cắt và đánh dấu. Tắt toàn bộ bằng `QUERY_LOG_PAYLOAD_ENABLED=false`.
- **Không tự xóa theo thời gian** (theo yêu cầu): cần theo dõi dung lượng bảng `query_log_payloads` ở môi trường chạy lâu.
- Migration `20261112150000_add_query_log_payloads`. Sau khi nâng cấp phải chạy lại `db:seed` để ADMIN nhận quyền mới.
- Bản ghi tạo trước bản này không có nội dung (tab báo "chưa lưu").

## 2026-11-11

### Thay đổi hành vi (cần biết khi nâng cấp)
- **Thống kê**: preset mặc định đổi từ "Hôm nay" sang **7 ngày qua** (`last_7d`).
- **Thống kê**: ngưỡng tự động gom theo ngày → tháng đổi từ 92 sang **90 ngày**.
- **Lịch sử**: khoảng thời gian là **nửa mở `[from, to)`** theo giờ VN. Trước đây `to` dùng `lte` và `YYYY-MM-DD`
  parse theo UTC nên lệch 7 giờ so với ngày VN. Nay `to` dạng ngày bao trọn ngày đó; `to` có giờ:phút (FE) gồm cả phút đã chọn.
- **Quyền mới `history:export`**: chỉ ADMIN có (seed). Role khác phải tick thủ công nếu cần xuất CSV.
- **IP khi ghi log**: `::ffff:x.x.x.x` được lưu thành `x.x.x.x`; IP không hợp lệ (ví dụ `X-Forwarded-For` rác) lưu `NULL`
  thay vì làm mất dòng log.
- **Sắp xếp theo `createdAt`** bỏ `NULLS LAST` (cột NOT NULL) để dùng index; kết quả không đổi.

### Thêm
- **Drill-down Thống kê → Lịch sử**: mọi thẻ, cột biểu đồ, dòng datasource và mã lỗi đều bấm được và mở Lịch sử
  với đúng bộ lọc (bảng `STATS_COUNTER_HISTORY_FILTER` trong `packages/shared`).
- **Bộ lọc Lịch sử mới** (một where-builder dùng chung cho Thống kê, Lịch sử, CSV, Phân tích): `outcome`
  (answered/empty/gap), `statusCode`, `errorCode`, `ip`, `durationMinMs`/`durationMaxMs`, `hasRecords`,
  `upstreamRequestId`, `offHours`; token `__null__`. Toàn bộ bộ lọc nằm trên URL.
- **Lịch sử**: sắp theo thời gian / thời gian xử lý / số bản ghi; tổng hợp (tổng, tỉ lệ thành công, p95);
  dialog chi tiết với liên kết tới user, IP, mã lỗi; `GET /history/summary`, `GET /history/datasources`.
- **Thống kê**: thêm preset 24 giờ, 7 / 30 / 90 ngày, tháng trước; chọn granularity thủ công; so sánh kỳ trước (±%).
- **Phân tích** (`/quan-tri/phan-tich-tra-cuu`, quyền `history:view_all`): top user, top lỗi, độ trễ theo nguồn,
  hoạt động theo user và theo IP, bất thường (tăng đột biến, ngoài giờ, CCCD dùng chung, IP dùng chung).
- **Xuất CSV**: Lịch sử tối đa 50.000 dòng, Phân tích tối đa 100 dòng/bảng; chống CSV injection; cần `history:export`.
- **Audit**: 6 action mới (`query_log.view_detail`, `query_log.export_csv`, `query_log.view_user_activity`,
  `query_log.view_ip_activity`, `query_insights.view_anomalies`, `query_insights.export_csv`), ghi bộ lọc, không ghi response.
- **Biến `TRUST_PROXY`** (mặc định tắt): IP thật sau reverse proxy. Giá trị sai được cảnh báo và bỏ qua.
- **2 index** `query_logs(ip, created_at DESC)` và `query_logs(upstream_request_id)` (migration `20261111180000_...`).
- Tài liệu: [`query-log-drilldown-and-insights.md`](./query-log-drilldown-and-insights.md) (mới),
  [`system-architecture.md`](./system-architecture.md) (mới), [`query-stats-dashboard.md`](./query-stats-dashboard.md) (cập nhật).

### Giới hạn đã biết
- `records` là số bản ghi trong các trang đã trả về, không phải tổng dữ liệu nguồn.
- Log ghi trước khi có cột `status_code` không có mã HTTP (hiển thị "—").
- Chưa kiểm tra giao diện trên trình duyệt thật.
- Chưa có retention/dọn `query_logs` (cần quyết định của leader).
- Ngưỡng bất thường và giờ làm việc là giá trị tạm, cần xác nhận nghiệp vụ.
- `apps/api/test/query.e2e-spec.ts` fail 5/7 từ trước: dùng datasource `CITIZEN_BASIC` đã tắt trong `config.json`, không do tính năng này.

### Triển khai
- Quyền `admin:query_stats` và `history:export` do `seed` tạo; ADMIN tự có. Role khác cần tick quyền thủ công.
  Dùng PG có sẵn: chạy lại `seed` 1 lần sau khi nâng cấp (xem [`deployment-guide.md`](./deployment-guide.md)).
- Migration 2 index: bảng lớn nên tạo bằng `CREATE INDEX CONCURRENTLY` trước, rồi `prisma migrate resolve --applied`
  (xem [`deployment-guide.md`](./deployment-guide.md#nâng-cấp-lên-image-có-drill-down-và-phân-tích)).
- Đặt `TRUST_PROXY` đúng nếu API đứng sau nginx/proxy, nếu không trang IP và "IP dùng chung" sẽ sai.

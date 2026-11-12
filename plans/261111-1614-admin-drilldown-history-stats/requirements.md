# Yêu cầu: Drill-down chi tiết cho admin — nối Thống kê tra cứu với Lịch sử tra cứu

Nguồn: yêu cầu của người dùng (giao việc), lưu nguyên văn để các agent đọc. Quyết định bổ sung ở cuối file.

## Bối cảnh
Monorepo NestJS (apps/api) + React/Vite (apps/web) + packages/shared. Postgres + Prisma, schema `app`.
Hiện có hai phần tách rời:
- **Thống kê** (`/admin/query-stats`): chỉ trả số lượng tổng hợp (requests, success, failed, denied, records, avgDurationMs), theo giờ/ngày/tháng, múi giờ cố định `Asia/Ho_Chi_Minh`.
  - Backend: apps/api/src/query-stats/ (controller, service, aggregation util, sql repository)
  - Frontend: apps/web/src/features/admin/query-stats/ (overview page, datasource detail page, range picker, bar chart)
  - Shared types: packages/shared/src/query-stats-types.ts
- **Lịch sử** (`/history`): danh sách từng lần tra cứu, lọc theo username/datasource/from/to/status, bấm xem chi tiết.
  - Backend: apps/api/src/history/ (quyền `history:view_own`, `history:view_all`)
  - Frontend: apps/web/src/features/history/
- Bảng `query_logs` (apps/api/prisma/schema.prisma:205) đã có: userId, usernameSnapshot, datasourceCode, queryParams (đã che trường sensitive), querySummary, status, statusCode, errorCode, errorMessage, recordCount, upstreamRequestId, durationMs, ip, userAgent, createdAt.

## Mục tiêu
Admin phải đi sâu được tới **từng query**: từ một con số/cột biểu đồ → danh sách query tạo ra nó → chi tiết một query → toàn bộ hoạt động của user đó. Chi tiết nhất có thể, vì đang giai đoạn dev.

## Yêu cầu (theo thứ tự ưu tiên)

### 1. Drill-down từ Thống kê sang Lịch sử
- Bấm vào cột biểu đồ, hoặc bấm vào một con số (requests / success / failed / denied) → mở trang Lịch sử với bộ lọc điền sẵn: khoảng thời gian của bucket đó (giờ/ngày/tháng, tính theo `Asia/Ho_Chi_Minh`), datasource, trạng thái.
- Các số "gap" (requests − answered) và "empty" (success − answered) cũng phải bấm được và ra đúng tập bản ghi tương ứng. Nếu không lọc được chính xác bằng bộ lọc hiện có thì thêm bộ lọc tương ứng ở API, không xấp xỉ.
- Tổng số dòng trong Lịch sử sau khi drill-down **phải bằng** con số trên Thống kê. Viết test đối chiếu điều này.

### 2. Lịch sử: bộ lọc nhận từ URL và lọc phong phú hơn
- Toàn bộ bộ lọc lưu trong URL (`?from=&to=&status=&datasource=&username=...`) để reload, Back, chia sẻ link đều giữ nguyên. Tham khảo cách `use-query-stats-range-search-params.ts` đang làm.
- `from`/`to` nhận cả datetime (không chỉ ngày) để drill-down được tới giờ/phút.
- Bổ sung bộ lọc: `statusCode`, `errorCode`, `ip`, khoảng `durationMs` (min/max chậm hơn X ms), `recordCount` (có/không có kết quả), tìm theo `upstreamRequestId`.
- Sắp xếp theo thời gian, thời gian xử lý, số bản ghi. Phân trang; cân nhắc cursor-based nếu bảng lớn.
- Hiển thị tổng hợp nhanh cho bộ lọc hiện tại: tổng số, tỉ lệ thành công, thời gian xử lý trung bình/p95.

### 3. Chi tiết một query (dialog hoặc trang riêng `/history/:id`)
Hiện đầy đủ: id, thời điểm (giờ VN), user (link sang hoạt động user), datasource, tham số đã che, querySummary, status + statusCode, errorCode + errorMessage, recordCount, durationMs, upstreamRequestId (có nút copy), IP, userAgent (parse ra trình duyệt/OS nếu đơn giản), và liên kết "Xem các query tương tự" (cùng user + datasource, cùng IP, cùng errorCode). Kiểm tra `history-detail-dialog.tsx` hiện đang hiện gì và chỉ bổ sung phần thiếu.

### 4. Góc nhìn chéo cho admin (trang thống kê mới hoặc tab)
- Top user truy vấn nhiều nhất; top user bị `denied`/`failed` nhiều.
- Top `errorCode` / `statusCode`; datasource chậm nhất (avg/p95 duration).
- Trang **hoạt động của một user**: dòng thời gian mọi query của họ, tổng theo datasource, IP/thiết bị đã dùng, lần đầu/gần nhất.
- Trang **hoạt động theo IP** tương tự (phát hiện một IP dùng nhiều tài khoản).
- Phát hiện bất thường đơn giản (không cần ML): user có số query tăng đột biến so với trung bình 7 ngày, query ngoài giờ làm việc, một CCCD/tham số bị tra nhiều lần bởi nhiều user. Chỉ cần đánh dấu và liệt kê.

### 5. Cải thiện Thống kê
- Preset mặc định đổi từ "Hôm nay" sang "7 ngày qua". Thêm preset: 24 giờ qua, 7 ngày, 30 ngày, 90 ngày, tháng trước. Giữ tùy chọn khoảng ngày (tối đa 366 ngày).
- Độ chi tiết tự đổi theo khoảng (≤2 ngày theo giờ, ≤90 ngày theo ngày, dài hơn theo tháng), cho chọn thủ công.
- Hiển thị so sánh với kỳ trước (±%).
- Xác nhận bucket giờ/ngày cắt theo `Asia/Ho_Chi_Minh` ở cả SQL lẫn FE, không lệch UTC.

### 6. Xuất dữ liệu
- Xuất CSV theo đúng bộ lọc hiện tại (Lịch sử và các bảng top). Giới hạn số dòng tối đa, stream nếu lớn. CSV phải chống CSV injection (ô bắt đầu bằng `= + - @` thì thêm tiền tố an toàn).
- Việc xuất cũng phải ghi audit.

## Ràng buộc bắt buộc
- **Quyền riêng tư / audit:** log chứa "ai tra cứu ai", rất nhạy cảm. Mọi API mới chỉ cho `history:view_all` (hoặc quyền admin phù hợp). Việc admin **xem chi tiết, xem hoạt động user/IP, xuất CSV** phải ghi vào bảng audit hiện có (xem apps/api/src/audit/, dùng `@AuditAction`), kèm bộ lọc đã dùng.
- Không lưu và không hiển thị nội dung response thô từ upstream; vẫn che trường `sensitive` ở mọi chỗ mới (kể cả CSV).
- Không phá luồng `history:view_own`: user thường vẫn chỉ thấy query của mình, scope ép ở backend, không tin query string.
- Mọi bộ lọc validate bằng zod như `list-history-query.dto`; không nối chuỗi SQL, dùng tham số hóa / Prisma.
- Hiệu năng: kiểm tra index hiện có (`user_id+created_at`, `datasource_code+created_at`, `created_at`). Với bộ lọc mới (statusCode, errorCode, ip, durationMs) chạy `EXPLAIN` trên dữ liệu đủ lớn và chỉ thêm index (migration) khi thật sự cần.
- Giữ type dùng chung trong `packages/shared`; i18n tiếng Việt theo cấu trúc hiện có (`apps/web/src/i18n/`).

## Quy trình & chuẩn code (theo CLAUDE.md của dự án)
1. Đọc README.md và ./docs trước. Lập plan trong `./plans` (dùng planner agent) trước khi code; làm từng phase nhỏ, mỗi phase xong chạy được.
2. YAGNI/KISS/DRY. Sửa file hiện có, không tạo bản "enhanced" song song. File kebab-case, mô tả rõ mục đích, mỗi file < 200 dòng — tách module nếu vượt.
3. Sau khi sửa: `pnpm typecheck`, `pnpm lint`, `pnpm test`. Viết test thật (không mock cho qua): đặc biệt test đối chiếu số Thống kê = số dòng Lịch sử, test scope quyền, test múi giờ ở ranh giới nửa đêm, test CSV injection.
4. Chạy thử trên stack dev với dữ liệu mock (`scripts/mock-upstream-server.js`); tạo đủ dữ liệu đa dạng (nhiều user, nhiều trạng thái, nhiều giờ) để kiểm tra thủ công bằng giao diện.
5. Dùng code-reviewer agent sau khi xong; cập nhật docs (changelog, system-architecture) và `docs/demo-guide.md` cho phần mới.
6. Không commit khi chưa được yêu cầu; commit theo conventional commits, không có dòng attribution AI.

## Câu hỏi gốc cần xác nhận (đã có quyết định ở dưới)
- "Hoạt động theo IP" và phát hiện bất thường có nằm trong phạm vi lần này không, hay để sau?
- Thời hạn lưu `query_logs` (retention) là bao lâu? Có cần dọn/gộp log cũ không?

## Quyết định bổ sung (từ người dùng: "chi tiết hơn cho admin nhất có thể")
- Phần 4 (hoạt động theo user, theo IP, phát hiện bất thường) **nằm trong phạm vi lần này**.
- Retention/dọn log: **ngoài phạm vi** (không làm job xóa/gộp). Ghi vào docs như việc cần hỏi leader.

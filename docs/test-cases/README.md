# Sổ kịch bản kiểm thử tay (rất chi tiết)

Mỗi ca ghi **dữ liệu nhập chính xác**, **từng thao tác**, **kết quả phải nhìn thấy** (ở đâu, đúng khi nào) và **cách đối chiếu độc lập** (lệnh, log, cấu hình, mạng). Có thể tự thực hiện từng ca mà không cần ai giải thích.

| File | Nội dung | Mã ca |
|---|---|---|
| [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md) | Dựng môi trường, tài khoản, dữ liệu mẫu (bảng giá trị thật), cách quan sát (Network, Console, log, cấu hình, curl), sao lưu/khôi phục | (đọc trước) |
| [01](01-xac-thuc-va-phien.md) | Đăng nhập, khóa tài khoản, đổi mật khẩu, phiên, token hết hạn, đăng xuất, giới hạn đăng nhập | AUTH-01..11 |
| [02](02-nguoi-dung-vai-tro-quyen.md) | Người dùng, vai trò, phân quyền theo từng nguồn dữ liệu | USER-01..05, ROLE-01..05 |
| [03](03-quan-tri-nguon-du-lieu.md) | Tạo/sửa nguồn dữ liệu: GET, POST query+body, URL tự viết, xóa cache, lưu không đổi gì, trường làm tiêu đề, schema, báo lỗi lưu, `recordsPath`, tải lại cấu hình | DS-01..16 |
| [04](04-danh-muc-enum.md) | Danh mục (enum/dictionary) và các nơi dùng nó | DICT-01..08 |
| [05](05-tra-cuu-va-ngay-gio.md) | Tra cứu thông tin, kiểm tra dữ liệu nhập, phân trang, sắp xếp, định dạng ngày (nguồn, hiển thị, đầu vào), múi giờ | Q-01..09, DT-01..08 |
| [06](06-tra-cuu-anh.md) | Ảnh: hiện thumbnail, xem lớn 80%, khóa sai (401), lặp nhiều lần | IMG-01..08 |
| [07](07-do-ben-loi-upstream-va-mang.md) | Retry, timeout, 4xx, upstream treo, kết nối chết khi nhàn rỗi, spam, cô lập giữa các nguồn | RES-01..10 |
| [08](08-lich-su-log-cau-hinh-trien-khai.md) | Lịch sử tra cứu, log và truy vết, cấu hình cũ/mới, giá trị mặc định, triển khai, nâng cấp | HIS-01..06, LOG-01..05, CFG-01..03, DEP-01..02 |

## Cách dùng
1. Đọc file 00, dựng môi trường, sao lưu `config.json`.
2. Làm theo thứ tự file 01 → 08 (một số ca dùng kết quả của ca trước: tài khoản `tester_a`, nguồn `T_ECHO_POST`, danh mục `GIOI_TINH`).
3. Ghi kết quả mỗi ca: **Đạt / Không đạt / Chặn**, kèm bằng chứng (ảnh chụp, `requestId`, đoạn log).

## Chưa có trong sổ này (kế hoạch ở `plans/261117-0912-test-strategy-and-automation/`)
Thống kê và phân tích tra cứu, nhật ký quản trị chi tiết, xuất CSV phân tích, tải và hỗn loạn quy mô lớn, bảo mật chuyên sâu, kiểm thử đa trình duyệt, MinIO proxy ảnh, và toàn bộ phần **tự động** (Playwright, e2e API). Các nhóm này sẽ được viết chi tiết theo cùng mẫu ở các lượt sau.

## Lỗi thật đã tìm thấy khi viết sổ này
- Giá trị ngày giờ **không có múi giờ** (ví dụ `2024-10-15T09:43:27`) bị trình duyệt hiểu là giờ máy người xem, lệch với các trường ngày có `format`; đã sửa phía API (nay mặc định UTC hoặc `sourceTimeZone`).
- Nhãn ô `recordsPath` trên form vẫn ghi "bắt buộc / bỏ trống luôn ra 0 kết quả" trong khi response dạng mảng gốc nay dùng được; đã sửa nhãn.

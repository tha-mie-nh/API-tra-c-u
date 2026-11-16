# Báo cáo sửa lỗi 2026-11-16

Các lỗi do Hưng báo, nhóm dễ và vừa đã sửa xong. Chi tiết kỹ thuật xem `project-changelog.md` (mục 2026-11-16).

## Đã sửa

| Lỗi | Nguyên nhân | Đã sửa |
|---|---|---|
| Date/datetime không sort | Backend sort bằng `new Date()` nên dạng `DD/MM/YYYY HH:mm:ss` ra NaN, mọi dòng bằng nhau. Field khai báo `string` còn bị bỏ qua bước parse | Khóa sort lấy từ giá trị gốc của upstream cùng `format` của field. Sort đúng cả khi field là `string` |
| Datetime 2 dòng đầu đúng, các dòng sau hiện `-` | `format` chỉ nhận một dạng, dòng lệch dạng thì parse thất bại, FE hiện `—`. Form admin không có ô `format` nên **bấm Lưu làm mất `format` trong config.json** | `format` nhận nhiều dạng, ngăn cách bằng `\|`. Giá trị không parse được hiện nguyên văn. Form admin có ô `format` và giữ nguyên khi lưu |
| Định dạng hiển thị date/datetime không cấu hình được | FE cứng `dd-MM-yyyy` | Thêm `displayFormat` cho từng field (ví dụ `DD/MM/YYYY HH:mm`), có ô nhập trong form admin. Không đặt thì giữ hành vi cũ |
| Log thiếu, không trace được lỗi | Log JSON với timestamp dạng số, không có log request/response, nguyên nhân lỗi upstream bị nuốt | Log text `asctime - LEVEL - context - message`. Mỗi request có dòng `-->` khi vào và `<--` khi trả, kèm status, ms, requestId, user. Lỗi ghi kèm nguyên nhân và stack. Ghi thêm ra `/var/log/app/api.log` (cấu hình `LOG_FILE`). Không ghi body/query string vì có CCCD |

Đã kiểm tra: test API 226/227 pass (1 test fail do `FAMILY_EVENTS_BASE_URL` chưa đặt trong env, không liên quan), typecheck API và Web sạch. Log mới đã chạy thử trên API thật. Chưa kiểm tra giao diện trên trình duyệt.

## Chưa sửa

- **Request lần đầu không gửi, phải bấm 2-3 lần**: backend gọi lần đầu đã trả 200, chưa tái hiện được. Cần tái hiện trên trình duyệt hoặc lab, log mới sẽ hỗ trợ truy vết.
- **FE mất URL và API key sau khi xóa cache**: chưa tái hiện được. Nghi form admin khi biến môi trường chưa được tải.
- **Danh sách chọn (enum dictionary) có màn cấu hình riêng**: tính năng mới, cần làm riêng.
- **Bỏ map 2 lần (`ngay_sinh → dob → Ngày sinh`)**: đổi cấu trúc config, cần Hưng xác nhận trước.
- Log phía frontend (chỉ warn/error) chưa làm.

## Cần xác nhận

- Upstream gửi ngày giờ theo giờ Việt Nam hay UTC? Hiện `15/01/2026 09:30:00` được hiểu là UTC nên FE hiển thị 16:30 (lệch 7 giờ).

## Khi triển khai

- Cần build lại image api để có log mới.
- Muốn ghi log ra file: tạo thư mục `./logs` (compose prod đã mount `./logs:/var/log/app`).

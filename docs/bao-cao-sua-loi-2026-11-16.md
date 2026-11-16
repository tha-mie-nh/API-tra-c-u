# Báo cáo sửa lỗi 2026-11-16

Các lỗi do Hưng báo, nhóm dễ và vừa đã sửa xong. Chi tiết kỹ thuật xem `project-changelog.md` (mục 2026-11-16).

## Đã sửa

| Lỗi | Nguyên nhân | Đã sửa |
|---|---|---|
| Date/datetime không sort | Backend sort bằng `new Date()` nên dạng `DD/MM/YYYY HH:mm:ss` ra NaN, mọi dòng bằng nhau. Field khai báo `string` còn bị bỏ qua bước parse | Khóa sort lấy từ giá trị gốc của upstream cùng `format` của field. Sort đúng cả khi field là `string` |
| Datetime 2 dòng đầu đúng, các dòng sau hiện `-` | `format` chỉ nhận một dạng, dòng lệch dạng thì parse thất bại, FE hiện `—`. Form admin không có ô `format` nên **bấm Lưu làm mất `format` trong config.json** | `format` nhận nhiều dạng, ngăn cách bằng `\|`. Giá trị không parse được hiện nguyên văn. Form admin có ô `format` và giữ nguyên khi lưu |
| Định dạng hiển thị date/datetime không cấu hình được | FE cứng `dd-MM-yyyy` | Thêm `displayFormat` cho từng field (ví dụ `DD/MM/YYYY HH:mm`), có ô nhập trong form admin. Không đặt thì giữ hành vi cũ |
| Log thiếu, không trace được lỗi | Log JSON với timestamp dạng số, không có log request/response, nguyên nhân lỗi upstream bị nuốt | Log text `asctime - LEVEL - context - message`. Mỗi request có dòng `-->` khi vào và `<--` khi trả, kèm status, ms, requestId, user. Lỗi ghi kèm nguyên nhân và stack. Ghi thêm ra `/var/log/app/api.log` (cấu hình `LOG_FILE`). Không ghi body/query string vì có CCCD |

Đã kiểm tra: test API 233/234 pass (1 test fail do biến môi trường `*_BASE_URL` chưa đặt khi chạy test, không liên quan), test web 179/179 pass, typecheck sạch. Log, danh mục, query param, múi giờ đã chạy thử trên API thật. Chưa kiểm tra giao diện trên trình duyệt.

Theo góp ý đợt 1 của leader: field kiểu Ngày/Ngày giờ trong form admin hiện ngay 2 dropdown chọn mẫu, **format đọc từ API thật** (chuyển chuỗi sang ngày) và **format hiển thị đầu ra**, có mục "Tùy chỉnh…" và ví dụ xem trước.

## Bổ sung theo góp ý đợt 2 của leader

| Yêu cầu | Đã làm |
|---|---|
| Không trace được transaction req/resp; giả lập 1 API dạng docker image trả về mặc định kèm query/body/param; hỗ trợ query param (`tab=1` thành `?tab=1`) | Thêm **API giả echo** (`scripts/mock-echo-server.js`, `docker/mock-echo.Dockerfile`): trả 200 với bản ghi mặc định cùng khối `echo` phản ánh đúng method, URL, query, header (đã che khóa), body. Thêm **query param tĩnh** cho nguồn dữ liệu (nhập ở form admin). Mỗi lần gọi upstream có log `-->`/`<--` và gửi `X-Request-Id` sang upstream để nối log hai phía |
| Mất URL và API key trên frontend | Tìm ra một lỗi thật ở form: chọn "Nhập tay" làm giá trị rỗng và ẩn ô nhập nên URL/API key trông như biến mất. Đã sửa, kèm cảnh báo khi biến môi trường chưa đặt trên server. Chưa tái hiện được trên trình duyệt thật, cần leader kiểm tra lại với cùng thao tác |
| Mục cấu hình danh mục, bảng key-value, các trường lấy từ đây | Trang **Danh mục** (`/quan-tri/danh-muc`): thêm/sửa/xóa bảng key-value, hiện danh mục đang được trường nào dùng. Trường input/output chọn danh mục ở ô "Danh mục". Sửa có hiệu lực ngay |
| Map 1 lần: key theo API và tên hiển thị, cả input và output | `name` của trường chính là key API (`ngaySinh` → "Ngày sinh"), bỏ `mapTo`/`from` khỏi form và `config.json`. Có script chuyển config cũ. Config cũ vẫn chạy |
| Frontend chỉ cần warn/error, backend log kỹ | Giữ nguyên frontend. Backend đã log request/response, truy vấn, gọi upstream và lỗi kèm nguyên nhân |
| Múi giờ: UTC cũng được, hoặc cài đặt múi giờ để frontend hiển thị theo đó | Mỗi trường ngày giờ có **múi giờ API thật** (mặc định UTC) và **múi giờ hiển thị** (mặc định Asia/Ho_Chi_Minh), chọn trong form admin |

**Lỗi của bản trước được phát hiện và sửa:** định dạng hiển thị (`displayFormat`) bị schema từ chối khi lưu (schema không cho phép khóa này), nghĩa là ô chọn format hiển thị ở bản trước chưa lưu được. Đã sửa và có test hồi quy. Phải build lại image api và web mới có tác dụng.

## Chưa sửa

- **Request lần đầu không gửi, phải bấm 2-3 lần**: backend gọi lần đầu đã trả 200, chưa tái hiện được. Log mới (cả phía app và phía upstream) cùng API echo dùng để truy vết khi xảy ra lại.
- Log phía frontend: để nguyên theo góp ý (chỉ cần warn/error).

## Khi triển khai

- Build lại image api, web (và `mock-echo` nếu cần). Tạo thư mục `./logs` cho log file.
- `deploy-check/config` chưa chuyển sang định dạng map 1 lần, sẽ chuyển khi build bản phát hành kế tiếp. Có thể chạy `node scripts/migrate-config-single-key.js <config.json> --write`.

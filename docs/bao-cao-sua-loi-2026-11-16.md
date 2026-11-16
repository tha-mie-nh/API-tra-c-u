# Báo cáo sửa lỗi 2026-11-16

Các lỗi được báo trong quá trình sử dụng, nhóm dễ và vừa đã sửa xong. Chi tiết kỹ thuật xem `project-changelog.md` (mục 2026-11-16).

## Đã sửa

| Lỗi | Nguyên nhân | Đã sửa |
|---|---|---|
| Date/datetime không sort | Backend sort bằng `new Date()` nên dạng `DD/MM/YYYY HH:mm:ss` ra NaN, mọi dòng bằng nhau. Field khai báo `string` còn bị bỏ qua bước parse | Khóa sort lấy từ giá trị gốc của upstream cùng `format` của field. Sort đúng cả khi field là `string` |
| Datetime 2 dòng đầu đúng, các dòng sau hiện `-` | `format` chỉ nhận một dạng, dòng lệch dạng thì parse thất bại, FE hiện `—`. Form admin không có ô `format` nên **bấm Lưu làm mất `format` trong config.json** | `format` nhận nhiều dạng, ngăn cách bằng `\|`. Giá trị không parse được hiện nguyên văn. Form admin có ô `format` và giữ nguyên khi lưu |
| Định dạng hiển thị date/datetime không cấu hình được | FE cứng `dd-MM-yyyy` | Thêm `displayFormat` cho từng field (ví dụ `DD/MM/YYYY HH:mm`), có ô nhập trong form admin. Không đặt thì giữ hành vi cũ |
| Log thiếu, không trace được lỗi | Log JSON với timestamp dạng số, không có log request/response, nguyên nhân lỗi upstream bị nuốt | Log text `asctime - LEVEL - context - message`. Mỗi request có dòng `-->` khi vào và `<--` khi trả, kèm status, ms, requestId, user. Lỗi ghi kèm nguyên nhân và stack. Ghi thêm ra `/var/log/app/api.log` (cấu hình `LOG_FILE`). Không ghi body/query string vì có CCCD |

Đã kiểm tra: test API 233/234 pass (1 test fail do biến môi trường `*_BASE_URL` chưa đặt khi chạy test, không liên quan), test web 179/179 pass, typecheck sạch. Log, danh mục, query param, múi giờ đã chạy thử trên API thật. Chưa kiểm tra giao diện trên trình duyệt.

Chọn định dạng ngày: field kiểu Ngày/Ngày giờ trong form admin hiện ngay 2 dropdown chọn mẫu, **format đọc từ API thật** (chuyển chuỗi sang ngày) và **format hiển thị đầu ra**, có mục "Tùy chỉnh…" và ví dụ xem trước.

## Bổ sung đợt 2

| Yêu cầu | Đã làm |
|---|---|
| Không trace được transaction req/resp; giả lập 1 API dạng docker image trả về mặc định kèm query/body/param; hỗ trợ query param (`tab=1` thành `?tab=1`) | Thêm **API giả echo** (`scripts/mock-echo-server.js`, `docker/mock-echo.Dockerfile`): trả 200 với bản ghi mặc định cùng khối `echo` phản ánh đúng method, URL, query, header (đã che khóa), body. Thêm **query param tĩnh** cho nguồn dữ liệu (nhập ở form admin). Mỗi lần gọi upstream có log `-->`/`<--` và gửi `X-Request-Id` sang upstream để nối log hai phía |
| Mất URL và API key trên frontend | Tìm ra một lỗi thật ở form: chọn "Nhập tay" làm giá trị rỗng và ẩn ô nhập nên URL/API key trông như biến mất. Đã sửa, kèm cảnh báo khi biến môi trường chưa đặt trên server. Chưa tái hiện được trên trình duyệt thật, cần kiểm tra lại với cùng thao tác trên môi trường gặp lỗi |
| Mục cấu hình danh mục, bảng key-value, các trường lấy từ đây | Trang **Danh mục** (`/quan-tri/danh-muc`): thêm/sửa/xóa bảng key-value, hiện danh mục đang được trường nào dùng. Trường input/output chọn danh mục ở ô "Danh mục". Sửa có hiệu lực ngay |
| Map 1 lần: key theo API và tên hiển thị, cả input và output | `name` của trường chính là key API (`ngaySinh` → "Ngày sinh"), bỏ `mapTo`/`from` khỏi form và `config.json`. Có script chuyển config cũ. Config cũ vẫn chạy |
| Frontend chỉ cần warn/error, backend log kỹ | Giữ nguyên frontend. Backend đã log request/response, truy vấn, gọi upstream và lỗi kèm nguyên nhân |
| Múi giờ: UTC cũng được, hoặc cài đặt múi giờ để frontend hiển thị theo đó | Mỗi trường ngày giờ có **múi giờ API thật** (mặc định UTC) và **múi giờ hiển thị** (mặc định Asia/Ho_Chi_Minh), chọn trong form admin |

**Lỗi của bản trước được phát hiện và sửa:** định dạng hiển thị (`displayFormat`) bị schema từ chối khi lưu (schema không cho phép khóa này), nghĩa là ô chọn format hiển thị ở bản trước chưa lưu được. Đã sửa và có test hồi quy. Phải build lại image api và web mới có tác dụng.

## Lỗi tìm được và sửa ở phía ứng dụng (đợt 3)

Đã tái hiện bằng trình duyệt thật và upstream giả chập chờn, không còn chỉ là suy đoán.

| Triệu chứng được báo | Nguyên nhân thật | Đã sửa |
|---|---|---|
| Lần đầu tra cứu không gửi được, bấm lần 2-3 mới được | `defaults` trong config (retry 2 lần, timeout, giới hạn) **không được dùng ở đâu**. Nguồn dữ liệu không khai báo `retry` có 0 lần thử lại, một lần upstream reset kết nối hoặc trả 503 là báo lỗi 502 ngay | Áp dụng `defaults` vào cấu hình chạy. Tái hiện: lần 1 trả 502, lần 2-3 trả 200. Sau sửa: lần 1 tự thử lại và trả 200 |
| Xóa cache thì mất URL và API key trong form nguồn dữ liệu | Ô chọn (Radix Select) tự bắn giá trị rỗng khi danh sách biến môi trường tải về sau. Form ghi `${}` vào URL và xóa tên biến API key | Bỏ qua giá trị rỗng. Kiểm tra lại bằng trình duyệt: hiện đúng tên biến |
| Cấu hình đổi sau khi bấm Lưu mà không sửa gì | Form không biết một số khóa (như `labelField`) nên lưu xong là mất | Form giữ nguyên khóa nó không quản lý, thêm ô `labelField`. Lưu không sửa gì cho kết quả giống hệt bản trước |
| Không trace được transaction | Backend không log request, FE không có id | Log request/response/truy vấn/upstream ở BE. FE gửi `X-Request-Id` và ghi warn/error kèm id để khớp với dòng log BE. Image echo `mock-echo-v1` có chế độ giả lập upstream chập chờn |

Ngoài ra: lúc tải trang và đăng nhập, `/auth/me` gọi trước khi có token nên luôn 401 rồi phải refresh thêm. Đã sửa.

## Chưa sửa

- Chưa thấy trường hợp nào khác làm "lần đầu không gửi" trên máy mình. Nếu lab vẫn còn, mở console trình duyệt (có dòng `[api] ... requestId=...`) và tìm requestId đó trong log backend: không có dòng `-->` nghĩa là request không tới được server.
- Log phía frontend: để nguyên (frontend chỉ cần warn/error).

## Khi triển khai

- Build lại image api, web (và `mock-echo` nếu cần). Tạo thư mục `./logs` cho log file.
- `deploy-check/config` chưa chuyển sang định dạng map 1 lần, sẽ chuyển khi build bản phát hành kế tiếp. Có thể chạy `node scripts/migrate-config-single-key.js <config.json> --write`.

# Hướng dẫn Demo

Tài liệu để tự thử toàn bộ chức năng hệ thống. Không cần setup gì thêm nếu app đang chạy sẵn (`pnpm dev`).

## Truy cập

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1/health

## Đăng nhập

| Username | Mật khẩu tạm | Ghi chú |
|---|---|---|
| `admin` | `r2lfivtSYqn8X1ZeY6NU` | Bắt buộc đổi mật khẩu ngay lần đăng nhập đầu tiên |

Nếu mật khẩu tạm này đã hết hiệu lực (đã đổi qua lần đăng nhập trước), dùng lệnh sau để cấp mật khẩu tạm mới:

```bash
pnpm --filter api run reset-admin-password admin
```

## 1. Tra cứu dữ liệu — 4 nguồn dữ liệu (API thật theo `spec upstream`)

Vào **Tra cứu** ở menu trái, chọn từng mục dưới đây.

> Đã tắt toàn bộ 8 datasource demo/mock ban đầu (2026-09-30) — chỉ giữ lại 4 datasource API thật bên dưới. Việc tắt chỉ set `enabled: false` trong `config/config.json` (không xóa code/mock-data), có thể bật lại bất kỳ lúc nào nếu cần minh họa lại cơ chế adapter generic.

### Nhóm API thật (theo `spec upstream` — 4 mục)

Đang chạy ở chế độ mock (chưa có base URL/token thật), nhưng field mapping đã đúng 100% theo tài liệu — khi có API thật chỉ cần đổi `transport.kind` trong `config/config.json`, không sửa code.

| Mục tra cứu | Cách nhập | Giá trị mẫu | Điểm cần xem |
|---|---|---|---|
| Tra cứu dữ liệu xuất nhập cảnh | Cần đủ **ít nhất 1 trong 2 nhóm** — không bắt buộc chọn 1, điền đủ cả 2 nhóm (cả 4 trường) cùng lúc vẫn hợp lệ:<br>• Nhóm 1: Số hộ chiếu<br>• Nhóm 2: Họ tên + Ngày sinh + Giới tính (đủ cả 3) | Chỉ nhóm 1: `E00123456`<br>Hoặc chỉ nhóm 2: `Nguyễn Văn A` / **31/12/1999** *(chọn trên ô lịch)* / `Nam`<br>Hoặc cả 4 trường cùng lúc | Trả về 2 bản ghi (1 xuất, 1 nhập), sort theo thời gian. Thử điền dở dang 1 nhóm (vd chỉ Họ tên, thiếu Ngày sinh/Giới tính, không có Số hộ chiếu) → phải báo lỗi validate |
| Tra cứu thông tin hộ chiếu | Cùng logic — đủ **ít nhất 1 trong 2 nhóm**, điền cả 2 nhóm cùng lúc vẫn hợp lệ:<br>• Nhóm 1: Số CMND/CCCD<br>• Nhóm 2: Họ tên + Ngày sinh + Giới tính | Chỉ nhóm 1: `001099001234`<br>Hoặc chỉ nhóm 2: `Nguyễn Văn A` / **31/12/1999** / `Nam`<br>Hoặc cả 4 trường cùng lúc | Trả đủ 19 trường: hộ tịch, hộ chiếu, địa chỉ... |
| Tra cứu thông tin GPLX | Điền **đủ cả 5 trường** (bắt buộc, không có nhóm nào cả — khác 2 mục trên) | Họ tên: `Nguyễn Văn A`<br>Số GPLX: `010123456789`<br>Số CCCD: `001099001234`<br>Ngày sinh: **31/12/1999**<br>Hạng GPLX: `B2` | Kết quả có **ảnh GPLX hiển thị thumbnail** — bấm vào ảnh để xem to |
| Tra cứu ảnh mặt | Số CMND/CCCD | `001099001234` | Ảnh mặt base64 hiển thị trực tiếp, không qua MinIO |

> Trường "Ngày sinh" là ô chọn lịch (date picker) của trình duyệt — cứ bấm vào ô và chọn ngày 31/12/1999, không cần gõ tay.

**Điểm nhấn khi demo:**
- Ô nhập liệu của "Xuất nhập cảnh" và "Hộ chiếu" hiện dòng gợi ý ngay trên form: *"Nhập đủ một trong các nhóm sau: ... HOẶC ..."* — đây là **OR, không loại trừ**: điền đủ cả 2 nhóm (cả 4 trường) cùng lúc vẫn submit được bình thường, không bắt buộc chỉ chọn 1 nhóm rồi bỏ trống nhóm kia.
- Nếu điền thiếu cả 2 nhóm (ví dụ chỉ Họ tên, thiếu Ngày sinh/Giới tính, và không có Số hộ chiếu/CCCD) → hệ thống chặn ngay, không cho submit.
- Ảnh trong "GPLX" và "Ảnh mặt" là ảnh base64 nhận trực tiếp trong response JSON — khác cơ chế MinIO (metadata Postgres + bytes MinIO qua endpoint proxy riêng) từng dùng ở datasource demo `CITIZEN_PHOTO` (nay đã tắt).

## 2. Quên mật khẩu (không qua email)

**Đã có sẵn 1 yêu cầu "admin" đang chờ duyệt** — đăng nhập vào **Quản trị → Người dùng** là thấy ngay khung **"Yêu cầu đặt lại mật khẩu"** ở đầu trang với badge "1". Bấm **Duyệt** hoặc **Từ chối** để thử ngay, không cần tạo yêu cầu mới trước.

Muốn thử từ đầu (tự tạo yêu cầu mới):

1. Ở trang đăng nhập, bấm **"Quên mật khẩu?"**.
2. Nhập username bất kỳ (ví dụ `admin`) → luôn nhận thông báo giống nhau (dù username có tồn tại hay không — chống dò tài khoản).
3. Đăng nhập lại bằng `admin`, vào **Quản trị → Người dùng** → thấy khung yêu cầu ở trên với badge số lượng đang chờ.
4. Bấm **Duyệt** → hệ thống cấp mật khẩu tạm mới, hiển thị đúng 1 lần (có nút sao chép).
5. Hoặc bấm **Từ chối** → yêu cầu chuyển trạng thái "Đã từ chối".

**Lưu ý:** nếu duyệt yêu cầu "admin" có sẵn, mật khẩu tạm ở đầu tài liệu này (mục Đăng nhập) sẽ không còn dùng được — dùng mật khẩu tạm mới mà hệ thống vừa cấp.

**Lưu ý:** nếu gửi yêu cầu 2 lần liên tiếp cho cùng 1 username khi đang có yêu cầu "Đang chờ", hệ thống không tạo thêm bản ghi trùng.

## 3. Quản trị (Admin)

Vào menu **Quản trị**:

| Màn hình | Thử gì |
|---|---|
| Người dùng | Tạo user mới, khóa/mở khóa, gán vai trò, đặt lại mật khẩu, xem khung yêu cầu quên mật khẩu (mục 2) |
| Vai trò | Tạo vai trò mới, tick/untick quyền truy cập từng mục tra cứu (4 mục đang bật ở mục 1) — vai trò không có quyền thì mục tra cứu đó **biến mất khỏi menu** của user thuộc vai trò đó |
| Nhật ký quản trị | Xem lại mọi hành động admin (tạo user, khóa, đổi vai trò, duyệt/từ chối yêu cầu quên mật khẩu...) — có before/after |

## 4. Lịch sử tra cứu

Vào **Lịch sử** — mỗi lần tra cứu ở mục 1 đều được ghi lại: người tra, thời điểm, tham số tìm kiếm (đã ẩn field nhạy cảm), kết quả thành công/lỗi.

## Câu hỏi thường gặp khi demo

**Q: Vì sao "GPLX" bắt tôi điền đủ 5 trường trong khi các mục khác chỉ cần 1?**
A: Đúng theo `spec upstream` — API GPLX thật yêu cầu tất cả 5 trường đều bắt buộc (không có tùy chọn "chỉ cần 1 trong nhiều trường" như hộ chiếu/xuất nhập cảnh).

**Q: Dữ liệu ảnh GPLX/ảnh mặt là ảnh thật hay ảnh giả?**
A: Ảnh giả (1x1 pixel) — vì đang chạy mock, chưa có API thật. Cơ chế hiển thị (thumbnail + bấm để xem to) đã hoạt động đúng, chỉ cần đổi mock → API thật là ảnh sẽ hiển thị thật.

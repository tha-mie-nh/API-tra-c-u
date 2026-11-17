# 04. Danh mục (enum/dictionary) (DICT)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md); đã có nguồn `T_ECHO_POST` từ ca DS-02/DS-03 ([file 03](03-quan-tri-nguon-du-lieu.md)). Đăng nhập `pwtest`. Trang: **Quản trị → Danh mục** (`/quan-tri/danh-muc`).
Trong dev có sẵn hai danh mục cũ `GENDER` và `TAB` (không đụng vào). Các ca dưới tạo danh mục mới `GIOI_TINH`.

Bố cục trang: bên trái thẻ **Danh mục** (danh sách + ô nhập tên mới + nút **+**), bên phải thẻ chi tiết: bảng **Giá trị (key → hiển thị)** (mỗi dòng hai ô: `Key (giá trị API trả về)` và `Hiển thị cho người dùng`), nút **Thêm dòng**, dòng **Đang được dùng bởi: ...**, nút **Lưu** và **Xóa danh mục**.

---
## DICT-01 Tạo danh mục (P1)
**Dữ liệu nhập:** tên `GIOI_TINH`; dòng 1: Key `M`, Hiển thị `Nam`; dòng 2: Key `F`, Hiển thị `Nữ`; dòng 3: Key `X`, Hiển thị `Không xác định`.
**Các bước**
1. Ở ô `TEN_DANH_MUC (chữ hoa, số, gạch dưới)` gõ `GIOI_TINH` (ô tự đổi chữ hoa), bấm nút **+**.
2. Bên phải hiện thẻ tên `GIOI_TINH` với một dòng trống: điền dòng 1, bấm **Thêm dòng** hai lần, điền dòng 2 và 3.
3. Bấm **Lưu**.
**Kết quả mong đợi:** thông báo **Đã lưu danh mục**; bên trái có `GIOI_TINH` kèm **3 dòng**; dòng phụ **Chưa có trường nào dùng**.
**Đối chiếu:** `show_ds __dict` có `"GIOI_TINH": [ {"value":"M","label":"Nam"}, {"value":"F","label":"Nữ"}, {"value":"X","label":"Không xác định"} ]`.

---
## DICT-02 Tên và khóa không hợp lệ (P1)
| Làm | Kết quả đúng |
|---|---|
| Gõ tên `gioi tinh` rồi bấm **+** | **Tên chỉ gồm chữ HOA, số, gạch dưới và bắt đầu bằng chữ cái** (không tạo) |
| Gõ tên `GIOI_TINH` lần nữa rồi bấm **+** | **Danh mục này đã tồn tại** |
| Trong `GIOI_TINH` đổi Key dòng 3 thành `M` (trùng dòng 1) | hiện **Key bị trùng trong danh mục: M**, nút **Lưu** bị **khóa** |
| Để trống Hiển thị ở một dòng | nút **Lưu** bị khóa |
Sau thử đưa dòng 3 về `X`/`Không xác định` rồi **Lưu**.

---
## DICT-03 Dùng danh mục cho trường danh sách chọn ở đầu vào (P1)
**Các bước**
1. **Quản trị → Nguồn dữ liệu** → **Sửa** `T_ECHO_POST`.
2. Bấm **Thêm trường** ở phần input: name `gioiTinh`, label `Giới tính`, kiểu **Danh sách chọn**; bấm mũi tên **Mở rộng** của dòng; đặt **Gửi lên API thật bằng** = **Query param**.
3. Ở khung **Danh mục** của dòng đó chọn **GIOI_TINH** (khi chọn, danh sách lựa chọn nhập tay biến mất).
4. Ở output thêm dòng `gioiTinh` / `Giới tính` / **Danh sách chọn**, mở rộng, ở khung **Danh mục** chọn **GIOI_TINH**. **Lưu**.
5. Mở **Thử POST query+body**: nhìn ô **Giới tính**.
6. Chọn **Nữ**, `Số hộ chiếu` = `B777`, **Tra cứu**.
**Kết quả mong đợi:** (5) danh sách chọn có đúng 4 mục: **— Không chọn —**, **Nam**, **Nữ**, **Không xác định**. (6) log echo `--> POST /find?...&gioiTinh=F ...` (**giá trị gửi là mã `F`**, không phải chữ "Nữ"); kết quả hiện **Giới tính: Nữ**.
**Đối chiếu:** `show_ds T_ECHO_POST` thấy trường input `gioiTinh` có `"optionsRef": "GIOI_TINH"` **và không có** mảng `options`; trường output có `"valueMapRef": "GIOI_TINH"`.

---
## DICT-04 Mã không có trong danh mục (P2)
**Các bước:** gọi thẳng echo để đưa về giá trị lạ: **Sửa** `T_ECHO_POST` tạm bỏ trường input `gioiTinh`; khi đó echo trả `gioiTinh` không có. Cách đơn giản hơn: tra cứu với **Giới tính = Không xác định** (mã `X`).
**Kết quả mong đợi:** `X` hiện **Không xác định**. Nếu thêm vào danh mục sau đó xóa dòng `X` rồi tra cứu lại: giá trị `X` hiện **nguyên mã `X`** (không để trống, không lỗi).

---
## DICT-05 Sửa danh mục có hiệu lực ngay, không khởi động lại (P1)
**Các bước:** mở **Thử POST query+body** ở một tab, ghi nhận danh sách Giới tính. Ở tab **Danh mục** đổi Hiển thị dòng `M` từ `Nam` thành `Nam giới`, **Lưu**. Quay lại tab tra cứu, bấm **F5**.
**Kết quả mong đợi:** danh sách chọn có **Nam giới** thay cho **Nam**; không phải chạy lại `pnpm dev`. Đổi lại `Nam` và **Lưu**.
**Đối chiếu:** `curl -s localhost:3000/api/v1/datasources/T_ECHO_POST -H "authorization: Bearer $TOKEN" | grep -o '"label":"Nam[^"]*"'`.

---
## DICT-06 Xóa danh mục đang được dùng bị chặn (P1)
**Các bước:** ở trang **Danh mục** chọn `GIOI_TINH`, quan sát dòng **Đang được dùng bởi:**, bấm **Xóa danh mục**, xác nhận ở hộp thoại **Xóa danh mục?**.
**Kết quả mong đợi:** dòng **Đang được dùng bởi** liệt kê `T_ECHO_POST.gioiTinh (đầu vào)` và `T_ECHO_POST.gioiTinh (đầu ra)`; xác nhận xóa thì hiện lỗi nêu **Danh mục "GIOI_TINH" đang được dùng bởi: T_ECHO_POST.gioiTinh, ...**, danh mục **còn nguyên**.
**Sau đó:** vào `T_ECHO_POST` gỡ trường `gioiTinh` ở cả input và output (hoặc chuyển ô **Danh mục** về **Nhập tay**), lưu; quay lại xóa `GIOI_TINH` thì thành công (**Đã xóa danh mục**), `show_ds __dict` không còn `GIOI_TINH`.

---
## DICT-07 Tham chiếu tới danh mục không tồn tại bị từ chối (P1)
**Các bước:** sửa tay `config/config.json`: ở một input enum của `T_ECHO_POST` thêm `"optionsRef": "KHONG_CO"`; lưu file; gọi reload:
`curl -s -X POST localhost:3000/api/v1/admin/datasources/reload -H "authorization: Bearer $TOKEN"`
**Kết quả mong đợi:** phản hồi lỗi chứa **`references unknown dictionary "KHONG_CO"`**; menu tra cứu vẫn dùng cấu hình **cũ** (ứng dụng không sập). Sửa lại file rồi reload.

---
## DICT-08 Mẫu định dạng ngày là danh sách tĩnh (P2)
**Các bước:** **Sửa** một nguồn có trường ngày (ví dụ `SA_SEARCH_GET`), ở output `update_at` mở ô **Hiển thị cho người dùng (displayFormat)**.
**Kết quả mong đợi:** danh sách gồm **Mặc định (DD-MM-YYYY)**, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, `DD/MM/YYYY HH:mm`, `DD/MM/YYYY HH:mm:ss`, `HH:mm DD/MM/YYYY` và **Tùy chỉnh…**; bên dưới có dòng **Ví dụ:** đổi theo mẫu chọn. Không có mục này trong trang **Danh mục** (mẫu ngày là tĩnh theo yêu cầu). Bấm **Hủy**.

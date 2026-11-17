# 02. Người dùng, vai trò, phân quyền (USER, ROLE)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md). Đăng nhập `pwtest` (quản trị viên). Các ca này **tạo ra** hai tài khoản dùng lại ở các file sau: `tester_a` (người tra cứu thường) và `tester_b`.

---
## USER-01 Tạo người dùng (P1)
**Mục tiêu:** tạo người dùng, nhận mật khẩu tạm một lần, người dùng mới đăng nhập được.
**Dữ liệu nhập:** Tên đăng nhập `tester_a`; Họ và tên `Tester A`; Email `tester_a@example.com`; Vai trò ban đầu: để trống (gán ở ROLE-01).
**Các bước**
1. Menu trái **Quản trị → Người dùng**.
2. Bấm **Tạo người dùng** (tiêu đề hộp thoại **Tạo người dùng mới**).
3. Điền 3 ô như trên, bấm nút xác nhận của hộp thoại.
4. Hộp thoại **Mật khẩu tạm thời** hiện ra: bấm **Sao chép** (hiện **Đã sao chép vào clipboard**), dán vào ghi chú để dùng cho AUTH-04.
**Kết quả mong đợi:** *Đúng khi:*
- Có thông báo **Đã tạo người dùng thành công**; dòng `tester_a` xuất hiện trong bảng, cột **Trạng thái** = **Đang hoạt động**, cột **Vai trò** = **Chưa có vai trò**.
- Hộp thoại mật khẩu tạm có cảnh báo chỉ hiển thị một lần; đóng lại rồi **không** xem lại được.
**Đối chiếu:** `docker exec app-tra-cuu-du-lieu-postgres-1 psql -U app_user -d app_tra_cuu -c "select username,status,must_change_password from app.users where username='tester_a'"` ra `ACTIVE` và `must_change_password = t`. Cột mật khẩu băm (`password_hash`) bắt đầu bằng `$argon2id$` (không lưu mật khẩu rõ).
**Thử thêm (xấu):**
| Nhập | Kết quả đúng |
|---|---|
| Tên đăng nhập `ab` (2 ký tự) | **Vui lòng nhập tên đăng nhập (tối thiểu 3 ký tự)** |
| Tên đăng nhập `tester_a` lần nữa | **Tên đăng nhập đã tồn tại** |
| Email `khong-phai-email` | **Email không hợp lệ** |
| Bỏ trống Họ và tên | **Vui lòng nhập họ và tên** |

Lặp lại các bước tạo thêm `tester_b` / `Tester B`.

---
## USER-02 Tìm kiếm trong danh sách (P2)
**Các bước:** ở trang **Người dùng**, gõ `tester` vào ô **Tìm theo tên đăng nhập hoặc họ tên...**; sau đó gõ `Tester B`; sau đó gõ `zzz`.
**Kết quả mong đợi:** lần 1 hiện 2 dòng (`tester_a`, `tester_b`); lần 2 hiện đúng 1 dòng `tester_b`; lần 3 hiện **Không có người dùng nào.**

---
## USER-03 Khóa và mở khóa (P1)
**Các bước**
1. Ở dòng `tester_b` bấm menu thao tác → **Khóa tài khoản**; hộp thoại **Khóa tài khoản người dùng?** nêu rõ người đó bị đăng xuất ngay; xác nhận.
2. Mở cửa sổ ẩn danh, đăng nhập `tester_b` bằng mật khẩu tạm.
3. Quay lại, bấm menu → **Mở khóa tài khoản**, xác nhận; đăng nhập lại ở cửa sổ ẩn danh.
**Kết quả mong đợi:** bước 1 hiện **Đã khóa** ở cột Trạng thái và thông báo **Đã khóa tài khoản**; bước 2 báo **Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên**; bước 3 hiện **Đã mở khóa tài khoản** và đăng nhập được.
**Đối chiếu khóa tức thì:** nếu `tester_b` đang đăng nhập ở một cửa sổ khác, sau khi khóa thì thao tác kế tiếp của họ bị đưa về trang đăng nhập.

---
## USER-04 Đặt lại mật khẩu (P1)
**Các bước:** ở dòng `tester_b` bấm menu → **Đặt lại mật khẩu**; xác nhận hộp thoại **Đặt lại mật khẩu?**; sao chép mật khẩu ở hộp thoại **Mật khẩu tạm thời**. Đăng nhập `tester_b` bằng mật khẩu mới đó.
**Kết quả mong đợi:** mật khẩu cũ không còn dùng được; mật khẩu tạm mới đăng nhập được và buộc **Đổi mật khẩu** (như AUTH-04); mật khẩu tạm chỉ hiện một lần.

---
## USER-05 Không để hệ thống mất quản trị viên cuối cùng (P1)
**Chuẩn bị:** chỉ có **một** tài khoản giữ vai trò **Administrator** đang hoạt động (kiểm tra: nhìn cột **Vai trò**). Nếu có hai (`admin` và `pwtest`), xem phần "Chuẩn bị" cuối ca.
**Các bước:** ở dòng của quản trị viên cuối cùng, bấm **Gán vai trò**, **bỏ chọn** vai trò **Administrator**, xác nhận.
**Kết quả mong đợi:** hộp thoại hiện cảnh báo **Cảnh báo: bạn đang bỏ chọn vai trò Quản trị viên...**; khi lưu hệ thống **từ chối** (báo lỗi, vai trò vẫn còn). Thử **Khóa tài khoản** và **Xóa người dùng** đối với quản trị viên cuối cùng: cũng bị từ chối.
**Chuẩn bị nếu có 2 quản trị viên:** tạm khóa/bỏ vai trò quản trị của tài khoản còn lại để chỉ còn `pwtest`, làm xong thì khôi phục.

---
## ROLE-01 Tạo vai trò và gán quyền theo từng nguồn dữ liệu (P1)
**Mục tiêu:** người dùng chỉ thấy và tra cứu được đúng các nguồn dữ liệu được cấp.
**Dữ liệu nhập:** Mã vai trò `TESTER_VIEW`; Tên vai trò `Người thử`; Mô tả `Chỉ tra cứu SimpleAPI`.
**Các bước**
1. **Quản trị → Vai trò & quyền** → **Tạo vai trò** → điền 3 ô → xác nhận (hiện **Đã tạo vai trò**).
2. Ở dòng `TESTER_VIEW` bấm **Phân quyền** (hộp thoại **Phân quyền — Người thử**).
3. Nhóm **Quyền truy cập API tra cứu**: tích **chỉ** hai quyền `api:sa_search_get` và `api:sa_images` (nếu ô hiển thị theo tên nguồn thì chọn **SimpleAPI GET /search** và **SimpleAPI ảnh**). Nhóm **Quyền chức năng**: tích `history:view_own` (xem lịch sử của mình).
4. Bấm **Lưu phân quyền** (hiện **Đã cập nhật phân quyền**).
5. **Quản trị → Người dùng** → dòng `tester_a` → **Gán vai trò** → chọn `Người thử` → lưu (**Đã cập nhật vai trò**). Cột **Vai trò** của `tester_a` hiện `Người thử`.
6. Mở cửa sổ ẩn danh, đăng nhập `tester_a` (mật khẩu theo AUTH-05: `TesterA-Matkhau-2026`).
**Kết quả mong đợi:** *Đúng khi:*
- Ba vai trò có sẵn trong hệ thống là **Administrator**, **Auditor**, **Operator** (mã `ADMIN`, `AUDITOR`, `OPERATOR`).
- Menu **Tra cứu** của `tester_a` chỉ có **SimpleAPI GET /search** và **SimpleAPI ảnh**; **không** có các nguồn khác; **không** có mục **Quản trị**; có **Lịch sử tra cứu**.
- Tra cứu `SimpleAPI GET /search` với `param1=val1`, `count=2` ra 2 bản ghi.
**Đối chiếu (đã thử: người dùng chưa có vai trò nào nhận `[]` ở `/datasources` và 403 ở mọi API quản trị và `/history`):** `curl -s -H "authorization: Bearer $(login tester_a 'TesterA-Matkhau-2026')" localhost:3000/api/v1/datasources | node -pe 'JSON.parse(require("fs").readFileSync(0)).map(d=>d.code).join(",")'` ra đúng `SA_SEARCH_GET,SA_IMAGES` (thứ tự bất kỳ).

---
## ROLE-02 Quyền đổi có hiệu lực (P1)
**Các bước:** `tester_a` đang đăng nhập ở cửa sổ ẩn danh. Ở cửa sổ của `pwtest` vào **Phân quyền** của `Người thử` **bỏ tích** `api:sa_images`, **Lưu phân quyền**. Ở cửa sổ `tester_a` tải lại trang (F5) rồi mở nguồn **SimpleAPI ảnh** (gõ `http://localhost:5173/tra-cuu/SA_IMAGES`).
**Kết quả mong đợi:** menu của `tester_a` không còn mục ảnh; mở trực tiếp URL ra trang **Không có quyền truy cập** kèm **Bạn không có quyền truy cập chức năng này...**.
**Đối chiếu:** `q` bằng token của `tester_a` gọi `SA_IMAGES` ra HTTP 403 `FORBIDDEN_API`:
```bash
TA=$(login tester_a 'TesterA-Matkhau-2026'); curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/v1/query/SA_IMAGES -H "authorization: Bearer $TA" -H 'content-type: application/json' -d '{"params":{"count":1}}'   # 403
```
Khôi phục: tích lại `api:sa_images` và lưu.

---
## ROLE-03 Truy cập trái quyền, người thường không vào khu quản trị (P1)
**Các bước:** ở cửa sổ `tester_a` gõ các địa chỉ: `/quan-tri/nguoi-dung`, `/quan-tri/nguon-du-lieu`, `/quan-tri/danh-muc`, `/quan-tri/thong-ke`.
**Kết quả mong đợi:** mỗi địa chỉ đều ra **Không có quyền truy cập**; không có dữ liệu quản trị nào hiện ra, kể cả thoáng qua.
**Đối chiếu API (bắt buộc, vì chặn ở giao diện chưa đủ):**
```bash
for p in admin/users admin/roles admin/datasources admin/dictionaries; do curl -s -o /dev/null -w "$p %{http_code}\n" localhost:3000/api/v1/$p -H "authorization: Bearer $TA"; done    # cả 4 dòng là 403
```

---
## ROLE-04 Không xóa vai trò hệ thống, vai trò đang gán (P2)
**Các bước:** ở trang **Vai trò & quyền** nhìn cột **Hệ thống**; thử xóa vai trò có **Hệ thống = Có**; thử xóa `Người thử` khi `tester_a` còn giữ.
**Kết quả mong đợi:** vai trò hệ thống không có/ không dùng được nút xóa (**Vai trò hệ thống không thể xóa**); xóa vai trò đang được gán hiện cảnh báo người dùng sẽ mất vai trò hoặc bị chặn theo hộp thoại **Xóa vai trò?** (ghi lại hành vi thực tế vào biên bản nếu khác).

---
## ROLE-05 Nguồn dữ liệu mới: quản trị viên tự có quyền, vai trò khác phải tích tay (P1)
**Các bước:** tạo nguồn dữ liệu mới `PERM_PROBE` theo ca DS-01 (file 03). Sau khi lưu: (1) với `pwtest` kiểm tra nguồn hiện trong menu **Tra cứu**; (2) với `tester_a` kiểm tra **không** hiện; (3) vào **Phân quyền** của `Người thử`, thấy dòng mới `api:perm_probe` **chưa tích**.
**Kết quả mong đợi:** đúng như (1), (2), (3). Tích rồi lưu thì `tester_a` thấy nguồn sau khi tải lại trang.

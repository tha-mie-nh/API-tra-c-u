# 01. Xác thực và phiên đăng nhập (AUTH)

Chuẩn bị: [00-chuan-bi-moi-truong-va-cach-quan-sat.md](00-chuan-bi-moi-truong-va-cach-quan-sat.md). Một số ca cần tài khoản thường `tester_a`: **tạo trước** theo ca USER-01 (file 02), mật khẩu tạm lấy từ hộp thoại hiện ra.

---
## AUTH-01 Đăng nhập đúng (P1)
**Mục tiêu:** đăng nhập đúng tài khoản vào được hệ thống; không lưu token ở nơi trình duyệt tự đọc được; không có 401 thừa.
**Chuẩn bị:** đã đăng xuất (hoặc mở cửa sổ ẩn danh). Mở F12 → **Network** (Fetch/XHR, tích **Preserve log**) và **Console**.
**Dữ liệu nhập:** Tên đăng nhập `pwtest`, Mật khẩu `xZfMt6jrzaAWADDmEJEG`.
**Các bước**
1. Mở http://localhost:5173/login.
2. Gõ `pwtest` vào ô **Tên đăng nhập**, gõ mật khẩu vào ô **Mật khẩu**.
3. Bấm nút **Đăng nhập** (khi đang gửi nút đổi thành **Đang đăng nhập...**).
**Kết quả mong đợi**
- *Nhìn ở đâu → Đúng khi:*
  - Màn hình: chuyển sang trang chủ `/`, banner hiện **Xin chào, PW Test**, góc phải trên có avatar "TE" và tên **PW Test**.
  - Network: đúng thứ tự `POST /api/v1/auth/login` = **200**, rồi `GET /api/v1/auth/me` = **200**. **Không có** dòng nào mã 401.
  - Console: **trống** (không có dòng `[api]`).
  - F12 → **Application** → **Local Storage** và **Session Storage** của `localhost:5173`: **không có** access token. Mục **Cookies** có `refresh_token` với cột **HttpOnly = ✓**, **Path = /api/v1/auth**, **SameSite = Strict**.
**Đối chiếu:** `grep -E "auth/login" /tmp/dev2.log | tail -2` thấy cặp dòng `--> POST /api/v1/auth/login ... requestId=web-...` và `<-- POST /api/v1/auth/login 200 ...ms`.
**Thử thêm (xấu):** để trống cả hai ô rồi bấm **Đăng nhập** → hiện **Vui lòng nhập tên đăng nhập** và **Vui lòng nhập mật khẩu**, Network **không** có request `login`.

---
## AUTH-02 Sai mật khẩu (P1)
**Mục tiêu:** thông báo chung, không tiết lộ tài khoản có tồn tại hay không.
**Dữ liệu nhập:** (a) `pwtest` / `sai-mat-khau-123`; (b) `khong_ton_tai` / `sai-mat-khau-123`.
**Các bước:** ở `/login` nhập (a) rồi bấm **Đăng nhập**; xóa form, nhập (b) rồi bấm **Đăng nhập**.
**Kết quả mong đợi:** *Nhìn ở đâu → Đúng khi:*
- Màn hình: cả (a) và (b) cùng hiện đúng dòng đỏ **Sai tên đăng nhập hoặc mật khẩu**, ở lại trang đăng nhập.
- Network: `POST /auth/login` = **401** ở cả hai, **Response** có `error.code = "INVALID_CREDENTIALS"` (hai lần giống hệt nhau, không có chữ "không tồn tại").
**Đối chiếu:** `curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"username":"khong_ton_tai","password":"x"}'` ra cùng mã lỗi `INVALID_CREDENTIALS`.

---
## AUTH-03 Khóa tài khoản sau 5 lần sai (P1)
**Mục tiêu:** sai liên tiếp 5 lần thì khóa 15 phút; đúng mật khẩu vẫn không vào được khi đang khóa.
**Chuẩn bị:** dùng tài khoản thử `tester_a` (không dùng `pwtest`/`admin` để khỏi bị khóa chính mình).
**Các bước**
1. Ở `/login` nhập `tester_a` với mật khẩu sai `sai-1`, bấm **Đăng nhập**; lặp lại với `sai-2`, `sai-3`, `sai-4` (4 lần đầu vẫn báo **Sai tên đăng nhập hoặc mật khẩu**).
2. Lần thứ 5 nhập `sai-5`.
3. Nhập **đúng** mật khẩu của `tester_a`, bấm **Đăng nhập**.
**Kết quả mong đợi**
- Sau lần sai thứ 5 (hoặc lần ngay sau): hiện **Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên**.
- Bước 3: **vẫn** báo khóa dù mật khẩu đúng. Network `POST /auth/login` mã 401/403 với `error.code = "ACCOUNT_LOCKED"`.
- Ở `pwtest` mở **Quản trị → Người dùng**: dòng `tester_a` có trạng thái **Đã khóa**.
**Đối chiếu:** `docker exec app-tra-cuu-du-lieu-postgres-1 psql -U app_user -d app_tra_cuu -c "select username,status,failed_login_count,locked_until from app.users where username='tester_a'"` thấy `locked_until` cách hiện tại khoảng 15 phút.
**Mở khóa để test tiếp:** ở **Người dùng** bấm menu thao tác của `tester_a` → **Mở khóa tài khoản** → xác nhận.

---
## AUTH-04 Bắt buộc đổi mật khẩu lần đầu (P1)
**Mục tiêu:** tài khoản mới/được đặt lại phải đổi mật khẩu trước khi dùng.
**Chuẩn bị:** `tester_a` vừa được tạo (ca USER-01), mật khẩu tạm = `<MẬT KHẨU TẠM>`.
**Các bước**
1. Đăng nhập `tester_a` / `<MẬT KHẨU TẠM>`.
2. Thử gõ trực tiếp http://localhost:5173/ và http://localhost:5173/lich-su vào thanh địa chỉ.
**Kết quả mong đợi:** *Đúng khi:*
- Sau bước 1 tự chuyển tới trang **Đổi mật khẩu** (tiêu đề **Đổi mật khẩu**, phụ đề **Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống**).
- Bước 2: bị đưa lại về trang đổi mật khẩu, không xem được trang khác.
**Đối chiếu:** trong Network `GET /api/v1/auth/me` trả `mustChangePassword: true`.

---
## AUTH-05 Đổi mật khẩu thành công (P1)
**Dữ liệu nhập:** Mật khẩu hiện tại = `<MẬT KHẨU TẠM>`; Mật khẩu mới = `TesterA-Matkhau-2026`; Xác nhận = `TesterA-Matkhau-2026`.
**Các bước:** tại trang **Đổi mật khẩu** (sau AUTH-04) điền 3 ô rồi bấm **Đổi mật khẩu**.
**Kết quả mong đợi:** thông báo **Đổi mật khẩu thành công**; vào được trang chủ; đăng xuất rồi đăng nhập lại bằng `TesterA-Matkhau-2026` thành công; mật khẩu tạm **không** còn dùng được (báo **Sai tên đăng nhập hoặc mật khẩu**).
**Thử thêm (xấu), mỗi lần ở form đổi mật khẩu:**
| Nhập | Kết quả đúng |
|---|---|
| Mật khẩu mới `ngan123` (8 ký tự) | **Mật khẩu phải có ít nhất 12 ký tự**, không gửi request |
| Xác nhận khác mật khẩu mới | **Mật khẩu xác nhận không khớp** |
| Mật khẩu hiện tại sai | báo lỗi từ máy chủ, mật khẩu không đổi |
| Mật khẩu mới trùng mật khẩu hiện tại | bị từ chối (xem phản hồi trong Network) |

---
## AUTH-06 Tải lại trang giữ phiên, không có 401 thừa (P1)
**Mục tiêu:** F5 vẫn đăng nhập; chuỗi gọi đúng, gọn.
**Chuẩn bị:** đã đăng nhập `pwtest`, đang ở trang chủ. F12 → Network, **Preserve log** tắt, xóa log (biểu tượng cấm).
**Các bước:** bấm **F5**.
**Kết quả mong đợi:** *Network → Đúng khi:* thứ tự `POST /auth/refresh` = **200** rồi `GET /auth/me` = **200** rồi các `GET /datasources`. **Không có** dòng mã 401. Giao diện không nháy về trang đăng nhập.
**Đối chiếu (chống tái phát lỗi cũ):** bản cũ có dòng `GET /auth/me` = 401 ngay sau `refresh`. Nếu thấy dòng đó là **hỏng**.

---
## AUTH-07 Token hết hạn giữa chừng, tự làm mới (P1)
**Mục tiêu:** token truy cập (15 phút) hết hạn thì thao tác kế tiếp vẫn thành công, không phải bấm lại.
**Cách làm nhanh (không phải đợi 15 phút):** làm token hỏng bằng cách đăng nhập bằng `curl` lấy token cũ không cần; thay vào đó dùng **chặn request trong DevTools**:
1. Đăng nhập `pwtest`, vào **Tra cứu** → **SimpleAPI GET /search**.
2. F12 → Network, tích **Preserve log**. Gõ `param1` = `val1`, `count` = `2`.
3. Trong tab **Console** gõ (để mô phỏng token sai ở lần gửi kế tiếp):
   ```js
   // chỉ để thử: ghi đè fetch, lần gọi /query đầu tiên trả 401 như thể token hết hạn
   const f=window.fetch; let n=0; window.fetch=(u,o)=> (String(u).includes('/query/') && n++===0) ? Promise.resolve(new Response(JSON.stringify({error:{code:'UNAUTHENTICATED',message:'x',requestId:'t'}}),{status:401})) : f(u,o);
   ```
4. Bấm **Tra cứu** **một lần**.
**Kết quả mong đợi:** *Đúng khi:* dữ liệu 2 bản ghi hiện ngay (không phải bấm lần hai). Console có đúng 1 dòng `[api] 401 on POST /query/SA_SEARCH_GET requestId=web-... — refreshing session and retrying once`. Network: `POST /auth/refresh` = 200 rồi `POST /query/SA_SEARCH_GET` = 200.
(Tải lại trang F5 để gỡ đoạn ghi đè sau khi thử.)

---
## AUTH-08 Đăng xuất (P1)
**Các bước:** bấm tên **PW Test** ở góc phải → **Đăng xuất**; sau đó bấm nút **Back** của trình duyệt.
**Kết quả mong đợi:** thông báo **Đã đăng xuất**, về `/login`. Bấm Back không vào lại được trang trong (bị đưa về đăng nhập). Network có `POST /auth/logout` = 200. Cookie `refresh_token` bị xóa hoặc hết hạn.
**Đối chiếu:** `curl -s -X POST localhost:3000/api/v1/auth/refresh --cookie "refresh_token=<giá trị cũ>"` trả 401.

---
## AUTH-09 Thu hồi phiên ở tab khác (P2)
**Các bước:** mở hai tab cùng đăng nhập `pwtest`. Ở tab 1 bấm **Đăng xuất**. Sang tab 2 bấm vào **Lịch sử tra cứu**.
**Kết quả mong đợi:** tab 2 không treo; trong vài giây về trang đăng nhập (access token còn hạn cho tới khi hết 15 phút, nhưng lần làm mới sau đó bị từ chối); Console có `[api] session refresh failed ... signing out` khi gặp 401.

---
## AUTH-10 Quên mật khẩu (P2)
**Dữ liệu nhập:** (a) `tester_a`; (b) `khong_ton_tai`.
**Các bước:** ở `/login` bấm **Quên mật khẩu?**, nhập (a) rồi bấm **Gửi yêu cầu**; lặp với (b).
**Kết quả mong đợi:** cả hai đều hiện **Nếu tài khoản tồn tại, yêu cầu đặt lại mật khẩu đã được ghi nhận...** (không tiết lộ tài khoản có tồn tại). Với `pwtest`: **Quản trị → Người dùng** có mục **Yêu cầu đặt lại mật khẩu** chứa dòng `tester_a`, không có dòng `khong_ton_tai`.

---
## AUTH-11 Giới hạn đăng nhập theo IP (P1, chỉ kiểm bằng dòng lệnh)
**Mục tiêu:** nhiều lần đăng nhập sai liên tục bị chặn `429`, thông báo đúng.
**Các bước:** chạy
```bash
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"username":"khong_ton_tai","password":"x"}'; done; echo
```
**Kết quả mong đợi:** các mã đầu là `401`, sau khoảng 50 lượt (theo `LOGIN_THROTTLE_LIMIT=50`) chuyển sang `429`. Ở giao diện lúc đó hiện **Bạn đã thử đăng nhập quá nhiều lần, vui lòng thử lại sau**. Chờ 60 giây thì đăng nhập lại bình thường.
**Lưu ý triển khai thật:** mặc định ứng dụng là 10 lượt/phút/IP, và sau nginx mọi người cùng một IP nếu chưa đặt `TRUST_PROXY`. Xem [báo cáo kiểm thử tải](../ket-qua-kiem-thu-tai-api-v13.md).

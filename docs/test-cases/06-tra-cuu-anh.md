# 06. Tra cứu ảnh (IMG)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md); `simple-api` đang chạy (cổng 8000). Nguồn dùng: `SA_IMAGES` ("SimpleAPI ảnh", loại **Hình ảnh**, xác thực header `X-Access-Key` lấy từ biến `SIMPLE_IMAGES_API_KEY=my-secret-key`) và `SA_IMAGES_BADKEY` (cùng cấu hình nhưng khóa sai). Dữ liệu: 3 ảnh `id` 1, 2, 3 (bảng 3.2 file 00). Mở **Tra cứu** → **SimpleAPI ảnh**.

**Cách đọc kết quả:** mỗi ảnh là một **nhóm** (thẻ) vì định danh là `id`: tiêu đề thẻ = `description`, dòng phụ = `id`; trong thẻ là lưới ảnh nhỏ, dưới mỗi ảnh là ngày `create_at` đã quy giờ VN. Thứ tự thẻ: mới nhất trước theo `create_at` → **Photo 03 sample** (id 3, `13-12-2024 02:48`, vì 19:48 UTC cộng 7 giờ sang ngày hôm sau), **Sample 02 image** (id 2, `05-11-2024 10:41`), **Photo sample 01** (id 1, `15-10-2024 16:43`).

---
## IMG-01 Ảnh hiện thumbnail, id kiểu số (P1, lỗi đã báo)
**Mục tiêu:** upstream trả `id` kiểu **số** và ảnh nằm trong `image_base64` vẫn hiện ảnh, không báo "không có ảnh khớp".
**Dữ liệu nhập:** **Số ảnh** = `3`.
**Các bước:** điền, bấm **Tra cứu**.
**Kết quả mong đợi:** *Đúng khi:*
- Hiện **3 thẻ** theo thứ tự trên, mỗi thẻ có **1 ảnh thumbnail** nhìn thấy được (không phải ô trống, không phải biểu tượng ảnh vỡ).
- **Không** có dòng **Không có ảnh nào khớp với điều kiện tra cứu.** ở thẻ nào.
- Network: `POST /query/SA_IMAGES` = 200; **Response** có `groups` gồm 3 phần tử, mỗi bản ghi có `image_base64` dài (hàng chục nghìn ký tự) và `id` là số (`1`, `2`, `3`).
**Đối chiếu:** `curl -s "localhost:8000/images?count=3" -H "X-Access-Key: my-secret-key" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.map(x=>x.id+":"+typeof x.id+":"+x.image_base64.length).join(" ")'` ra `1:number:45164 2:number:103904 3:number:105500`.
**Thử thêm:** **Số ảnh** = `1` → 1 thẻ (ảnh id 1, vì upstream trả phần tử đầu); **Số ảnh** = `5` → vẫn chỉ **3** thẻ (upstream chỉ có 3 ảnh); **Số ảnh** = `6` → lỗi dưới ô **Số ảnh phải nhỏ hơn hoặc bằng 5**.

---
## IMG-02 Bấm ảnh để xem lớn: chiếm khoảng 80% chiều cao màn hình (P1, lỗi đã báo)
**Mục tiêu:** ảnh phóng to đủ lớn, không nhỏ theo kích thước gốc.
**Chuẩn bị:** cửa sổ trình duyệt kích thước **1440 x 900** (hoặc dùng F12 → biểu tượng thiết bị → *Dimensions* nhập 1440 x 900), tra cứu **Số ảnh** = `3`.
**Các bước:** bấm vào thumbnail **Sample 02 image**.
**Kết quả mong đợi:** *Đúng khi:* hiện lớp nền đen toàn màn hình; ảnh nằm giữa và có **chiều cao khoảng 80% chiều cao cửa sổ** (khoảng **720 px** ở cửa sổ cao 900 px) và chiều rộng không vượt 80% chiều rộng cửa sổ.
**Đối chiếu bằng số:** F12 → **Elements**, chọn thẻ `<img>` trong lớp lightbox (class `yarl__...`), xem **Computed** → `height` ≈ 720px khi cửa sổ cao 900. Hoặc chạy trong **Console**: `const i=document.querySelector('.yarl__container img'); (i.getBoundingClientRect().height/innerHeight*100).toFixed(0)+'%'` ra **80%** (±1).
**Thử thêm (các kích thước khác):** cửa sổ 1280 x 720 → ảnh cao khoảng 576 px; cửa sổ 1024 x 768 → khoảng 614 px; ảnh **không bao giờ** rộng hơn 80% chiều rộng (cửa sổ hẹp, ví dụ 600 x 900, ảnh bị giới hạn theo chiều rộng 480 px và vẫn giữ tỉ lệ, không méo).

---
## IMG-03 Thông tin dưới ảnh lớn và điều hướng (P2)
**Các bước:** ở lightbox của IMG-02 nhìn phần chữ dưới ảnh; bấm phím **→** (hoặc mũi tên phải trên màn hình); bấm **←**; bấm **Esc**; mở lại và bấm nút **✕** góc phải.
**Kết quả mong đợi:** dưới ảnh có các cặp: `ID`, `Mô tả`, `Tạo lúc` (ngày đã định dạng `05-11-2024 10:41`), **không** hiện chuỗi base64 thô; **→/←** chuyển giữa các ảnh của **cùng thẻ** (mỗi thẻ có đúng 1 ảnh nên mũi tên có thể không chuyển; ghi lại hành vi thực tế); **Esc** và **✕** đóng lightbox, quay về danh sách đúng vị trí.

---
## IMG-04 Ảnh khi nguồn loại Thông tin có cột ảnh (P2)
**Mục tiêu:** ảnh base64 trong bảng thông tin cũng bấm phóng 80%.
**Chuẩn bị:** **Sửa** `SA_IMAGES`, đổi **Loại** từ **Hình ảnh** sang **Thông tin**, **Lưu**.
**Các bước:** tra cứu `Số ảnh` = `1`; bấm ảnh nhỏ trong thẻ.
**Kết quả mong đợi:** ảnh hiện thành khối vuông cạnh khoảng 256 px trong thẻ; bấm vào mở hộp thoại tiêu đề **Ảnh** với ảnh cao khoảng **78%** chiều cao cửa sổ. Khôi phục **Loại** = **Hình ảnh**.

---
## IMG-05 Không có ảnh khớp: thông báo đúng chỗ (P1)
**Mục tiêu:** thông báo "không có ảnh" chỉ hiện khi **thật sự** không có ảnh.
**Các bước:** **Sửa** `SA_IMAGES`; ở output đổi dòng `image_base64` từ kiểu **Hình ảnh** sang **Chuỗi**; **Lưu**; tra cứu `Số ảnh` = `2`.
**Kết quả mong đợi:** hiện 2 thẻ nhưng trong mỗi thẻ là dòng **Không có ảnh nào khớp với điều kiện tra cứu.** (vì không còn cột nào là ảnh). Đổi lại kiểu **Hình ảnh** → ảnh hiện trở lại (đây chính là phép đối chứng với IMG-01).

---
## IMG-06 Khóa truy cập sai (P1, lỗi đã báo)
**Mục tiêu:** upstream trả 401 thì người dùng được báo rõ nguyên nhân, lịch sử ghi đúng mã.
**Các bước:** mở **SimpleAPI ảnh (sai khóa)**, **Số ảnh** = `1`, **Tra cứu**.
**Kết quả mong đợi:** *Đúng khi:*
- Màn hình: khung lỗi **Nguồn dữ liệu từ chối khóa truy cập (API key sai hoặc hết hạn). Vui lòng báo quản trị viên kiểm tra cấu hình.** (không phải "tạm thời không phản hồi").
- Network: `POST /query/SA_IMAGES_BADKEY` = **502**, **Response**: `{"error":{"code":"UPSTREAM_UNAUTHORIZED","message":"Upstream rejected the access key (HTTP 401)",...}}`.
- Bạn **không bị đăng xuất** (vẫn ở trang, menu còn nguyên): chứng tỏ giao diện không nhầm với phiên hết hạn.
- **Lịch sử tra cứu**: dòng mới nhất của `SA_IMAGES_BADKEY` có **Trạng thái = Thất bại**; **Xem chi tiết** → **Thông báo lỗi** nêu 401.
**Đối chiếu:** `grep "SA_IMAGES_BADKEY" /tmp/dev2.log | grep -E "upstream <--|query failed" | tail -2` có `upstream <-- 401` rồi `query failed ... code=UPSTREAM_UNAUTHORIZED`.
**Thử thêm:** gọi thẳng `curl -s "localhost:8000/images?count=1"` (không khóa) → 401 `{"error":"Unauthorized","message":"Invalid or missing key"}`, để thấy đúng đây là phản hồi của upstream.

---
## IMG-07 Tra cứu ảnh nhiều lần liên tiếp, lần nào cũng hiện (P1, lỗi "lúc được lúc không")
**Mục tiêu:** loại trừ lỗi chập chờn.
**Các bước (giao diện):** ở **SimpleAPI ảnh**, **Số ảnh** = `3`, bấm **Tra cứu** liên tiếp **20 lần** (mỗi lần đợi ảnh hiện rồi bấm tiếp; có thể bấm nhanh).
**Kết quả mong đợi:** cả 20 lần đều hiện 3 thẻ có ảnh, không lần nào báo **Không có ảnh nào khớp**, không lần nào thiếu ảnh.
**Đối chiếu tự động (nhanh):**
```bash
TOKEN=$(login pwtest 'xZfMt6jrzaAWADDmEJEG'); ok=0; for i in $(seq 1 20); do n=$(q SA_IMAGES '{"params":{"count":3}}' | node -pe 'const r=JSON.parse(require("fs").readFileSync(0));r.groups?r.groups.filter(g=>g.records[0].image_base64).length:-1'); [ "$n" = "3" ] && ok=$((ok+1)); done; echo "$ok/20 lần có đủ 3 ảnh"
```
Phải ra **20/20**. Nếu có lần thiếu: ghi lại `requestId` và tìm log `grep "requestId=<id>" /tmp/dev2.log` để biết upstream trả gì.
**Ghi chú:** đây là ca mình **chưa tái hiện được** hiện tượng "lúc được lúc không" của người dùng; nếu ca này ra 20/20 mà người dùng vẫn gặp lỗi, thu thập response mẫu của lần lỗi (Network → Response) để xác định.

---
## IMG-08 Ảnh nhiều lần tải và không rò rỉ (P3)
**Các bước:** tra cứu `Số ảnh` = `3` rồi mở/đóng lightbox 10 lần, theo dõi F12 → tab **Memory** (hoặc **Performance monitor**) bộ nhớ JS.
**Kết quả mong đợi:** bộ nhớ không tăng liên tục theo mỗi lần mở (dao động nhỏ, không tăng đều trên 100 MB sau 10 lần). Không có lỗi đỏ ở Console.

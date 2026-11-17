# 05. Tra cứu thông tin và ngày giờ (Q, DT)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md). Dùng các nguồn sẵn có `SA_SEARCH_GET` ("SimpleAPI GET /search") và `SA_SEARCH_POST` ("SimpleAPI POST /search (param + body)"). Dữ liệu gốc: bảng 3.1 ở file 00. Mở **Tra cứu** → tên nguồn.

**Cách đọc kết quả tra cứu:** mỗi **nhóm** là một thẻ: tiêu đề = trường làm tiêu đề (ở đây `name`), dòng phụ = định danh (`id`). Trong thẻ, mỗi bản ghi là một mục của đường thời gian: dòng đầu in đậm là **giá trị mốc thời gian** (`update_at`), bên dưới là các cặp `Nhãn: giá trị`.

**Giá trị đã quy đổi sang giờ Việt Nam (UTC+7)** mà bạn phải thấy với `SA_SEARCH_GET` (mặc định: giờ của API được hiểu là UTC):
| id | Mốc thời gian (Cập nhật) | Tạo lúc | Xóa lúc |
|---|---|---|---|
| 1 item-one | `10-12-2025 19:31` | `15-10-2024 16:43` | `13-12-2025` |
| 2 item-two | `12-09-2025 22:12` | `05-11-2024 10:41` | `10-11-2025` |
| 6 item-six | `08-11-2025 06:51` | `18-07-2024 00:26` | `22-11-2025` |
(Cách tính: `12:31:06` UTC cộng 7 giờ = `19:31`; `23:51:14` UTC cộng 7 giờ sang ngày hôm sau = `08-11-2025 06:51`.)

---
## Q-01 GET search, response là mảng ở gốc (P1)
**Dữ liệu nhập:** **Param 1** = `val1`; **Số lượng** = `2`.
**Các bước:** mở **SimpleAPI GET /search**, điền hai ô, bấm **Tra cứu** (nút đổi thành **Đang tra cứu...** trong lúc chờ).
**Kết quả mong đợi:** *Đúng khi:*
- Có **2 nhóm**: **item-one** (dòng phụ `1`) rồi **item-two** (dòng phụ `2`).
- Nhóm item-one hiện dòng đầu `10-12-2025 19:31` và các cặp: `ID: 1`, `Tên: item-one`, `Mô tả: first sample item (param1=val1)`, `Loại: Nam`, `Tạo lúc: 15-10-2024 16:43`, `Xóa lúc: 13-12-2025`.
- Network: `POST /api/v1/query/SA_SEARCH_GET` = **200**, **Payload** là `{"params":{"param1":"val1","count":2}}` (số 2 là **số**, không phải chuỗi `"2"`).
**Đối chiếu:** `grep "ds=SA_SEARCH_GET" /tmp/dev2.log | tail -2` có `upstream --> GET http://localhost:8000/search?param1=val1&count=2`; và `curl -s "localhost:8000/search?param1=val1&count=2"` trả cùng 2 phần tử.
**Thử thêm (xấu):**
| Nhập | Kết quả đúng |
|---|---|
| **Số lượng** = `0` | dưới ô hiện **Số lượng phải lớn hơn hoặc bằng 1**, **không** gửi request |
| **Số lượng** = `99` | **Số lượng phải nhỏ hơn hoặc bằng 50** |
| **Số lượng** = `abc` | ô số không nhận chữ (hoặc báo lỗi), không gửi request |
| để trống cả hai ô | tra cứu được, `count` không gửi nên upstream trả **10** phần tử → 10 nhóm |
| bấm **Đặt lại** | cả hai ô trống |

---
## Q-02 POST search: query và body cùng lúc (P1)
**Dữ liệu nhập:** **Param 1** = `val1`; **Số lượng** = `2`; **Ghi chú (body)** = `xin chao`.
**Các bước:** mở **SimpleAPI POST /search (param + body)**, điền, **Tra cứu**.
**Kết quả mong đợi:** *Đúng khi:* nhóm đầu **item-one** có `Mô tả` chứa **`body={'param1': 'val1', 'count': 2, 'note': 'xin chao'}`** — nghĩa là cả ba trường đã đi vào **body** (nguồn mẫu này không khai báo `in: query` cho `param1`/`count`, nên theo mặc định POST chúng nằm trong body). **Số lượng = 2 không có tác dụng giới hạn** vì `count` nằm trong body chứ không phải query, nên upstream trả **10** nhóm.
**Đối chiếu:** log `upstream --> POST http://localhost:8000/search` (URL **không** có `?count=`).
**Biến thể có chủ ý (kiểm chứng `in: query`):** **Sửa** nguồn, mở rộng hai input `param1` và `count`, đặt **Gửi lên API thật bằng** = **Query param**, **Lưu**; tra cứu lại cùng dữ liệu: nay chỉ còn **2** nhóm, mô tả của item-one chứa `(param1=val1, body={'note': 'xin chao'})` (hoặc tương đương: `param1` nằm ở query, body chỉ còn `note`); log `upstream --> POST http://localhost:8000/search?param1=val1&count=2`. Khôi phục sau khi thử.

---
## Q-03 Kiểm tra dữ liệu nhập: bắt buộc, kiểu, độ dài, mẫu (P1)
**Mục tiêu:** lỗi hiện đúng ô, tiếng Việt, và **không** gửi request lên máy chủ khi đã sai ở form.
**Chuẩn bị:** tạo nguồn thử có ràng buộc: **Sửa** `T_ECHO_POST` (file 03): input `soHC` tích **Bắt buộc**, mở rộng đặt *Độ dài tối thiểu* `3`, *Độ dài tối đa* `8`, *Mẫu regex (pattern)* `^[A-Z0-9]+$`.
| Nhập vào **Số hộ chiếu** | Bấm Tra cứu thì thấy |
|---|---|
| (để trống) | **Số hộ chiếu là bắt buộc** |
| `AB` | **Số hộ chiếu phải có ít nhất 3 ký tự** |
| `ABCDEFGHI` (9 ký tự) | **Số hộ chiếu không được quá 8 ký tự** |
| `abc123` (chữ thường) | **Số hộ chiếu không đúng định dạng** |
| `ABC123` | tra cứu thành công |
**Đối chiếu:** với 4 dòng đầu Network **không** có request `POST /query/T_ECHO_POST`; dòng cuối có. Gọi bỏ qua form: `q T_ECHO_POST '{"params":{"soHC":"ab"}}'` (hàm `q` ở file 00) trả `VALIDATION_ERROR` có `details` nêu đúng ô — nghĩa là **máy chủ cũng kiểm tra lại**, không tin giao diện.

---
## Q-04 Điều kiện "ít nhất một trong" / "đủ một nhóm" (P1)
**Chuẩn bị:** **Sửa** `T_ECHO_POST`; ở khối **Các trường đầu vào (input)** mục **Bắt buộc có ít nhất một trong các trường (atLeastOneOf)** tích `soHC` và `donVi`; bỏ **Bắt buộc** ở `soHC`.
**Các bước:** tra cứu khi để trống cả hai; rồi chỉ điền `Đơn vị` = `P01`.
**Kết quả mong đợi:** lần 1 báo lỗi nhóm điều kiện (không gửi); lần 2 tra cứu thành công. Khôi phục cấu hình sau khi thử.

---
## Q-05 Ô nhập theo từng kiểu (P2)
**Các bước:** trên `T_ECHO_POST` (hoặc nguồn thử) thêm input: `ngay` kiểu **Ngày**, `gio` kiểu **Ngày giờ**, `dongY` kiểu **Đúng/Sai**, `loai` kiểu **Danh sách chọn** (3 lựa chọn nhập tay), `so` kiểu **Số**; mở form tra cứu.
**Kết quả mong đợi:** ô **Ngày** có gợi ý `dd-mm-yyyy` (gõ `12-05-1999` được chấp nhận, gõ `31-02-1999` bị từ chối); ô **Ngày giờ** là bộ chọn ngày giờ của trình duyệt; **Đúng/Sai** là ô tích; **Danh sách chọn** có **— Không chọn —** đứng đầu khi không bắt buộc; ô **Số** chỉ nhận số. Giá trị gửi đi (Network → Payload): ngày dạng `1999-05-12`, ngày giờ dạng `2026-01-15T09:30:00`, đúng/sai `true`/`false`, số là kiểu số.

---
## Q-06 Không có kết quả (P1)
**Các bước:** làm theo dòng 3 của DS-15 (đặt tạm `recordsPath` của `SA_SEARCH_POST` thành `ketqua`), tra cứu.
**Kết quả mong đợi:** hiện **Không tìm thấy kết quả phù hợp với điều kiện tra cứu.**, không có dấu đỏ hay thông báo lỗi, không có khung nhóm trống. Network `query` = 200. Khôi phục `recordsPath` = `data`.

---
## Q-07 Giới hạn bản ghi và phân trang (P1)
**Chuẩn bị:** **Sửa** `SA_SEARCH_POST`: **Số bản ghi tối đa** `7`, **Số bản ghi mỗi trang** `4` → **Lưu**.
**Các bước:** tra cứu (để trống hai ô số; `Ghi chú` trống) → ghi nhận; bấm **Trang sau**; bấm **Trang trước**.
**Kết quả mong đợi:** *Đúng khi:*
- Ở đầu kết quả có thông báo **Kết quả đã được giới hạn ở 7 bản ghi. Hãy thu hẹp điều kiện tra cứu để xem đầy đủ.** (vì upstream có 10 phần tử, bị cắt còn 7).
- Phân trang: dòng chỉ báo hiện **Trang 1/2 — 7 bản ghi** (số sau dấu gạch là **tổng** số bản ghi sau khi cắt, không phải của trang); trang 1 có 4 nhóm; sau **Trang sau** hiện **Trang 2/2 — 7 bản ghi** với 3 nhóm; **Trang trước** về lại trang 1. Chỉ báo này **không hiện** khi chỉ có 1 trang.
- Mỗi lần chuyển trang là một request `POST /query/SA_SEARCH_POST` có `"page":2` trong Payload.
- Thứ tự nhóm giữ nguyên theo thứ tự thời gian giảm dần xuyên trang (trang 1 chứa 4 nhóm mới nhất trong 7 bản ghi đã cắt).
Khôi phục hai ô giới hạn về trống.

---
## Q-08 Giá trị thiếu hoặc null (P1)
**Các bước:** tra cứu `T_ECHO_POST` với chỉ `Số hộ chiếu`, **để trống** `Đơn vị`.
**Kết quả mong đợi:** dòng `Đơn vị:` hiển thị **`—`** (gạch dài), không để trống, không hiện `undefined`/`null`, không lỗi.

---
## Q-09 Dữ liệu có ký tự đặc biệt không chạy mã (P1)
**Các bước:** nhập `Số hộ chiếu` = `<img src=x onerror=alert(1)>` (đã tắt ràng buộc regex của Q-03) rồi tra cứu `T_ECHO_POST`.
**Kết quả mong đợi:** giá trị hiển thị **nguyên văn dưới dạng chữ** `<img src=x onerror=alert(1)>`; **không** hiện hộp thoại alert, không có hình ảnh vỡ. Mở F12 → Elements tìm chữ `onerror`: nó nằm trong **nội dung văn bản**, không phải thuộc tính của một thẻ `<img>` thật.

---
## DT-01 Sắp xếp theo thời gian giảm dần (P1)
**Dữ liệu nhập:** `SA_SEARCH_GET`, để trống hai ô (lấy cả 10 phần tử).
**Kết quả mong đợi:** thứ tự **nhóm từ trên xuống**: `item-one`, `item-six`, `item-nine`, `item-two`, `item-five`, `item-four`, `item-eight`, `item-three`, `item-seven`, `item-ten` (đã sắp theo `Cập nhật` giảm dần; **khác** thứ tự `id` 1..10 của upstream, nên đây là phép thử có ý nghĩa).
**Đối chiếu:** `curl -s "localhost:8000/search" | node -pe 'JSON.parse(require("fs").readFileSync(0)).map(x=>x.update_at.split("/").reverse().join("")+" "+x.name).sort().reverse().map(s=>s.split(" ").pop()).join(",")'` ra cùng thứ tự (ngày sắp theo năm-tháng-ngày, rồi đảo).
**Đảo chiều:** **Sửa** nguồn, **Thứ tự sắp xếp** = **Cũ nhất trước (asc)**, **Lưu**: thứ tự đảo ngược hoàn toàn (`item-ten` đầu tiên). Khôi phục desc.

---
## DT-02 Sắp xếp vẫn đúng khi trường khai báo là Chuỗi (P1, lỗi đã báo)
**Các bước:** **Sửa** `SA_SEARCH_GET`; ở output `update_at` đổi kiểu từ **Ngày giờ** sang **Chuỗi** (giữ nguyên, ô format tự ẩn nhưng giá trị vẫn được giữ), **Lưu**; tra cứu lấy 10 phần tử.
**Kết quả mong đợi:** **thứ tự nhóm vẫn như DT-01**; mốc thời gian lúc này hiện **nguyên văn** `10/12/2025 12:31:06` (vì kiểu Chuỗi không định dạng lại). Đặt lại kiểu **Ngày giờ** rồi lưu.

---
## DT-03 Định dạng nguồn sai: hiện nguyên văn, không gạch `-` (P1, lỗi đã báo)
**Các bước:** **Sửa** `SA_SEARCH_GET`; ở `update_at` mở rộng dòng, ô **Đọc từ API thật theo (format)** chọn `YYYY-MM-DD` (cố tình sai); **Lưu**; tra cứu 10 phần tử.
**Kết quả mong đợi:** mốc thời gian mỗi nhóm hiện **nguyên văn** `10/12/2025 12:31:06` ... (không phải `—`); **không** có giá trị nào bị hiểu thành ngày sai kiểu tháng/ngày của Mỹ; thứ tự nhóm **không còn** theo thời gian (rơi về thứ tự upstream `item-one`, `item-two`, ... vì không đọc được ngày). Khôi phục `DD/MM/YYYY HH:mm:ss`.

---
## DT-04 Nhiều dạng ngày được chấp nhận cùng lúc (P1)
**Các bước:** ở `update_at` đặt format `DD/MM/YYYY|DD/MM/YYYY HH:mm|DD/MM/YYYY HH:mm:ss` (gõ qua **Tùy chỉnh…**), **Lưu**; tra cứu.
**Kết quả mong đợi:** kết quả **giống hệt** DT-01 (bản ghi `HH:mm:ss` khớp dạng thứ ba; hai dạng đầu không khớp thì bị bỏ qua). Các mốc vẫn là `10-12-2025 19:31`...

---
## DT-05 Múi giờ của API thật và múi giờ hiển thị (P1)
**Các bước và mong đợi** (mỗi lần: **Sửa** `SA_SEARCH_GET` → output `update_at` → đặt như bảng → **Lưu** → tra cứu `count=2` → xem mốc của **item-one**):
| Múi giờ của API thật | Múi giờ hiển thị | Mốc item-one phải hiện |
|---|---|---|
| Mặc định (UTC) | Mặc định (Asia/Ho_Chi_Minh) | `10-12-2025 19:31` |
| **Asia/Ho_Chi_Minh** | Mặc định | `10-12-2025 12:31` (giờ API đã là giờ VN nên không lệch) |
| Mặc định (UTC) | **UTC** | `10-12-2025 12:31` |
| **Asia/Ho_Chi_Minh** | **UTC** | `10-12-2025 05:31` |
| Mặc định | **America/New_York** (gõ ở Tùy chỉnh…) | `10-12-2025 07:31` (UTC−5 mùa đông) |
**Đối chiếu độc lập:** `date -u -d '2025-12-10 12:31:06 UTC' +%s` rồi chuyển múi giờ bằng `TZ=America/New_York date -d @<số giây>` ra `07:31`.
Khôi phục về mặc định.

---
## DT-06 Chọn định dạng hiển thị (mẫu và tùy chỉnh) (P1)
**Các bước:** **Sửa** `SA_SEARCH_GET`, output `update_at`, ô **Hiển thị cho người dùng (displayFormat)**:
| Chọn | Mốc item-one |
|---|---|
| `DD/MM/YYYY HH:mm:ss` | `10/12/2025 19:31:06` |
| `HH:mm DD/MM/YYYY` | `19:31 10/12/2025` |
| `YYYY-MM-DD` | `2025-12-10` |
| **Tùy chỉnh…** gõ `HH:mm DD.MM.YYYY` | `19:31 10.12.2025` |
**Kết quả mong đợi:** với mỗi lựa chọn, dưới ô hiện dòng **Ví dụ:** đúng mẫu (ví dụ chọn `DD/MM/YYYY HH:mm` thấy `Ví dụ: 15/01/2026 09:30`); **Lưu** thành công không báo lỗi; tra cứu hiển thị đúng như bảng. Mở lại form thấy lựa chọn/chuỗi tùy chỉnh còn nguyên.
**Đối chiếu:** `show_ds SA_SEARCH_GET` ở trường `update_at` có `"displayFormat": "HH:mm DD.MM.YYYY"`.
**Thử thêm:** ô **Tùy chỉnh…** để trống rồi **Lưu**: trở về hiển thị mặc định `DD-MM-YYYY HH:mm` và **không** lưu khóa rỗng.

---
## DT-07 Định dạng ngày của trường **đầu vào** (P1, lỗi đã báo)
**Chuẩn bị:** **Sửa** `T_ECHO_POST`: thêm input `ngaySinh`, label `Ngày sinh`, kiểu **Ngày**, **Gửi lên API thật bằng** = **Query param**. Dòng này có ô **Định dạng gửi lên API thật (format)** hiện ngay dưới hàng (không cần mở rộng).
**Các bước:** lần lượt đặt ô đó và tra cứu `Số hộ chiếu`=`B777`, `Ngày sinh`=`12-05-1999` (gõ theo dạng `dd-mm-yyyy` trong ô), rồi đọc log echo:
| Định dạng gửi | Phải thấy ở `docker logs --tail 2 echo-mock` |
|---|---|
| **Mặc định (YYYY-MM-DD)** | `ngaySinh=1999-05-12` |
| `DD/MM/YYYY` | `ngaySinh=12%2F05%2F1999` (`%2F` là dấu `/`) |
| `YYYYMMDD` | `ngaySinh=19990512` |
| **Tùy chỉnh…** gõ `DD.MM.YYYY` | `ngaySinh=12.05.1999` |
**Kết quả mong đợi:** mỗi dòng đúng bảng; **Lưu** thành công mọi trường hợp (kể cả tùy chỉnh); dưới ô chọn có **Ví dụ:** tương ứng. Giá trị người dùng **thấy và gõ** ở form tra cứu không đổi (vẫn `dd-mm-yyyy`).
**Thử thêm:** đổi trường thành **Ngày giờ** với format `DD/MM/YYYY HH:mm:ss`, chọn `2026-01-15 09:30` ở bộ chọn: gửi `15%2F01%2F2026%2009%3A30%3A00`.

---
## DT-08 Ngày không tồn tại hoặc dạng lạ (P2)
**Các bước:** dùng echo để đưa giá trị lạ vào: gọi `T_ECHO_POST` với trường output kiểu **Ngày** `donVi` (đặt tạm `donVi` thành kiểu **Ngày**, format `DD/MM/YYYY`) và nhập `Đơn vị` = `31/02/2026`, rồi `abc`.
**Kết quả mong đợi:** cả hai hiện **nguyên văn** (`31/02/2026`, `abc`), không có ngày giả như `03-03-2026`, không lỗi trang.

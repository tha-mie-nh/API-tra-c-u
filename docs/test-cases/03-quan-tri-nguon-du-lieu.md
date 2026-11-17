# 03. Quản trị nguồn dữ liệu (DS)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md) (nhớ mục **6. Sao lưu** trước khi bắt đầu, vì các ca sửa `config/config.json` thật). Đăng nhập `pwtest`. Vào **Quản trị → Nguồn dữ liệu** (`/quan-tri/nguon-du-lieu`).

Bố cục form **Tạo nguồn dữ liệu mới / Sửa nguồn dữ liệu** (hộp thoại rộng, hai cột):
- **Cột trái:** Sao chép từ nguồn có sẵn · Mã · Tên hiển thị · Mô tả · Loại · Kích hoạt · Loại kết nối · **Base URL** · **Đường dẫn (path)** · **Phương thức** · Timeout (ms) · Headers tĩnh · **Query param tĩnh** · **Xác thực** · Số bản ghi tối đa / mỗi trang.
- **Cột phải:** **Các trường đầu vào (input)** (mỗi trường một dòng: *Key theo API (name)*, *Tên hiển thị (label)*, kiểu, *Bắt buộc*, mũi tên mở rộng) · **Các trường đầu ra (output)** (mỗi dòng: name, label, kiểu) · timestampField / identityField / Thứ tự sắp xếp · **labelField** · recordsPath / totalPath / requestIdPath.
- Nút **Hủy** và **Lưu** ở cuối.

Hai nguồn "thử" dùng cho các ca: trỏ vào **API giả echo** (`http://localhost:4200`) vì nó phản chiếu đúng request nhận được, và vào **simple-api**.

---
## DS-01 Tạo nguồn GET trỏ vào simple-api (P1)
**Mục tiêu:** tạo nguồn dữ liệu đầy đủ bằng giao diện, thấy nó ở menu và trong `config.json`.
**Dữ liệu nhập**
| Ô | Giá trị |
|---|---|
| Mã | `T_GET` |
| Tên hiển thị | `Thử GET search` |
| Loại | **Thông tin** |
| Kích hoạt | bật |
| Loại kết nối | **HTTP (API thật)** |
| Base URL | chọn trong danh sách **`SIMPLE_API_BASE_URL`** |
| Đường dẫn (path) | `/search` |
| Phương thức | **GET** |
| Input 1 | name `param1`, label `Tham số 1`, kiểu **Chuỗi** |
| Input 2 | name `count`, label `Số lượng`, kiểu **Số**; mở rộng dòng, *Giá trị tối thiểu* `1`, *Giá trị tối đa* `10` |
| Output (7 dòng) | `id`/`ID`/Chuỗi · `name`/`Tên`/Chuỗi · `description`/`Mô tả`/Chuỗi · `type`/`Loại`/Chuỗi · `create_at`/`Tạo lúc`/**Ngày giờ** · `update_at`/`Cập nhật`/**Ngày giờ** (ô *Đọc từ API thật theo (format)* gõ chọn `DD/MM/YYYY HH:mm:ss`) · `delete_at`/`Xóa lúc`/**Ngày** (format `DD/MM/YYYY`) |
| Trường mốc thời gian | `update_at` |
| Trường định danh | `id` |
| Thứ tự sắp xếp | **Mới nhất trước (desc)** |
| Trường làm tiêu đề (labelField) | `name` |
| recordsPath | **để trống** (response của GET /search là mảng ở gốc) |
**Các bước:** bấm **Tạo nguồn dữ liệu**, điền như bảng (dùng **Thêm trường** để thêm dòng), bấm **Lưu**.
**Kết quả mong đợi**
- Thông báo **Đã tạo nguồn dữ liệu**; hộp thoại đóng; bảng có dòng `T_GET`, cột **Kết nối** `http`, **Bật/Tắt** đang bật, **Biến môi trường** `Đã có biến môi trường`.
- Menu trái mục **Tra cứu** có **Thử GET search** (tải lại trang nếu chưa thấy).
- Mở **Thử GET search**, nhập `Tham số 1` = `val1`, `Số lượng` = `2`, bấm **Tra cứu**: hiện 2 nhóm kết quả, tiêu đề **item-one** (kèm dòng phụ `1`) và **item-two** (kèm `2`).
**Đối chiếu:** `show_ds T_GET` thấy `"baseUrl": "${SIMPLE_API_BASE_URL}"`, `"method": "GET"`, `"recordsPath"` **không có**, `"labelField": "name"`, `"permissionCode": "api:t_get"`. Log `grep "ds=T_GET" /tmp/dev2.log | tail -3` thấy `upstream --> GET http://localhost:8000/search?param1=val1&count=2`.
**Thử thêm (xấu):**
| Nhập | Kết quả đúng |
|---|---|
| Mã `t_get` (chữ thường) | **Mã chỉ gồm chữ in hoa, số và gạch dưới, bắt đầu bằng chữ** |
| Mã `T_GET` lần nữa | **Mã nguồn dữ liệu đã tồn tại** |
| Bỏ trống Tên hiển thị | **Vui lòng nhập tên** |
| Bỏ trống Đường dẫn | **Vui lòng nhập đường dẫn** |
| Chọn Trường mốc thời gian là `— Chưa chọn —` | **Vui lòng chọn trường mốc thời gian** |
| Nhập *Số bản ghi tối đa* mà để trống *mỗi trang* | **Phải nhập đủ cả số bản ghi tối đa và số bản ghi mỗi trang, hoặc để trống cả hai** |

---
## DS-02 POST: một số trường gửi bằng query, một trường gửi bằng body (P1)
**Mục tiêu:** chứng minh từng trường đi đúng chỗ (query hay body) tới upstream.
**Dữ liệu nhập:** Mã `T_ECHO_POST`; Tên `Thử POST query+body`; Loại **Thông tin**; **Base URL**: chọn **✏️ Tự viết URL khác** rồi gõ `http://localhost:4200`; path `/find`; phương thức **POST**.
Input (mỗi dòng bấm mũi tên **Mở rộng** để thấy ô **Gửi lên API thật bằng**):
| name | label | kiểu | Gửi lên API thật bằng |
|---|---|---|---|
| `soHC` | `Số hộ chiếu` | Chuỗi, **Bắt buộc** | **Query param (?khoa=giatri)** |
| `donVi` | `Đơn vị` | Chuỗi | **Body JSON** |
Output (4 dòng): `cccd`/`CCCD`/Chuỗi · `ho_ten`/`Họ tên`/Chuỗi · `soHC`/`Số hộ chiếu`/Chuỗi · `donVi`/`Đơn vị`/Chuỗi; mốc thời gian `cccd` (tạm), định danh `cccd`, labelField `ho_ten`; **recordsPath** `data.items`.
**Các bước:** tạo nguồn như trên, **Lưu**. Mở **Thử POST query+body**, nhập `Số hộ chiếu` = `B777`, `Đơn vị` = `P01`, **Tra cứu**.
**Kết quả mong đợi:** có 1 nhóm kết quả tiêu đề **Nguyễn Văn Mock**, trong đó **Số hộ chiếu: B777** và **Đơn vị: P01**.
**Đối chiếu (quan trọng nhất ca này):** `docker logs --tail 4 echo-mock` có dòng
`--> POST /find?soHC=B777 requestId=web-... body={"donVi":"P01"}`
Nghĩa là: `soHC` nằm ở **URL (query)**, `donVi` nằm ở **body JSON**, và **không** có `soHC` trong body. `requestId` ở dòng này trùng với `X-Request-Id` của request `query` trong Network (upstream nhận được mã truy vết).

---
## DS-03 POST chỉ bằng param, không có body (P1)
**Các bước:** **Sửa** `T_ECHO_POST` → mở rộng dòng input `donVi` → đổi **Gửi lên API thật bằng** thành **Query param (?khoa=giatri)** → **Lưu**. Tra cứu lại `soHC`=`B777`, `donVi`=`P01`.
**Kết quả mong đợi:** log echo `--> POST /find?soHC=B777&donVi=P01 requestId=... body=-` (**`body=-`** nghĩa là không gửi body). Kết quả giao diện vẫn có **Đơn vị: P01**.
**Đối chiếu:** `show_ds T_ECHO_POST` thấy cả hai input đều có `"in": "query"`.

---
## DS-04 GET mà đòi gửi bằng body bị từ chối (P1)
**Các bước:** **Sửa** `T_ECHO_POST`; đổi **Phương thức** thành **GET**; mở rộng input `soHC`, đặt **Gửi lên API thật bằng** = **Body JSON**; **Lưu**.
**Kết quả mong đợi:** **không** lưu; hiện thông báo nổi bắt đầu bằng **Không lưu được:** nêu `has in=body but the transport method is GET`; lỗi cũng hiện inline ở cuối form. `config.json` **không** đổi (`show_ds T_ECHO_POST` vẫn `POST`).
Bấm **Hủy** để thoát.

---
## DS-05 Query param tĩnh và header tĩnh (P1)
**Các bước:** **Sửa** `T_ECHO_POST` (đưa phương thức về **POST**, hai input về **Query param**). Ở **Query param tĩnh (gắn vào URL)** bấm **Thêm query param**: tên `tab`, giá trị `1`. Ở **Headers tĩnh** bấm **Thêm header**: tên `X-ReqType`, giá trị `LOOKUP`. **Lưu**. Tra cứu `B777`.
**Kết quả mong đợi:**
- Log echo (`docker logs --tail 3 echo-mock`): `--> POST /find?tab=1&soHC=B777&donVi=P01 requestId=web-... body=-` (query tĩnh `tab=1` có mặt).
- Header tĩnh: vào **Lịch sử tra cứu**, dòng mới nhất của `T_ECHO_POST` → **Xem chi tiết** → tab **Đầu vào** → khung **API này gửi tới upstream** → mục **Header** có `x-reqtype: LOOKUP` (và `x-request-id: web-...`, `content-type`). (Ca HIS-04 giải thích chi tiết màn hình này.)
**Đối chiếu độc lập:** `curl -s -X POST "localhost:4200/find?tab=1&x=1" -H 'X-ReqType: LOOKUP' -d '{}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).echo.headers["x-reqtype"]'` in `LOOKUP` (chỉ để thấy echo phản chiếu header ra sao).

---
## DS-06 Khóa xác thực không bao giờ hiện ra (P1)
**Mục tiêu:** giá trị `my-secret-key` không lộ ở giao diện hay API quản trị.
**Các bước:** **Sửa** `SA_IMAGES`; ở khung **Xác thực (header chứa bí mật ...)** nhìn nội dung; mở Network, lọc `admin/datasources`, mở dòng response.
**Kết quả mong đợi:** khung xác thực hiện **API key qua header**, **Tên header xác thực** `X-Access-Key`, **Biến môi trường chứa API key** `SIMPLE_IMAGES_API_KEY` và dòng giải thích "backend sẽ gửi header `X-Access-Key` với giá trị thật lấy từ biến `SIMPLE_IMAGES_API_KEY` (không hiện giá trị thật ở đây)".
**Đối chiếu:** `curl -s localhost:3000/api/v1/admin/datasources/SA_IMAGES -H "authorization: Bearer $TOKEN" | grep -c "my-secret-key"` ra **0**; `grep -c "my-secret-key" config/config.json` ra **0**; `curl -s localhost:3000/api/v1/admin/datasources/env-refs -H "authorization: Bearer $TOKEN"` chỉ có **tên** biến, không có giá trị.

---
## DS-07 URL lấy từ biến môi trường hiển thị đúng (P1)
**Các bước:** **Sửa** `SA_SEARCH_GET`, nhìn ô **Base URL**.
**Kết quả mong đợi:** ô chọn hiện **SIMPLE_API_BASE_URL** (tên biến, không có `${}`, không phải ô trống). Bên dưới **không** có dòng đỏ cảnh báo thiếu biến.
**Đối chiếu:** `show_ds SA_SEARCH_GET` có `"baseUrl": "${SIMPLE_API_BASE_URL}"`.
**Thử thêm:** nếu **tạm xóa** dòng `SIMPLE_API_BASE_URL` khỏi `.env` rồi chạy lại `pnpm dev`, mở lại form: hiện dòng đỏ **Biến môi trường chứa URL chưa được đặt trên server API...**, bảng ngoài ghi **Chưa có biến môi trường...**, giá trị `${SIMPLE_API_BASE_URL}` vẫn còn nguyên trong `config.json`. (Khôi phục `.env` xong thì chạy lại `pnpm dev`.)

---
## DS-08 Chọn URL biến môi trường rồi sửa thành URL tự viết (P1, lỗi đã báo)
**Mục tiêu:** đổi từ URL biến sang URL gõ tay phải làm được.
**Các bước**
1. **Sửa** `T_GET`. Ô **Base URL** đang hiện **SIMPLE_API_BASE_URL**.
2. Bấm ô đó, chọn **✏️ Tự viết URL khác**.
3. Quan sát ngay dưới ô chọn.
4. Xóa nội dung, gõ `http://localhost:4200`.
5. Bấm **Lưu**, rồi mở lại **Sửa** `T_GET`.
**Kết quả mong đợi:** *Đúng khi:* (3) hiện một ô nhập chữ bên dưới, **đang chứa** `${SIMPLE_API_BASE_URL}` (giữ giá trị cũ để sửa); ô chọn hiện **✏️ Tự viết URL khác**. (4) gõ được. (5) lưu thành công; mở lại thấy ô chọn ở **✏️ Tự viết URL khác** với giá trị `http://localhost:4200`. `show_ds T_GET` có `"baseUrl": "http://localhost:4200"`.
Làm tương tự để **đổi lại** về biến: chọn **SIMPLE_API_BASE_URL** trong danh sách → lưu → `show_ds T_GET` có `${SIMPLE_API_BASE_URL}`.
**Thử thêm:** ở ô **Xác thực** của nguồn ảnh, chọn **✏️ Tên biến khác (chưa có trong danh sách)**: ô nhập hiện ra và gõ được (ví dụ `SOME_SERVICE_API_KEY`); tên không đúng quy tắc `*_API_KEY` bị từ chối khi lưu.

---
## DS-09 Xóa cache rồi mở form: không mất URL và biến API key (P1, lỗi đã báo)
**Mục tiêu:** khi danh sách biến môi trường tải chậm hơn lúc mở form, các giá trị vẫn đúng.
**Các bước**
1. Mở **cửa sổ ẩn danh** (cache và cookie trống), đăng nhập `pwtest`.
2. F12 → **Network** → tích **Disable cache**; ở thanh bên cạnh chọn giả lập mạng chậm **Slow 3G** (mục *No throttling* → *Slow 3G*).
3. Vào **Quản trị → Nguồn dữ liệu**, ở dòng `SA_IMAGES` bấm **⋯** → **Sửa**, **không đợi** hộp thoại tải xong mà nhìn ngay.
4. Đợi khoảng 10 giây cho đến khi mạng xong, đọc lại.
**Kết quả mong đợi:** *Đúng khi:* ô **Base URL** luôn là **SIMPLE_API_BASE_URL** (không bao giờ là `${}` hay trống) và ô **Biến môi trường chứa API key** luôn là **SIMPLE_IMAGES_API_KEY** (không bao giờ trống).
**Đối chiếu:** bấm **Hủy** rồi `show_ds SA_IMAGES` — cấu hình không đổi (ca này không lưu).
**Bản chất lỗi cũ:** bản cũ ghi `${}` vào Base URL và xóa tên biến khi danh sách biến đến muộn; nếu thấy lại hiện tượng đó là **hỏng**.

---
## DS-10 Mở form rồi Lưu mà không đổi gì: cấu hình giữ nguyên (P1)
**Mục tiêu:** Lưu không làm mất khóa nào (trước đây mất `labelField`, `format`).
**Các bước**
1. `cp config/config.json /tmp/ds10-before.json`.
2. **Sửa** `SA_SEARCH_POST` → **không đổi gì** → **Lưu** (hiện **Đã cập nhật nguồn dữ liệu**).
3. So sánh:
```bash
node -e 'const a=require("/tmp/ds10-before.json"),b=require("./config/config.json");const f=c=>JSON.stringify(c.datasources.find(d=>d.code==="SA_SEARCH_POST"),null,1);console.log(f(a)===f(b)?"GIỐNG HỆT":"KHÁC")'
```
**Kết quả mong đợi:** in **`GIỐNG HỆT`**. (Nếu `KHÁC`, chạy `diff <(node -e ... a) <(node -e ... b)` để thấy khóa nào mất; riêng việc rút gọn `"required": false` có thể xuất hiện ở lần lưu đầu tiên, các khóa `labelField`, `format`, `in`, `recordsPath` **không được** mất.)

---
## DS-11 Trường làm tiêu đề nhóm kết quả (P1)
**Các bước:** **Sửa** `SA_SEARCH_GET`; kéo xuống phần dưới cột phải, ô **Trường làm tiêu đề nhóm kết quả (labelField)** đang là `name`. Đổi sang `description`, **Lưu**. Tra cứu `param1=val1`, `count=2`.
**Kết quả mong đợi:** tiêu đề nhóm đầu tiên là **first sample item (param1=val1)** (giá trị của `description`), không còn **item-one**; dòng phụ bên dưới tiêu đề là `1` (định danh). Chọn lại `name` → trở về **item-one**. Chọn **Mặc định (fullName nếu có, không thì trường định danh)** → tiêu đề là `1`, `2` (định danh), vì nguồn này không có trường `fullName`.
**Đối chiếu:** `show_ds SA_SEARCH_GET` có `"labelField": "description"` hoặc **không có** khóa này khi chọn Mặc định.

---
## DS-12 Mọi khóa mới đều lưu được, không bị "must NOT have additional properties" (P1)
**Mục tiêu:** chứng minh schema nằm trong image/mã nguồn thắng schema cũ trong thư mục config.
**Các bước (bản dev dùng schema của repo; kiểm bản đóng gói ở file 09, ca CFG-01)**
1. **Sửa** `SA_SEARCH_GET`. Đặt: labelField `name`; ở output `update_at` chọn *Hiển thị cho người dùng (displayFormat)* `DD/MM/YYYY HH:mm`, *Múi giờ của API thật (sourceTimeZone)* `Asia/Ho_Chi_Minh`, *Múi giờ hiển thị (displayTimeZone)* `UTC`; ở input `count` đặt **Gửi lên API thật bằng** = **Query param**; thêm **Query param tĩnh** `tab`=`1`.
2. **Lưu**.
**Kết quả mong đợi:** lưu **thành công** (**Đã cập nhật nguồn dữ liệu**), **không** có dòng đỏ `must NOT have additional properties`. `show_ds SA_SEARCH_GET` có đủ `displayFormat`, `sourceTimeZone`, `displayTimeZone`, `in`, `queryParams`, `labelField`.
Khôi phục: `cp /tmp/config.before-test.json config/config.json` rồi reload (mục 6 file 00).

---
## DS-13 Lưu bị từ chối thì báo rõ, không im lặng (P1)
**Mục tiêu:** khi máy chủ từ chối, người dùng thấy ngay ở chỗ dễ thấy.
**Các bước:** **Sửa** `T_GET`; ở output `update_at` đặt *Múi giờ hiển thị* chọn **Tùy chỉnh…** rồi gõ `Mars/Base`; kéo form lên **đầu** (cuộn lên) để nút **Lưu** nằm ở cuối còn lỗi ở xa; bấm **Lưu**.
**Kết quả mong đợi:** *Đúng khi:* xuất hiện **thông báo nổi** (toast) bắt đầu **Không lưu được:** nêu lỗi múi giờ không hợp lệ ("is not a valid IANA time zone"), **đồng thời** có lỗi chi tiết ở cuối form. Hộp thoại **không** đóng; `config.json` không đổi.
**Sửa lại:** đổi sang **Mặc định (Asia/Ho_Chi_Minh)**, **Lưu** thành công.

---
## DS-14 Bật/tắt và xóa nguồn dữ liệu (P1)
**Các bước:** (1) Ở bảng gạt công tắc **Bật/Tắt** của `T_GET` sang tắt (hiện **Đã cập nhật trạng thái bật/tắt**). Kiểm tra menu **Tra cứu** và gõ `http://localhost:5173/tra-cuu/T_GET`. (2) Bật lại. (3) **⋯** → **Xóa**, hộp thoại **Xóa nguồn dữ liệu?** nêu "...sẽ bị xóa khỏi config.json. Quyền và lịch sử tra cứu liên quan vẫn được giữ lại.", xác nhận.
**Kết quả mong đợi:** (1) biến mất khỏi menu; mở trực tiếp URL ra **Không có quyền**/trang không tồn tại; `curl -X POST .../query/T_GET` ra lỗi không tìm thấy hoặc từ chối. (2) hiện lại. (3) hiện **Đã xóa nguồn dữ liệu**; `show_ds T_GET` không in gì; **Lịch sử tra cứu** (ca HIS-01) vẫn còn các lượt cũ của `T_GET`.

---
## DS-15 `recordsPath`: mảng ở gốc, bọc `data`, đặt sai (P1)
**Mục tiêu:** hiểu và kiểm chứng cách chỉ vị trí danh sách bản ghi.
| Nguồn | recordsPath | Kết quả tra cứu `count=2` |
|---|---|---|
| `SA_SEARCH_GET` (GET /search, mảng gốc) | **để trống** | 2 nhóm kết quả |
| `SA_SEARCH_POST` (POST /search, bọc `data`) | `data` | nhiều nhóm kết quả |
| `SA_SEARCH_POST` sửa recordsPath thành `ketqua` (sai) | `ketqua` | **Không tìm thấy kết quả phù hợp với điều kiện tra cứu.** (0 kết quả, không báo lỗi) |
| `SA_SEARCH_GET` sửa recordsPath thành `data` (sai vì response là mảng) | `data` | 0 kết quả |
**Các bước:** với mỗi dòng: **Sửa** nguồn → đặt recordsPath → **Lưu** → tra cứu. Nhìn nhãn dưới ô: **Đường dẫn danh sách bản ghi (recordsPath)** với gợi ý "Để TRỐNG nếu response là mảng ở gốc [...]".
**Đối chiếu:** `curl -s "localhost:8000/search?count=2"` (mảng gốc) và `curl -s -X POST "localhost:8000/search?count=2" -H 'content-type: application/json' -d '{}' | head -c 100` (bắt đầu `{"data":[`). Khôi phục recordsPath đúng sau mỗi dòng.

---
## DS-16 Tải lại cấu hình sau khi sửa tay `config.json` (P1)
**Các bước:** (1) Mở `config/config.json`, đổi `"name"` của `SA_SEARCH_GET` thành `SimpleAPI GET (sửa tay)`, lưu file. (2) Chưa tải lại: F5 trang web, xem menu. (3) Chạy `curl -s -X POST localhost:3000/api/v1/admin/datasources/reload -H "authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}\n"` (phải ra **201**). (4) F5 lại.
**Kết quả mong đợi:** (2) menu còn tên cũ hoặc đã mới tùy cơ chế theo dõi tệp; ghi lại hành vi thực tế; (4) menu và tiêu đề trang đổi thành **SimpleAPI GET (sửa tay)**, không cần khởi động lại.
**Thử thêm (xấu):** sửa tay làm hỏng JSON (xóa một dấu `}`) rồi gọi reload: nhận mã lỗi (không phải 201) kèm thông báo; menu **vẫn dùng cấu hình cũ**, ứng dụng không sập (`curl localhost:3000/api/v1/health` vẫn `ok`). Sửa lại JSON rồi reload thành công.

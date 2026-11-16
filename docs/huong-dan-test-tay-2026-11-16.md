# Hướng dẫn test tay các lỗi và yêu cầu đã xử lý (2026-11-16)

Mỗi mục có: **lỗi cũ**, **các bước**, **kết quả đúng**. Làm theo thứ tự hoặc chọn mục cần verify.

## 0. Chuẩn bị (môi trường dev, máy local)

```bash
docker compose up -d postgres                       # DB dev (cổng 55432)
node scripts/mock-upstream-server.js &              # upstream giả :4100
pnpm dev                                            # api :3000 + web :5173
```

- Đăng nhập admin: http://localhost:5173/login. Quên mật khẩu thì reset:
  `cd apps/api && npx dotenv -e ../../.env -- npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/reset-admin-password.ts admin`
  (in ra mật khẩu tạm, lần đăng nhập đầu phải đổi).
- Dữ liệu thử dùng nguồn **Tra cứu dữ liệu xuất nhập cảnh** (`IMMIGRATION_HISTORY`), nhập **Số hộ chiếu = `E00123456`**. Upstream giả trả 2 bản ghi: `15/01/2026 09:30:00` (Nhập/Xuất) và `02/02/2026 14:10:00`.
- Log backend xem ngay trên terminal chạy `pnpm dev`. Bản docker: `docker compose -f docker-compose.prod.yml logs -f api`.
- Sau khi test xong, nhớ khôi phục các thay đổi đã làm ở form admin (hoặc `git checkout config/config.json`).

---

## 1. Date không sort

**Lỗi cũ:** field ngày giờ dạng `DD/MM/YYYY HH:mm:ss` (hoặc field khai báo kiểu Chuỗi) không sắp xếp theo thời gian.

1. Vào **Tra cứu → Xuất nhập cảnh**, nhập `E00123456`, bấm Tra cứu.
2. Kết quả đúng: bản ghi **02-02-2026** nằm **trên** bản ghi 15-01-2026 (mới nhất trước).
3. Vào **Quản trị → Nguồn dữ liệu → Sửa** `IMMIGRATION_HISTORY`, dòng `ngayXuatNhap` ở phần *Trường đầu ra* đổi kiểu từ Ngày giờ thành **Chuỗi** (ô format tự ẩn nhưng giá trị vẫn được giữ), bấm Lưu.
4. Tra cứu lại: thứ tự vẫn đúng (02-02 trên 15-01).
5. Trả field về **Ngày giờ** và Lưu.

## 2. Datetime hiện `-` / sai format, và Lưu làm mất format

**Lỗi cũ:** (a) giá trị lệch format hiện dấu `-`; (b) mở form sửa rồi Lưu làm mất `format` trong config.

(a) Giá trị không parse được phải hiện **nguyên văn**, không phải `-`:
1. Sửa `IMMIGRATION_HISTORY`, dòng `ngayXuatNhap`: ô **Đọc từ API thật theo (format)** chọn `YYYY-MM-DD` (cố tình sai), Lưu.
2. Tra cứu `E00123456`: ngày hiện nguyên văn `15/01/2026 09:30:00`, **không** phải `—`.
3. Sửa lại format thành `DD/MM/YYYY HH:mm:ss`, Lưu. Tra cứu: hiện `15-01-2026 16:30` (xem mục 4 về giờ).

(b) Nhiều dạng trong một field: ô format chọn mẫu cuối trong danh sách (`DD/MM/YYYY HH:mm:ss|DD/MM/YYYY HH:mm|DD/MM/YYYY`), Lưu, tra cứu vẫn đúng.

(c) Không mất format khi Lưu: mở form sửa, **không đổi gì**, bấm Lưu, mở lại: các ô format/hiển thị vẫn còn; `git diff config/config.json` không mất khóa nào (trừ `"required": false` được rút gọn).

## 3. Chọn format hiển thị đầu ra, convert sang date

**Yêu cầu:** chỗ date phải cho chọn format output; chuyển chuỗi sang date.

1. Sửa `IMMIGRATION_HISTORY`. Dòng field kiểu **Ngày** hoặc **Ngày giờ** hiện ngay 4 ô chọn: *Đọc từ API thật theo (format)*, *Hiển thị cho người dùng (displayFormat)*, *Múi giờ của API thật*, *Múi giờ hiển thị*.
2. Ở `ngayXuatNhap`, ô *Hiển thị cho người dùng* chọn `HH:mm DD/MM/YYYY`. Dưới ô hiện ví dụ (`Ví dụ: 09:30 15/01/2026`). Chọn **Tùy chỉnh…** thì có ô gõ tay.
3. Lưu, tra cứu: ngày giờ hiện đúng dạng `HH:mm DD/MM/YYYY`. Lưu thành công (không báo lỗi cấu hình).
4. Chuyển chuỗi sang date: đổi kiểu một field **Chuỗi** thành **Ngày**, chọn format nguồn đúng, kết quả hiện theo format hiển thị.

## 4. Múi giờ

**Yêu cầu:** UTC cũng được, hoặc cài đặt múi giờ để frontend hiển thị theo đó.

1. Mặc định: upstream `15/01/2026 09:30:00` được hiểu là UTC, hiển thị giờ Việt Nam là **16:30**.
2. Sửa `ngayXuatNhap`, *Múi giờ của API thật* chọn **Asia/Ho_Chi_Minh**, Lưu, tra cứu: hiện **09:30** (đúng giờ gốc).
3. Đổi *Múi giờ hiển thị* thành **UTC**, Lưu, tra cứu: hiện **02:30**. Đổi lại **Mặc định**.
4. Nhập tên múi giờ sai (Tùy chỉnh…, ví dụ `Mars/Base`) rồi Lưu: phải **báo lỗi** "không phải múi giờ IANA hợp lệ", không lưu.

## 5. Log backend

**Yêu cầu:** log dạng `asctime - levelname - threadName - message`, mỗi request/response có log, log lỗi hệ thống, ghi vào file.

1. Bấm Tra cứu một lần. Trên terminal backend phải có chuỗi dòng dạng (giờ Việt Nam):
   ```
   2026-11-16 09:03:39,230 - INFO - HttpRequest - --> POST /api/v1/query/IMMIGRATION_HISTORY requestId=web-... ip=...
   2026-11-16 09:03:39,243 - INFO - QueryService - query start datasource=... user=... requestId=web-...
   2026-11-16 09:03:39,250 - INFO - HttpInfoAdapter - upstream --> POST http://localhost:4100/find ... attempt=1 requestId=web-...
   2026-11-16 09:03:39,260 - INFO - HttpInfoAdapter - upstream <-- 200 ... 10ms requestId=web-...
   2026-11-16 09:03:39,271 - INFO - QueryService - query ok datasource=... records=2 tookMs=13
   2026-11-16 09:03:39,272 - INFO - HttpRequest - <-- POST /api/v1/query/IMMIGRATION_HISTORY 200 42ms requestId=web-... user=...
   ```
   Cùng một `requestId` xuyên suốt các dòng. Không có body/CCCD trong log.
2. Gửi request sai (để trống form nếu bắt buộc, hoặc sai quyền): có dòng `WARN ... 422/403`, **không** có dòng ERROR.
3. Lỗi hệ thống: tắt mock upstream (`kill` tiến trình :4100), tra cứu: log có `ERROR - QueryService - query failed ... cause=...` kèm nguyên nhân thật.
4. Ghi file: chạy API với `LOG_FILE=/tmp/api-test.log` (hoặc bản docker prod: thư mục `./logs/api.log`); file có cùng các dòng trên.

## 6. API giả (docker image echo) và query param

**Yêu cầu:** giả lập một API docker trả về mặc định kèm query/body/param để trace transaction; hỗ trợ `tab=1` thành `?tab=1`.

1. Chạy image: `docker run --rm -p 4200:4200 gthanh/app_tra_cuu:mock-echo-v1` (log của nó hiện từng `-->`/`<--`).
2. Thử trực tiếp: `curl -s -X POST "localhost:4200/find?tab=1" -H 'X-Access-Key: bi-mat' -d '{"soHC":"B1"}'`. Kết quả có `data.items[0]` chứa `tab:"1"`, `soHC:"B1"` và khối `echo` với đúng method, URL (`/find?tab=1`), query, body; header `x-access-key` hiện `[redacted]`.
3. Tạo nguồn dữ liệu thử: **Quản trị → Nguồn dữ liệu → Thêm**:
   - Mã `ECHO_DEMO`, Loại Thông tin, Transport **HTTP**, URL nhập tay `http://localhost:4200`, Đường dẫn `/find`, Phương thức POST.
   - Mục **Query param tĩnh**: `tab` = `1`.
   - Đầu vào: `soHC` (Chuỗi, bắt buộc). Đầu ra: `cccd`, `ho_ten`, `soHC`, `tab` (Chuỗi), `thoi_diem` (Ngày giờ).
   - Trường định danh `cccd`, trường thời gian `thoi_diem`, `recordsPath` = `data.items`, `totalPath` = `total`, `requestIdPath` = `requestId`. Bật nguồn, Lưu.
4. Tra cứu `ECHO_DEMO` với `soHC=B999`. Màn kết quả hiện `B999` và `tab = 1`. Log của container echo: `--> POST /find?tab=1 requestId=web-... body={"soHC":"B999"}` (cùng `requestId` với log backend: app gửi `X-Request-Id` sang upstream).
5. Xóa nguồn `ECHO_DEMO` sau khi test.

## 7. Bấm tra cứu lần đầu lỗi, lần 2-3 mới được

**Nguyên nhân đã sửa:** `defaults.retry` trong config không được áp dụng; một lần upstream hỏng làm 502 ngay.

1. Chạy echo giả lập chập chờn: `docker run --rm -p 4200:4200 -e MOCK_ECHO_FAIL_FIRST=1 -e MOCK_ECHO_FAIL_MODE=503 gthanh/app_tra_cuu:mock-echo-v1` (hoặc `MOCK_ECHO_FAIL_MODE=reset` để cắt kết nối). Tạo/dùng nguồn `ECHO_DEMO` như mục 6, **không** khai báo retry.
2. Bấm Tra cứu **đúng một lần**. Kết quả đúng: **có dữ liệu ngay**, không báo lỗi. Log backend có:
   ```
   WARN - HttpInfoAdapter - ECHO_DEMO: retrying after attempt 1/3 failed ...
   INFO - HttpInfoAdapter - upstream --> POST ... attempt=2 ...
   INFO - QueryService - query ok ...
   ```
3. (So sánh với lỗi cũ: bản trước lần bấm đầu trả "Upstream datasource request failed" 502, bấm lại mới được.)
4. Token hết hạn giữa chừng (mặc định 15 phút): để tab nhàn rỗi quá hạn rồi bấm Tra cứu một lần. Kết quả đúng: vẫn có dữ liệu ngay lần đầu, console có `[api] 401 on POST ... refreshing session and retrying once`.

## 7b. Treo đến hết timeout rồi bấm lại mới được (kết nối chết khi nhàn rỗi)

**Lỗi cũ:** sau một lúc để trang nhàn rỗi, bấm Tra cứu thì treo rất lâu (không có dấu vết ở backend), hết timeout bấm lại 2-3 lần mới được.

1. Dựng bản web mới và chạy proxy mô phỏng kết nối bị bỏ âm thầm trước nó:
   ```bash
   cd apps/web && npx vite build && npx vite preview --port 4173 &       # web mới, /api đi tới API :3000
   node scripts/load-test/mock-blackhole-proxy.js --listen 8091 --target localhost:4173 --idle-ms 4000 &
   ```
2. Mở http://localhost:8091, đăng nhập, vào một trang tra cứu. **Để trang nhàn rỗi 12 giây**, rồi bấm Tra cứu **một lần**.
3. Kết quả đúng: có dữ liệu sau khoảng 2-3 giây (không treo). Console trình duyệt có `[api] N stale connection(s) did not answer after 12s idle — dropped, reconnecting`. Terminal của proxy có dòng `swallowed ... (request never answered)` cho các kết nối chết.
4. Đối chứng (bản cũ): chạy proxy trỏ vào stack dùng `web-v16` (`--target localhost:8081`, mở cổng proxy đó) và làm lại bước 2: bản cũ treo hàng chục giây và không có kết quả.

## 8. Mất URL và API key khi xóa cache

**Lỗi cũ:** form sửa nguồn dữ liệu hiện `${}` ở URL và mất tên biến API key.

1. Mở trình duyệt, F12 → **Network** → tick **Disable cache** → chọn throttling **Slow 3G** (để danh sách biến môi trường tải chậm hơn lúc mở form).
2. Ctrl+Shift+R, đăng nhập, vào **Quản trị → Nguồn dữ liệu** → menu `⋯` của `IMMIGRATION_HISTORY` → **Sửa**. Mở form **ngay lập tức**, đừng đợi.
3. Kết quả đúng: ô URL hiện **`IMMIGRATION_HISTORY_BASE_URL`**, ô biến API key hiện **`IMMIGRATION_HISTORY_API_KEY`**. Tuyệt đối không có `${}` và không có ô trống.
4. Bấm Lưu không đổi gì, mở lại: vẫn như trên. `git diff config/config.json`: `transport.baseUrl` vẫn là `${IMMIGRATION_HISTORY_BASE_URL}`.
5. Chọn "Nhập tay" ở ô URL: ô nhập hiện ra và giữ giá trị cũ, không bị xóa.
6. Nguồn dữ liệu có biến môi trường chưa đặt: dòng cảnh báo đỏ "Biến môi trường chứa URL/API key chưa được đặt trên server API".

## 9. Danh mục (enum dictionary)

**Yêu cầu:** mục cấu hình danh mục, bảng key-value, các mục trong config lấy từ đây.

1. Menu trái **Quản trị → Danh mục** (`/quan-tri/danh-muc`). Nhập tên `GENDER` (chữ hoa) → dấu `+`. Bảng key-value: thêm `M` = `Nam`, `F` = `Nữ`. **Lưu**. Danh mục xuất hiện bên trái với số dòng.
2. Tên sai (chữ thường/ký tự lạ) bị báo lỗi; key trùng nhau bị báo lỗi, nút Lưu bị khóa.
3. Dùng trong nguồn dữ liệu: **Sửa** `IMMIGRATION_HISTORY`. Ở **đầu vào** `gioiTinh` (kiểu Danh sách chọn): mở rộng dòng, ô **Danh mục** chọn `GENDER` (danh sách nhập tay biến mất). Lưu.
4. Vào lại **Danh mục**: `GENDER` ghi "Đang được dùng bởi: IMMIGRATION_HISTORY.gioiTinh (đầu vào)". Thử **Xóa danh mục** `GENDER`: bị chặn với thông báo đang được dùng.
5. Sửa danh mục: đổi nhãn `Nam` thành `Nam giới`, Lưu. Vào trang tra cứu xuất nhập cảnh (tải lại trang): ô Giới tính hiện `Nam giới` — **không cần restart** hay sửa file.
6. Trả lại: gỡ chọn danh mục ở field (về "Nhập tay") rồi xóa danh mục `GENDER`.

## 10. Chỉ map một lần (key theo API)

**Yêu cầu:** `ngaySinh → Ngày sinh`, không map qua key trung gian của frontend.

1. Sửa `IMMIGRATION_HISTORY`: ở **Đầu vào**, mỗi dòng có ô **Key theo API (name)** = `soHC`, `hoTen`, `ngaySinh`, `gioiTinh` và ô **Tên hiển thị (label)** = "Số hộ chiếu", "Họ và tên", "Ngày sinh"... Không còn ô `mapTo`/`from` ở dòng chính.
2. Tra cứu nhập Số hộ chiếu: ở log backend của upstream giả `[mock-upstream] POST /find ...` body gửi đi có khóa `soHC` (đúng key API).
3. `config/config.json` (xem bằng `git diff` hoặc mở file): field có dạng `{ "name": "ngaySinh", "label": "Ngày sinh", ... }`, không có `mapTo`/`from`.
4. Config cũ vẫn chạy: lấy file cũ có `mapTo`/`from` đặt vào chạy thử, vẫn tra cứu bình thường. Chuyển bằng script: `node scripts/migrate-config-single-key.js <file> --write`.

## 11. Trace FE ↔ BE

**Yêu cầu:** backend log kỹ để trace transaction; frontend chỉ cần warn/error.

1. Mở F12 → **Console**. Bấm Tra cứu với dữ liệu hợp lệ: console **không** in log thường (frontend im lặng khi thành công).
2. Gây lỗi: tắt backend (Ctrl+C `pnpm dev` phần api) rồi bấm Tra cứu. Console có `[api] network error POST /query/... requestId=web-xxxxxxxx...`. Bật lại backend; request ở thời điểm tắt không có dòng nào trong log backend (đúng: request không tới được server).
3. Gây 422 (bỏ trống ô bắt buộc nếu form không chặn, hoặc gọi sai): console có `[api] 422 POST ... code=VALIDATION_ERROR requestId=...`; tìm `requestId` đó trong log backend thấy cặp `-->` / `<-- 422`.
4. Request thành công: tab **Network**, request `query/...` có header **`X-Request-Id: web-...`**; cùng id đó có trong log backend (mục 5).

## 12. Phiên đăng nhập

1. F12 → Network, đăng nhập: chỉ có `POST /auth/login` rồi `GET /auth/me` đều **200**. Trước đây `/auth/me` trả 401 rồi phải refresh thêm.
2. Tải lại trang (F5): `POST /auth/refresh` 200 rồi `GET /auth/me` 200, không có 401.

---

## Giới hạn / chưa làm

- Cần build lại image `api` và `web` mới có các sửa trên ở lab/prod (chưa build, chưa deploy).
- `deploy-check/config` (bản phát hành) chưa chuyển sang định dạng map một lần.
- Chưa tìm thấy nguyên nhân nào khác gây "lần đầu không gửi request" ngoài mục 7. Nếu còn ở lab: mở console lấy `requestId` rồi tìm trong log backend; không có dòng `-->` nghĩa là request không tới được server (lỗi mạng/proxy).
- Test tự động (không thay thế test tay): API 238/239 (1 test fail vì biến `*_BASE_URL` chưa đặt khi chạy jest), web 184/184.

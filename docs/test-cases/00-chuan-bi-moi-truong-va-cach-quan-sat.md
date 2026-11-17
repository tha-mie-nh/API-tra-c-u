# 00. Chuẩn bị môi trường, dữ liệu mẫu và cách quan sát

Đọc file này **trước** các file kịch bản khác. Mọi kịch bản đều dùng các địa chỉ, tài khoản, dữ liệu và lệnh ở đây. Các bước chạy trên môi trường dev hiện tại (máy của bạn); nhãn trên giao diện lấy đúng từ mã nguồn (`apps/web/src/i18n`).

## 1. Dựng môi trường

| Thành phần | Lệnh | Địa chỉ | Kiểm tra sống |
|---|---|---|---|
| Postgres dev | `docker compose up -d postgres` | cổng 15432 | `docker ps` thấy `app-tra-cuu-du-lieu-postgres-1` healthy |
| API + web dev | `pnpm dev` (để chạy nền, log ra `/tmp/dev2.log`) | API http://localhost:3000, web **http://localhost:5173** | `curl -s localhost:3000/api/v1/health` ra `{"status":"ok",...}` |
| API mẫu của vhung | `docker run -p 8000:8080 --name simple-api -d vhung98vp/simple-api:1.0` | http://localhost:8000 | `curl -s localhost:8000/manage/health` |
| API giả echo (bình thường) | `docker run -d --name echo-mock -p 4200:4200 gthanh/app_tra_cuu:mock-echo-v1` | http://localhost:4200 | `curl -s -X POST localhost:4200/x -d '{}'` |
| API giả echo (hỏng lần đầu: 503) | `docker run -d --name echo-flaky -p 4201:4200 -e MOCK_ECHO_FAIL_FIRST=1 -e MOCK_ECHO_FAIL_MODE=503 gthanh/app_tra_cuu:mock-echo-v1` | http://localhost:4201 | request đầu tiên trả 503, các lần sau trả 200 |
| Mock công dân cũ | `node scripts/mock-upstream-server.js` | http://localhost:4100 | (không cần cho các ca ở đây) |

Biến môi trường dev cần có trong `.env` (đã thêm): `SIMPLE_API_BASE_URL=http://localhost:8000`, `SIMPLE_IMAGES_API_KEY=my-secret-key`, `SIMPLE_BADKEY_API_KEY=wrong-key`. Đổi `.env` thì phải chạy lại `pnpm dev`.

## 2. Tài khoản

| Tài khoản | Mật khẩu | Vai trò | Ghi chú |
|---|---|---|---|
| `pwtest` | `xZfMt6jrzaAWADDmEJEG` | Quản trị viên | tài khoản chính để test; không bị buộc đổi mật khẩu |
| `admin` | (mật khẩu bạn đã đặt) | Quản trị viên | nếu quên: xem mục "Đặt lại mật khẩu admin" cuối file |

Các tài khoản khác (người thường, kiểm toán viên...) được **tạo ngay trong các kịch bản** (file 01 và 02) và ghi tên cố định `tester_a`, `tester_b`.

## 3. Dữ liệu mẫu để đối chiếu kết quả

### 3.1 `simple-api` `GET /search` và `POST /search` (mảng 10 phần tử, thứ tự trả về theo `id`)
| id | name | type | create_at (ISO, không múi giờ) | update_at (`DD/MM/YYYY HH:mm:ss`) | delete_at (`DD/MM/YYYY`) |
|---|---|---|---|---|---|
| 1 | item-one | M | 2024-10-15T09:43:27 | 10/12/2025 12:31:06 | 13/12/2025 |
| 2 | item-two | F | 2024-11-05T03:41:52 | 12/09/2025 15:12:46 | 10/11/2025 |
| 3 | item-three | M | 2024-01-22T14:05:11 | 03/02/2025 08:20:45 | 18/03/2025 |
| 4 | item-four | F | 2024-03-09T21:17:38 | 25/06/2025 19:44:02 | 01/07/2025 |
| 5 | item-five | F | 2024-05-30T06:58:03 | 14/08/2025 10:09:57 | 29/08/2025 |
| 6 | item-six | M | 2024-07-18T17:26:49 | 07/11/2025 23:51:14 | 22/11/2025 |
| 7 | item-seven | M | 2024-08-27T11:12:35 | 19/01/2025 05:33:28 | 02/02/2025 |
| 8 | item-eight | F | 2024-09-03T00:39:20 | 30/04/2025 13:15:41 | 15/05/2025 |
| 9 | item-nine | M | 2024-12-12T19:48:06 | 21/10/2025 16:02:33 | 05/11/2025 |
| 10 | item-ten | F | 2024-12-31T23:59:59 | 01/01/2025 00:00:01 | 31/12/2025 |

Quy tắc của `simple-api` (đã thử): `count=N` trả N phần tử đầu (không có `count` thì trả 10); `param1=abc` làm `description` của phần tử 1 thành `first sample item (param1=abc)`; `POST` gửi body JSON thì `description` của phần tử 1 chứa `body={...}`; `GET /search` trả **mảng ở gốc** `[ {...}, ... ]`, còn `POST /search` trả `{"data":[ ... ]}`.
Mỗi phần tử có các trường: `id` (số), `name`, `description`, `type` (`M`/`F`), `create_at`, `update_at`, `delete_at`.

### 3.2 `simple-api` `GET /images` (cần header `X-Access-Key: my-secret-key`)
Chỉ có **3 ảnh**: id 1 "Photo sample 01" (`2024-10-15T09:43:27`), id 2 "Sample 02 image" (`2024-11-05T03:41:52`), id 3 "Photo 03 sample" (`2024-12-12T19:48:06`). `count=5` vẫn chỉ trả 3; không có `count` trả 1 ảnh. Mỗi phần tử: `id` (**số**), `description`, `create_at`, `image_base64` (base64 không có tiền tố `data:`). Thiếu/sai khóa: HTTP 401 `{"error":"Unauthorized","message":"Invalid or missing key"}`.

### 3.3 `mock-echo` (cổng 4200/4201)
Mọi đường dẫn trả `data.items[0]` = bản ghi mặc định (`cccd: 001099001234`, `ho_ten: Nguyễn Văn Mock`, ...) trộn thêm các query và body bạn gửi; trường `echo` mô tả đúng request nhận được (method, url, query, body, header với khóa bị che `[redacted]`).

## 4. Cách quan sát (dùng xuyên suốt)

### 4.1 Mạng của trình duyệt (Network)
1. Mở trang, nhấn **F12**, chọn tab **Network**.
2. Bấm bộ lọc **Fetch/XHR**, ô lọc gõ `api/v1`.
3. Tích **Preserve log** để không mất dòng khi chuyển trang. Muốn mô phỏng cache trống: tích **Disable cache**.
4. Bấm một dòng: tab **Headers** (phương thức, URL, mã trạng thái, `X-Request-Id`), **Payload** (dữ liệu gửi), **Response** (dữ liệu nhận), **Timing** (thời gian).

### 4.2 Console của trình duyệt
Tab **Console** (F12). Giao diện chỉ ghi `[api] ...` khi có cảnh báo/lỗi; thao tác bình thường **không** có dòng nào.

### 4.3 Log backend
```bash
tail -f /tmp/dev2.log | grep --line-buffered "apps/api dev"            # xem trực tiếp
grep "requestId=web-xxxx" /tmp/dev2.log                                # tìm theo mã yêu cầu
grep -E " - (WARN|ERROR) - " /tmp/dev2.log | tail -20                  # chỉ cảnh báo/lỗi
```
Định dạng mỗi dòng: `YYYY-MM-DD HH:mm:ss,SSS - MỨC - ngữ cảnh - nội dung`.

### 4.4 Log của API giả
`docker logs --tail 20 echo-mock` (và `echo-flaky`, `simple-api`). Dòng `-->` là request đã nhận, `<--` là phản hồi.

### 4.5 Cấu hình đang lưu trên đĩa
Khai báo một lần trong cửa sổ dòng lệnh dùng để test:
```bash
cd /home/thanh/Project_app_API
show_ds() { node -e 'const c=require("./config/config.json");const d=process.argv[1]==="__dict"?c.dictionaries:c.datasources.find(x=>x.code===process.argv[1]);console.log(JSON.stringify(d,null,2))' "$1"; }
# dùng: show_ds SA_SEARCH_GET      show_ds __dict
```

### 4.6 Gọi API trực tiếp bằng `curl` (đối chiếu độc lập với giao diện)
```bash
login() { curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d "{\"username\":\"$1\",\"password\":\"$2\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'; }
TOKEN=$(login pwtest 'xZfMt6jrzaAWADDmEJEG')
q() { curl -s -X POST "localhost:3000/api/v1/query/$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$2"; }
# dùng: q SA_SEARCH_GET '{"params":{"param1":"val1","count":2}}'
```
(Token sống 15 phút; hết hạn thì chạy lại dòng `TOKEN=$(...)`.)

## 5. Quy ước mọi kịch bản
- **Mục tiêu**: điều cần chứng minh.
- **Dữ liệu nhập**: giá trị chính xác, gõ đúng từng ký tự.
- **Các bước**: đánh số, gọi tên nút/nhãn đúng như trên màn hình (in đậm).
- **Kết quả mong đợi**: gồm *Nhìn ở đâu* và *Đúng khi*. Chỉ ghi "Đạt" khi **mọi** ý "Đúng khi" thỏa.
- **Đối chiếu**: lệnh/quan sát độc lập để chắc chắn không bị đánh lừa bởi giao diện.
- **Thử thêm (xấu)**: đầu vào sai hoặc điều kiện bất thường và kết quả đúng.
- Lỗi tìm ra: ghi **bước tái hiện, kết quả thực tế, kết quả mong đợi, `requestId`** (dòng `X-Request-Id` trong Network hoặc `requestId=` trong log).

## 6. Sao lưu và khôi phục trạng thái giữa các lần test
Trước khi bắt đầu một đợt test (vì các ca sửa `config/config.json` thật):
```bash
cp config/config.json /tmp/config.before-test.json
```
Khôi phục sau đợt test:
```bash
cp /tmp/config.before-test.json config/config.json
TOKEN=$(login pwtest 'xZfMt6jrzaAWADDmEJEG')
curl -s -X POST localhost:3000/api/v1/admin/datasources/reload -H "authorization: Bearer $TOKEN" -o /dev/null -w "reload http=%{http_code}\n"   # phải ra 201
```
Người dùng và vai trò tạo trong test (`tester_*`) có thể để lại; xóa bằng chức năng **Xóa người dùng** nếu muốn sạch.

## 7. Đặt lại mật khẩu `admin` (khi quên)
```bash
cd apps/api && npx dotenv -e ../../.env -- npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/reset-admin-password.ts admin
```
In ra mật khẩu tạm; đăng nhập xong hệ thống bắt đổi mật khẩu (tối thiểu **12 ký tự**).

## 8. Bảng ngưỡng cấu hình dev dùng trong kịch bản
| Tham số | Giá trị | Nguồn |
|---|---|---|
| Khóa tài khoản | sai **5 lần** liên tiếp thì khóa **15 phút** | `AUTH_LOGIN_MAX_ATTEMPTS=5`, `AUTH_LOCKOUT_MINUTES=15` |
| Mật khẩu mới | tối thiểu 12 ký tự | giao diện đổi mật khẩu |
| Giới hạn tra cứu | **30 lượt/phút/người** | `QUERY_THROTTLE_LIMIT` (mặc định) |
| Giới hạn đăng nhập | 50 lượt/phút/IP trong dev (mặc định ứng dụng là 10) | `LOGIN_THROTTLE_LIMIT=50` trong `.env` |
| Timeout upstream | 10 000 ms, thử lại 2 lần (cách nhau 300 ms, 600 ms) | `defaults` trong `config.json` |
| Token truy cập | 15 phút | `JWT_ACCESS_TTL=15m` |

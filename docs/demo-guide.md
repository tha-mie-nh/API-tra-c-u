# Hướng dẫn Demo

Tài liệu để tự thử toàn bộ chức năng hệ thống. Không cần setup gì thêm nếu app đang chạy sẵn (`pnpm dev`).

## Truy cập

Hai bản đang chạy song song để so sánh:

| | Dev (hot-reload, dùng để test/sửa) | Production (image thật `api-v7`/`web-v11`, build sẵn) |
|---|---|---|
| Web | http://localhost:5173 | http://localhost:80 |
| API | http://localhost:3000/api/v1/health | qua nginx, không lộ port riêng |
| Swagger (test API trực tiếp, không qua UI) | http://localhost:3000/api/v1/docs | http://localhost/api/v1/docs |

Bấm **"Authorize"** trên Swagger rồi dán `accessToken` lấy từ response của `POST /auth/login` — sau đó test trực tiếp mọi endpoint ngay trên trang, không cần Postman/curl.

## Đăng nhập

Username luôn là `admin`. Mật khẩu tạm đổi mỗi lần cấp lại nên **không ghi cố định vào tài liệu này** — lấy mật khẩu tạm mới nhất bằng lệnh sau (chạy trên máy đang host dev; không áp dụng cho production — xem `docs/deployment-guide.md` nếu cần reset production):

```bash
pnpm --filter api exec ts-node apps/api/scripts/reset-admin-password.ts admin
```

Lệnh in ra `username`/`tempPassword` — dùng đăng nhập, hệ thống bắt đổi mật khẩu ngay lần đầu.

## 1. Tra cứu dữ liệu — 4 nguồn dữ liệu (API thật theo `spec upstream`)

Vào **Tra cứu** ở menu trái, chọn từng mục dưới đây.

> Đã tắt toàn bộ 7 datasource demo ban đầu (2026-09-30) — chỉ giữ lại 4 datasource API thật bên dưới. Việc tắt chỉ set `enabled: false` trong `config/config.json` (không xóa code), có thể bật lại bất kỳ lúc nào nếu cần minh họa lại cơ chế adapter generic.

### Nhóm API thật (theo `spec upstream` — 4 mục)

`transport.baseUrl` của cả 4 đang trỏ vào server demo `scripts/mock-upstream-server.js` (chưa có base URL/token thật từ leader), nhưng field mapping đã đúng 100% theo tài liệu — khi có API thật chỉ cần đổi giá trị 2 biến `*_BASE_URL`/`*_API_KEY` tương ứng trong `.env`, không sửa `config.json` hay code.

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
| Nguồn dữ liệu | Thêm/sửa/xóa/bật-tắt datasource qua giao diện trực quan, có hiệu lực ngay — xem mục 5 |

## 4. Lịch sử tra cứu

Vào **Lịch sử** — mỗi lần tra cứu ở mục 1 đều được ghi lại: người tra, thời điểm, tham số tìm kiếm (đã ẩn field nhạy cảm), kết quả thành công/lỗi.

## 5. Quản lý nguồn dữ liệu động — tính năng mới nhất

Vào **Quản trị → Nguồn dữ liệu** (`/quan-tri/nguon-du-lieu`). Đây là tính năng admin tự cấu hình API mà không cần sửa file/không cần restart container — leader yêu cầu thêm ngày 2026-11-03.

Phải cover được **2 tình huống** — leader hay hỏi cả 2:

### Demo A — API cũ (đã có sẵn trong hệ thống): bật lên, thấy hiệu lực ngay lập tức

1. Trong danh sách, tìm `CITIZEN_BASIC` (đang **tắt**).
2. Bấm công tắc **Kích hoạt** ở cột cuối → bật lên.
3. Ngay lập tức (không F5, không restart) qua menu **Tra cứu** — "Tra cứu thông tin công dân" đã xuất hiện, dùng được luôn.
4. Tắt lại để về trạng thái demo ban đầu nếu muốn.

Đây chính là điểm khác biệt với trước đây: trước kia phải sửa tay `config/config.json` + restart `api` container; giờ chỉ cần 1 click trên UI, có hiệu lực tức thì.

### Demo B — API HOÀN TOÀN MỚI (chưa từng tồn tại trong hệ thống)

Để chứng minh hệ thống không hardcode riêng cho dữ liệu công dân (CCCD/hộ chiếu/GPLX...), mà thật sự **config-driven cho bất kỳ loại API nào**, tạo sống ngay trong buổi demo 1 datasource hoàn toàn mới, không liên quan gì tới nhóm dữ liệu công dân có sẵn — ví dụ **"Tra cứu Bảo hiểm xã hội" (`BHXH_LOOKUP`)** — để leader thấy menu **Tra cứu** tự sinh form nhập + bảng kết quả hoàn toàn tự động từ cấu hình vừa nhập, không có 1 dòng code nào viết riêng cho nó.

Kịch bản live demo cho leader xem:

1. Bấm **"Thêm datasource mới"**.
2. Có thể chọn **"Sao chép từ nguồn có sẵn"** để đỡ phải điền lại từ đầu (copy toàn bộ cấu hình của 1 datasource đang có, chỉ cần đổi `Mã` vì mã phải duy nhất) — hoặc điền từ đầu để chứng minh không có gì "cheat".
3. Điền `Loại kết nối = HTTP (API thật)` để minh họa việc trỏ API thật: `Base URL`, `Đường dẫn (path)`, `Headers`, `Xác thực` (chỉ **chọn tên** biến env có sẵn trong `.env.prod`, không bao giờ gõ thẳng API key thật vào form).
4. Bảng **"Các trường đầu vào"**/**"đầu ra"** — thêm/xóa từng dòng trực quan (không cần gõ JSON tay).
5. Lưu lại → datasource mới xuất hiện ngay trong **Tra cứu**, menu tự sinh form nhập liệu + bảng kết quả hoàn toàn tự động từ cấu hình vừa nhập.

### Demo C — nối API THẬT qua mạng + cách điền prefix/header

Phần leader hay hỏi nhất: **điền `Base URL`/`Đường dẫn`/`Headers`/`Xác thực` để gọi ra 1 API thật qua mạng thì đúng hình dạng thế nào**. Để demo được mà chưa có API thật trong tay, có sẵn 1 server giả lập API thật (`scripts/mock-upstream-server.js`) — chạy thật trên 1 cổng riêng, yêu cầu đúng kiểu header mà API thật hay dùng (`X-Access` cho API key, `X-ReqType` cố định — đúng pattern leader từng hỏi).

**Bật server này trước khi demo** (1 lần, để chạy nền suốt buổi demo):
```bash
node scripts/mock-upstream-server.js
# [mock-upstream] listening on http://localhost:4100
```

Tạo sống 2 datasource ví dụ nối vào server này (bấm **"Thêm datasource mới"** giống Demo B) — ví dụ `MST_LOOKUP` (Tra cứu mã số thuế) và `GPKD_LOOKUP` (Tra cứu giấy phép kinh doanh). Sau khi tạo, vào **Tra cứu** dùng thử ngay:
- Mã số thuế: `0101234567`
- Số giấy phép kinh doanh: `GP-2024-001122`

**Điền `MST_LOOKUP` như sau** (đây là phần leader hỏi "điền prefix ở đâu"):

| Trường | Điền | Giải thích |
|---|---|---|
| Loại kết nối | `HTTP (API thật)` | |
| Base URL | `${MOCK_UPSTREAM_BASE_URL}` | Cú pháp `${TÊN_BIẾN}` — **không gõ URL trực tiếp**, hệ thống tự thay bằng giá trị thật trong `.env`/`.env.prod` lúc chạy |
| Đường dẫn (path) | `/tra-cuu/ma-so-thue` | Copy nguyên từ tài liệu API thật |
| Phương thức | `POST` | **Chỉ dùng POST** — hệ thống hiện chỉ gửi tham số qua JSON body, GET sẽ không gắn được tham số nào (giới hạn hiện tại, đã ghi lại) |
| Headers tĩnh | `X-ReqType: LOOKUP` | Header cố định, không chứa bí mật — gõ thẳng giá trị vào đây được |
| Xác thực → Loại | `apiKeyHeader` | |
| Xác thực → Tên header | `X-Access` | Đây chính là "prefix"/tên header mà API thật yêu cầu — gõ đúng tên theo tài liệu API (ví dụ cũng có thể là `Authorization`, `X-Api-Key`...) |
| Xác thực → Biến chứa giá trị | `MOCK_UPSTREAM_API_KEY` | **Chỉ chọn tên biến env đã có sẵn** — không bao giờ gõ thẳng API key thật vào ô này |

Đổi `Loại kết nối` sang `HTTP` cho 1 trong các datasource thật (`IMMIGRATION_HISTORY`, `PASSPORT_INFO`...) khi có tài liệu API thật cũng điền đúng y hệt format này — chỉ khác giá trị `Base URL`/`Đường dẫn`/tên header theo tài liệu thật.

### Demo C2 — xem cách 1 trong 4 datasource thật đã được điền HTTP (không phải datasource mới)

**Vì sao làm bước này:** không còn cơ chế "file mock tĩnh" trong hệ thống nữa — MỌI datasource (cả 11) đều là `transport.kind: "http"`, luôn gọi ra một API thật qua mạng. 4 datasource ở mục 1 hiện đang trỏ `Base URL` vào server demo (`scripts/mock-upstream-server.js`, cổng 4100) vì **chưa có URL API thật từ leader** — khi có, chỉ cần đổi giá trị 2 biến `*_BASE_URL`/`*_API_KEY` tương ứng trong `.env`/`.env.prod`, không cần sửa `config.json`/form Admin UI.

Khác Demo C ở trên (tạo datasource MỚI), đây là xem lại cách đã điền trên 1 trong 4 datasource THẬT — `IMMIGRATION_HISTORY`.

1. Bật server mock nếu chưa bật: `node scripts/mock-upstream-server.js` (để chạy nền, không tắt terminal).
2. Vào **Quản trị → Nguồn dữ liệu** → tìm dòng `IMMIGRATION_HISTORY` → bấm **Sửa** → xem các ô đã điền sẵn:

   | Ô trong form | Giá trị đã điền | |
   |---|---|---|
   | Loại kết nối | `HTTP (API thật)` | |
   | Base URL | `${IMMIGRATION_HISTORY_BASE_URL}` | ← dấu `${...}` nghĩa là "lấy giá trị từ biến môi trường tên này", không phải URL thật |
   | Đường dẫn (path) | `/find` | |
   | Phương thức | `POST` | |
   | Headers tĩnh | `X-Request-Type: find-immihistory` | header CỐ ĐỊNH, không phải bí mật |
   | Xác thực → Loại | `apiKeyHeader` | |
   | Xác thực → Tên header | `X-Access` | đây chính là "tên prefix" mà API thật yêu cầu — khi đổi API thật thì đổi đúng tên header theo tài liệu họ đưa |
   | Xác thực → Biến chứa giá trị | `IMMIGRATION_HISTORY_API_KEY` | chọn qua dropdown tên biến có sẵn, không tự gõ tay |

3. Vào menu **Tra cứu → Tra cứu dữ liệu xuất nhập cảnh**, ô "Số hộ chiếu" gõ `E00123456` → bấm Tra cứu → ra đúng 2 bản ghi (1 xuất 1 nhập, họ tên "Nguyễn Văn A") — dữ liệu đi qua mạng thật tới server demo, không đọc file nào cả.
4. **Khi có API thật:** quay lại **Sửa**, chỉ cần đổi `Đường dẫn`/`Headers tĩnh` (và/hoặc tên header xác thực) theo đúng tài liệu API thật nhận được — `Base URL`/`Biến chứa giá trị` giữ nguyên tên biến, chỉ đổi GIÁ TRỊ của 2 biến đó trong `.env`.

`PASSPORT_INFO`/`DRIVER_LICENSE` dùng chung route `/find`, chỉ khác giá trị header `X-Request-Type` (`find-passport`/`find-driverlicense`). `FACE_PHOTO` có route riêng (`/tra-cuu/anh-mat`, trả ảnh base64) — tra cứu với Số CMND/CCCD `001099001234` để xem demo.

**Gặp lỗi "menu Tra cứu trống, dù đăng nhập được"?** Đây là tình huống riêng của **môi trường test mới dựng lần đầu** (xem "Môi trường test" trong `docs/deployment-guide.md`) — không phải lỗi backend. Nguyên nhân: `seed` chạy TRƯỚC khi `api` kịp đồng bộ danh sách quyền `api:*` vào DB (chỉ xảy ra khi API khởi động lần đầu trên 1 DB hoàn toàn mới), nên lúc `seed` chạy chưa có quyền nào để cấp cho ADMIN. Sửa bằng cách chạy lại `seed` một lần nữa (lúc này `api` đã chạy, đã có đủ quyền để cấp):
```bash
docker compose -f docker-compose.test.yml --env-file .env.test --profile "*" run --rm seed
```
Sau đó F5 lại trang web và đăng nhập lại.

### Test trực tiếp qua API (không qua giao diện) — dùng Swagger hoặc curl

```bash
# 1. Đăng nhập lấy token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<mật khẩu của bạn>"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['accessToken'])")

# 2. Xem danh sách tên biến env có thể gán cho datasource (chỉ tên, không lộ giá trị thật)
curl -s http://localhost:3000/api/v1/admin/datasources/env-refs -H "Authorization: Bearer $TOKEN"

# 3a. Demo A — bật/tắt 1 datasource CŨ qua API thẳng (tương đương bước demo ở trên)
curl -s -X PATCH http://localhost:3000/api/v1/admin/datasources/CITIZEN_BASIC/enabled \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 3b. Demo B — query thử API HOÀN TOÀN MỚI (đã sống sẵn, không cần tạo lại)
curl -s -X POST http://localhost:3000/api/v1/query/BHXH_LOOKUP \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"params": {"cccd": "001099001234"}}'

# 3c. Demo C — query qua HTTP THẬT (api gọi ra scripts/mock-upstream-server.js
#     qua mạng, kèm header X-Access/X-ReqType đã cấu hình — nhớ bật server
#     mock trước: node scripts/mock-upstream-server.js)
curl -s -X POST http://localhost:3000/api/v1/query/MST_LOOKUP \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"params": {"mst": "0101234567"}}'
```

Toàn bộ endpoint `admin/datasources/*` (list/tạo/sửa/xóa/bật-tắt/reload-từ-file) có sẵn trong Swagger (`/api/v1/docs`, nhóm **Admin Datasources**) — tự bấm "Try it out" thử trực tiếp không cần nhớ cú pháp curl.

**Lưu ý khi demo:** mọi thay đổi ghi thẳng vào `config/config.json` thật (có backup `.bak` tự động) — demo thoải mái, nhưng nếu muốn trả về trạng thái ban đầu thì tắt lại/xóa datasource vừa tạo sau khi demo xong. `BHXH_LOOKUP`/`MST_LOOKUP`/`GPKD_LOOKUP` là các ví dụ cố định, giữ nguyên để dùng demo nhiều lần — nếu tự tạo thêm 1 cái nữa để luyện tay thì nhớ xóa sau khi xong. `MST_LOOKUP`/`GPKD_LOOKUP` cần server mock đang chạy (`node scripts/mock-upstream-server.js`) mới query được — không bật server thì sẽ báo lỗi kết nối (đúng hành vi thật khi 1 API thật bị down, cũng là điểm hay để minh họa thông báo lỗi trông thế nào).

## Câu hỏi thường gặp khi demo

**Q: Vì sao "GPLX" bắt tôi điền đủ 5 trường trong khi các mục khác chỉ cần 1?**
A: Đúng theo `spec upstream` — API GPLX thật yêu cầu tất cả 5 trường đều bắt buộc (không có tùy chọn "chỉ cần 1 trong nhiều trường" như hộ chiếu/xuất nhập cảnh).

**Q: Dữ liệu ảnh GPLX/ảnh mặt là ảnh thật hay ảnh giả?**
A: Ảnh giả (1x1 pixel) — vì đang chạy mock, chưa có API thật. Cơ chế hiển thị (thumbnail + bấm để xem to) đã hoạt động đúng, chỉ cần đổi mock → API thật là ảnh sẽ hiển thị thật.

# Nhật ký thay đổi

Ghi lại các thay đổi đáng chú ý theo ngày. Mới nhất ở trên cùng.

## 2026-11-17

### Sửa bảo mật: header `X-Access-Key` bị lưu dạng rõ trong chi tiết tra cứu
- Nguyên nhân: quy tắc che header chỉ khớp tên có `auth`, `api-key`, `token`, `secret`, `cookie`, `password`, `credential`; `access-key` lọt qua nên key nhập vào **Header tùy chỉnh** của nguồn hiện nguyên văn trong "Chi tiết tra cứu" và được lưu trong `query_log_payloads`.
- Nay: che mọi header có tên chứa `key`, `signature`, `session` (ngoài các từ khóa cũ), và header khai làm xác thực. Có test.
- Chỉ áp dụng cho lượt tra cứu MỚI. Các dòng đã lưu trước đó vẫn chứa giá trị rõ: xem cách xóa ở mục dưới. Key dán vào Header tùy chỉnh còn nằm trong `config.json`: nên chuyển sang ô **API key** và xóa header tùy chỉnh đó.

### Sửa: lỗi do API đối tác hiện đúng mã lỗi của đối tác
- Trước: đối tác trả 401 (sai/thiếu API key) thì giao diện chỉ hiện một câu cố định, còn trình duyệt nhận 502 của API mình nên dễ tưởng là lỗi của hệ thống.
- Nay: lỗi tra cứu do đối tác (`UPSTREAM_UNAUTHORIZED`, `UPSTREAM_ERROR`) kèm trường `error.upstreamStatus` (mã HTTP thật của đối tác); giao diện hiện "API đối tác trả về lỗi 401. API key không hợp lệ hoặc hết hạn." (có gợi ý ngắn cho 401, 403, 404, 5xx).
- Giữ nguyên: HTTP status trả cho trình duyệt vẫn là 502 (để 401 của đối tác không bị hiểu nhầm là hết phiên đăng nhập và đăng xuất người dùng); không gửi nội dung phản hồi của đối tác ra trình duyệt. Timeout và mất kết nối không có `upstreamStatus`, vẫn dùng câu chung.

### Mới: nhập API key của nguồn dữ liệu trên giao diện, lưu mã hóa trong Postgres
- Admin nhập API key ở form nguồn dữ liệu; server mã hóa AES-256-GCM (khóa chủ `SECRETS_ENCRYPTION_KEY` trong env, AAD = mã nguồn) và lưu ở bảng mới `app.datasource_secrets` (migration `20261117150000_add_datasource_secrets`).
- Thêm nguồn mới không còn cần sửa `.env.prod` + restart: `baseUrl` ghi thẳng URL, key nhập trên giao diện. Cách cũ (`auth.valueEnv` + biến môi trường) vẫn dùng được; mỗi nguồn dùng MỘT trong hai.
- Key giải mã một lần lúc khởi động và giữ trong bộ nhớ; giá trị không bao giờ trả về trình duyệt (API chỉ trả `apiKeyStored: boolean`), không vào `config.json`, audit hay log. Validate lỗi thì hoàn tác key; xóa nguồn hoặc chuyển sang biến môi trường thì key bị xóa.
- Thiếu `SECRETS_ENCRYPTION_KEY`: ô API key bị khóa, API trả 422 `SECRETS_ENCRYPTION_KEY_MISSING`; hệ thống vẫn chạy với biến môi trường.
- `init-env-prod.sh` sinh khóa và `--check` kiểm tra định dạng; `get()` không còn thoát im lặng khi thiếu biến.
- Triển khai: `.env.prod` cũ phải thêm khóa (xem `deployment-guide.md`); chạy migration (image `api` tự chạy qua `migrate`). Nhiều bản `api` chạy song song thì key mới chỉ có hiệu lực sau khi các bản kia khởi động lại (hiện chỉ chạy 1 bản).

## 2026-11-16

### Sửa lỗi: ngày/giờ không sort, datetime hiện `-`, thêm định dạng hiển thị cấu hình được
- **Sort**: khóa sort lấy từ giá trị gốc của upstream + `format` của field, nên sort đúng cả khi field khai báo `string` hoặc giá trị dạng `DD/MM/YYYY HH:mm:ss` (trước đây `new Date()` ra NaN nên mọi dòng bằng nhau).
- **`format` nhận nhiều dạng**, ngăn cách bằng `|` (vd `DD/MM/YYYY HH:mm:ss|DD/MM/YYYY HH:mm|DD/MM/YYYY`); giá trị dạng ISO vẫn đi qua như cũ. Chuỗi ISO không có múi giờ được hiểu là UTC.
- **`displayFormat` (mới)** trên output field `date`/`datetime`: định dạng hiển thị (token `DD MM YYYY HH mm ss`, múi giờ Asia/Ho_Chi_Minh). Mặc định giữ `DD-MM-YYYY` / `DD-MM-YYYY HH:mm`.
- **Form admin**: field `Ngày`/`Ngày giờ` hiện ngay trên dòng chính 2 ô chọn: "Đọc từ API thật theo (format)" (chuyển chuỗi sang ngày) và "Hiển thị cho người dùng (displayFormat)", mỗi ô là dropdown mẫu có sẵn + "Tùy chỉnh…", kèm ví dụ xem trước cho displayFormat.
- **FE**: giá trị ngày không parse được hiển thị nguyên văn thay vì `—`.
- **Form admin datasource**: output field có ô `format` và `displayFormat`. Trước đây form không có `format` nên **lưu từ giao diện làm mất `format`** đã cấu hình trong config.json (nguyên nhân khả dĩ của lỗi datetime sai định dạng sau khi sửa trong admin).

### Sửa lỗi: bấm tra cứu treo đến hết timeout, bấm lại 2-3 lần mới được
- **Triệu chứng**: giao diện gửi request nhưng backend không có dấu vết (không thấy request vào hay gọi sang server đích), màn hình treo cho đến hết timeout, sau đó bấm lại 2-3 lần mới có kết quả. Khác với lỗi 502 tức thời ở mục retry bên dưới (lỗi đó thử lại được, lỗi này thì không vì không có phản hồi nào để biết mà thử lại).
- **Nguyên nhân (tái hiện được)**: một kết nối bị firewall/NAT/lớp chuyển tiếp cổng của máy "âm thầm bỏ" trong lúc trang nhàn rỗi (không có FIN/RST). Trình duyệt vẫn tưởng kết nối còn sống nên dùng lại, request được gửi vào và không bao giờ được trả lời; chỉ lần bấm sau (kết nối mới) mới chạy. Tái hiện bằng `scripts/load-test/mock-blackhole-proxy.js` (proxy đứng trước web, sau khi nhàn rỗi thì nuốt dữ liệu, không đóng kết nối): bản `web-v16` treo 35+ giây ở lần bấm đầu sau 12 giây nghỉ.
- **Sửa**:
  - Web (`apps/web/src/lib/api-client.ts`): sau 10 giây không gọi API, gửi song song 6 request `GET /health` rất nhỏ (tối đa 2,5 giây) trước request thật; kết nối nào không trả lời bị hủy, trình duyệt bỏ socket chết, request thật đi bằng kết nối sạch. Kết nối khỏe tốn vài mili giây. Cùng bài thử: lần bấm đầu thành công, console ghi `[api] N stale connection(s) did not answer ... dropped, reconnecting`.
  - nginx (`docker/nginx.conf`, `deploy-check/docker/nginx.conf`): `keepalive_timeout 15s` (đóng kết nối nhàn rỗi sớm), `resolver ... ipv6=off` (tránh treo khi hết hạn cache DNS), `proxy_connect_timeout 5s` (không chờ 60 giây khi không nối được api).
  - API gọi upstream (`http-info.adapter.ts`): dùng agent riêng, đóng socket nhàn rỗi sau 1 giây (không dùng lại socket cũ) và hết hạn kết nối mới sau 3 giây (rồi retry bình thường).
- **Giới hạn**: nếu chính upstream nhận request rồi im lặng trên kết nối mới thì vẫn phải chờ hết timeout của nguồn dữ liệu (không phân biệt được với upstream chậm). Cần build lại image api và web để có hiệu lực.

### Đợt 4: kiểm thử với `simple-api`, ảnh, mã lỗi upstream, giao diện
Kiểm thử bằng image `vhung98vp/simple-api:1.0` (`docker run -p 8000:8080 --name simple-api -d vhung98vp/simple-api:1.0`): `GET /search` (mảng ở gốc), `POST /search` (query + body), `GET /images` (header `X-Access-Key`).
- **Response là mảng ở gốc** (như `GET /search`): bỏ trống `recordsPath` trước đây luôn ra 0 kết quả; nay mảng ở gốc dùng được, một object đơn lẻ được coi là 1 bản ghi, kiểu khác coi là không có bản ghi (không còn làm hỏng bộ ánh xạ).
- **"Không có ảnh nào khớp" dù có ảnh**: màn ảnh chỉ nhận trường `recordId` **kiểu chuỗi**, còn upstream gửi `id` kiểu số và ảnh nằm sẵn trong trường `image` (base64). Nay `recordId` số cũng được, và ảnh base64 trong response hiển thị trực tiếp (thumbnail và hộp xem ảnh), không cần đi qua proxy.
- **Bấm ảnh hiện to**: ảnh phóng tới 80% chiều cao (tối đa 80% chiều rộng) màn hình; hộp xem ảnh base64 trong bảng thông tin cũng 80%.
- **Lỗi 401 từ upstream bị hiển thị chung chung** (lịch sử chỉ có `UPSTREAM_ERROR`/502): nay upstream trả 401/403 thì mã lỗi là `UPSTREAM_UNAUTHORIZED` ("Upstream rejected the access key (HTTP 401)"), lỗi khác ghi `Upstream datasource returned HTTP <mã>`. Trình duyệt vẫn nhận 502 (không dùng 401 để khỏi bị nhầm với phiên đăng nhập của chính người dùng). Giao diện báo "API key sai hoặc hết hạn".
- **Lưu form admin bị từ chối mà "không thấy báo lỗi"**: thông báo lỗi nằm cạnh trường lỗi, có thể rất xa nút Lưu trong form dài. Nay có thêm thông báo nổi nêu lỗi đầu tiên và số lỗi còn lại. (Trên môi trường dùng schema cũ trong thư mục config, đây là lỗi `must NOT have additional properties`; đã được xử lý bằng schema nằm trong image ở đợt 3.)
- **Màu giao diện**: khôi phục bảng màu trung tính ban đầu (bỏ tông xanh chàm ở đợt giao diện trước), giữ bố cục.

### Đợt 3: schema trong image, định dạng ngày input, tra cứu bằng query param, sửa chọn URL tự viết
- **Lưu form bị "must NOT have additional properties" / "Datasource config is invalid"**: image `api` không chứa thư mục `config`; cả `config.json` lẫn `config.schema.json` lấy từ thư mục được mount. Một `config.schema.json` bản cũ còn trong thư mục đó từ chối mọi khóa mới (`labelField`, `displayFormat`, `dictionaries`, `queryParams`...), làm cho việc lưu trường làm tiêu đề, định dạng ngày và danh mục thất bại. Nay schema nằm trong image (`/repo/schema/config.schema.json`, ưu tiên hơn bản trong thư mục mount; biến `CONFIG_SCHEMA_PATH` để ghi đè); trong môi trường dev vẫn dùng `config/config.schema.json` của repo.
- **Định dạng ngày của trường input**: `format` của input trước đây chỉ được lưu mà API không dùng. Nay ngày người dùng chọn (`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm[:ss]`) được đổi sang đúng dạng upstream cần (`DD/MM/YYYY`, `YYYYMMDD`, ...) khi gọi API thật, không đổi múi giờ. Form admin có ô chọn mẫu kèm ví dụ ngay trên dòng trường ngày.
- **Tra cứu chỉ bằng param (không body)**: trường input có thêm `in: "body" | "query"` (mặc định POST: body, GET: query). Trước đây method GET không gửi trường tra cứu nào lên upstream. Chọn "Query param" cho mọi trường của một POST thì không gửi body. `in: "body"` với method GET bị từ chối khi lưu. Form admin: ô "Gửi lên API thật bằng" ở phần mở rộng của dòng trường input.
- **Chọn URL biến môi trường rồi sửa thành URL tự viết** (và tương tự ô biến API key): chọn "Tự viết URL khác" không hiện ô nhập vì giá trị còn khớp tên biến; nay chế độ tự viết được ưu tiên, ô nhập hiện ra với giá trị cũ để sửa.
- Thư mục `deploy-check/config` đồng bộ lại `config.schema.json`.

### Phát hành image
- **Bản build lần ba (2026-11-17)**: thêm schema nằm trong image (`/repo/schema/config.schema.json`, thắng schema cũ trong thư mục config được mount), định dạng ngày và `in: body|query` của trường input, nút chọn URL tự viết, ảnh base64 và id số, ảnh xem lớn 80%, mã lỗi `UPSTREAM_UNAUTHORIZED`, mảng ở gốc cho `recordsPath`, ghim múi giờ cho ngày giờ không kèm múi giờ, thăm dò kết nối khi nhàn rỗi. Tag giữ nguyên `api-v13`/`web-v16` (ghi đè). **Máy đã pull trước đó phải `docker pull` lại rồi `up -d`.**
- `gthanh/app_tra_cuu:api-v13` (digest `sha256:91ad7425ef08a3d6194bcc882586028d5fc1e482bb5567138bb5ec0b8b041a30`) và `web-v16` (digest `sha256:055778e52963822198fdaa9ca91ff31cafff986e24e6a0c23b9406d70fbe50fe`, libxslt 1.1.42-r3), gồm toàn bộ thay đổi ngày 2026-11-16 bên dưới, kể cả sửa lỗi treo do kết nối bị bỏ âm thầm. Hai tag này đã được build lại và ghi đè (bản push đầu tiên, digest cũ, không còn dùng). `docker-compose.prod.yml` trỏ tới hai tag này.
- Thư mục config cần dùng bản mới (đã chuyển sang map một lần, schema có khóa mới): `deploy-check/config/*`. Config cũ có `mapTo`/`from` vẫn chạy nhưng schema cũ sẽ từ chối `displayFormat`, múi giờ, `dictionaries`, `queryParams`, `labelField`, nên phải cập nhật cả `config.schema.json` đi kèm.
- Chưa tạo thư mục `./logs` thì không ghi được file log (app vẫn chạy, chỉ cảnh báo một lần).

### Tìm và sửa 3 lỗi gốc phía ứng dụng (đợt 3, tái hiện bằng trình duyệt thật + upstream giả chập chờn)
- **"Lần đầu bấm tra cứu lỗi, bấm lần 2-3 mới được"**: nguyên nhân là `defaults` trong config (`retry`, `timeoutMs`, `maxResults`, `pageSize`) **không được áp dụng ở đâu cả**, nên nguồn dữ liệu không khai báo `transport.retry` có 0 lần thử lại; một lần socket bị reset hoặc upstream trả 503 là người dùng thấy lỗi 502 ngay. Tái hiện: upstream giả hỏng request đầu, lần 1 trả 502 (`attempt=1`, `other side closed`), lần 2-3 trả 200. Nay `defaults` được áp dụng vào cấu hình chạy (không ghi đè file); lần 1 tự thử lại (`attempt=2`) và trả 200. Cấu hình riêng của transport vẫn được ưu tiên.
- **"Mất URL và API key sau khi xóa cache"**: tái hiện được. API trả đúng (`${IMMIGRATION_HISTORY_BASE_URL}`), nhưng ô chọn (Radix Select) bắn `onValueChange('')` khi danh sách biến môi trường tải về chậm hơn lúc mở form (xóa cache thì chậm hơn); code ghi `${}` vào URL và rỗng vào tên biến API key. Nay bỏ qua giá trị rỗng ở mọi ô chọn của form; kiểm tra lại bằng trình duyệt thật: hiện đúng `IMMIGRATION_HISTORY_BASE_URL` và `IMMIGRATION_HISTORY_API_KEY`.
- **Lưu form admin làm mất cấu hình**: bấm Lưu không sửa gì làm mất `output.labelField` (form không biết khóa này). Nay form có ô chọn `labelField` và khi lưu giữ nguyên mọi khóa form không quản lý (khóa form quản lý mà để trống thì bị xóa đúng ý).
- **Phiên đăng nhập**: lúc tải trang và lúc đăng nhập, `/auth/me` được gọi trước khi lưu access token nên luôn trả 401 rồi phải refresh thêm một lần (xoay refresh cookie thừa). Nay lưu token trước khi gọi `/auth/me`.
- **Trace**: FE gửi `X-Request-Id` cho mỗi request và ghi `console.warn/error` (401, lỗi mạng, lỗi API) kèm id đó; backend chỉ nhận id dạng token ngắn `[A-Za-z0-9._-]{1,64}` (chống chèn dòng log), nên khớp được dòng log FE với dòng `-->`/`<--`/`upstream` ở BE.
- **API giả echo**: thêm `MOCK_ECHO_FAIL_FIRST=N` + `MOCK_ECHO_FAIL_MODE=reset|503` để giả lập upstream chập chờn. Image `gthanh/app_tra_cuu:mock-echo-v1` (đã push, chạy bằng user `node`).

### Đợt 2: danh mục, map một lần, múi giờ, query param, API giả
- **Sửa lỗi nghiêm trọng của bản trước**: `config.schema.json` không cho phép `displayFormat` (`additionalProperties: false`), nên chọn format hiển thị trong form admin sẽ bị từ chối khi lưu. Đã thêm vào schema (kèm test hồi quy).
- **Map 1 lần**: `name` của trường input/output chính là key của API (`soHC`, `ngaySinh`), `label` là tên hiển thị; bỏ `mapTo`/`from` khỏi form và `config.json`. Config cũ có `mapTo`/`from` vẫn chạy. Script chuyển đổi: `node scripts/migrate-config-single-key.js <config.json> --write`. Tiêu đề nhóm kết quả lấy từ `output.labelField` (mặc định `fullName`, rồi đến định danh). `from` chỉ còn dùng cho đường dẫn lồng nhau (`data.hoTen`) trong mục nâng cao.
- **Danh mục (enum dictionary)**: `dictionaries` ở cấp cao của config; trường input dùng `optionsRef`, trường output dùng `valueMapRef`. Trang **Quản trị → Danh mục** (`/quan-tri/danh-muc`) xem/sửa bảng key-giá trị, thấy danh mục đang được trường nào dùng; không xóa được danh mục đang dùng. Sửa danh mục có hiệu lực ngay, không cần restart. API: `GET/PUT/DELETE /admin/dictionaries[/:name]`.
- **Múi giờ**: output field có `sourceTimeZone` (múi giờ của API thật cho giờ không kèm múi giờ, mặc định UTC) và `displayTimeZone` (hiển thị, mặc định Asia/Ho_Chi_Minh); chọn trong form admin, kiểm tra tên IANA khi lưu.
- **Query param tĩnh**: `transport.queryParams` (`{"tab":"1"}` thành `?tab=1`), nhập ở form admin.
- **Log transaction**: mỗi lần gọi upstream ghi `upstream -->` / `upstream <--` (trạng thái, ms, attempt); `X-Request-Id` của app được gửi sang upstream để nối log hai phía.
- **API giả dạng echo** (`scripts/mock-echo-server.js`, `docker/mock-echo.Dockerfile`): mọi method/path trả 200 kèm bản ghi mặc định + `echo` (method, URL, query, header đã che, body), log từng request/response. Env: `PORT`, `MOCK_ECHO_RESPONSE`, `MOCK_ECHO_DELAY_MS`, `MOCK_ECHO_STATUS`.
- **Form admin URL/API key**: chọn "Nhập tay" trước đây đặt giá trị về rỗng và ẩn luôn ô nhập (nên trường trông như biến mất); nay giữ giá trị và hiện ô nhập. Có cảnh báo khi biến môi trường chưa được đặt trên server API.
- **Giới hạn**: `deploy-check/config` (bản phát hành) chưa chuyển sang định dạng mới, cập nhật khi build bản phát hành kế tiếp. Bản ghi lịch sử cũ giữ tên tham số cũ.

### Log backend dạng text, ghi file
- Định dạng `YYYY-MM-DD HH:mm:ss,SSS - LEVEL - context - message` (context đóng vai threadName), thay cho JSON pino. `LOG_LEVEL`, `LOG_TIMEZONE` (mặc định Asia/Ho_Chi_Minh), `LOG_FILE` (tùy chọn, vd `/var/log/app/api.log`).
- Mỗi request có dòng `-->` khi vào và `<--` khi trả (status, ms, requestId, user); không ghi body/query string. Lỗi 4xx ghi WARN, 5xx ghi ERROR kèm stack. `QueryService` ghi `query start/ok/failed` kèm nguyên nhân thật của lỗi upstream (trước đây bị nuốt).
- `docker-compose.prod.yml`: mount `./logs:/var/log/app` và `LOG_FILE`; entrypoint chown thư mục log cho user `node`. Cần build lại image api.

## 2026-11-13

### Bảo mật: vá libxslt trong image web (giữ nguyên tag `web-v15`)
- `libxslt` trong image web (`nginx:1.27-alpine`, Alpine 3.21) là `1.1.42-r2`, dính 4 CVE được vá ở `1.1.42-r3`
  (CVE-2025-10911, CVE-2026-9947, CVE-2026-87636, CVE-2026-125350 — theo secdb Alpine). Image api chạy Debian và không cài libxslt nên không ảnh hưởng.
- Nguyên nhân bản cũ còn `r2`: `web.Dockerfile` đã có `apk upgrade` nhưng lớp runtime bị Docker cache giữ kết quả cũ.
  Không đổi mã nguồn/Dockerfile; build lại lớp runtime không cache: `docker build --no-cache-filter runtime -f docker/web.Dockerfile -t gthanh/app_tra_cuu:web-v15 .`
- Kiểm tra sau build: libxslt `r2 → r3`, nginx `1.27.5` và nội dung `/usr/share/nginx/html` không đổi (cùng mã băm), `nginx -t` ok, `GET /` 200.
- **Đã ghi đè tag `web-v15` trên Docker Hub** (digest `sha256:8841c17c3743379fa2074ccd2cf66e17612cbbc6e20a22ae0a265a7b99628ac1`).
  Máy nào đã pull `web-v15` trước đó phải `docker pull gthanh/app_tra_cuu:web-v15` rồi `up -d` lại để nhận bản vá.

## 2026-11-12

### Tính năng: monitor đầu vào/đầu ra của mọi request (admin)
- Mỗi lần tra cứu lưu thêm 3 phần vào bảng riêng `app.query_log_payloads`: request gửi upstream (method, url, header, body, lần thử),
  phản hồi upstream (mã HTTP, thời gian, body, kể cả body lỗi 4xx/5xx/timeout) và phản hồi trả client (kể cả lỗi/từ chối quyền/validate).
- API `GET /history/:id/payload` (quyền mới `history:view_payload`, chỉ ADMIN qua seed; mỗi lần xem ghi audit `query_log.view_payload`).
  Giá trị lưu và hiển thị **nguyên văn**, không che. User thường không có quyền này.
- Giao diện: dialog chi tiết ở Lịch sử có tab **Đầu vào / Đầu ra** (xem JSON, copy, tải .json).
- Không bao giờ lưu giá trị header xác thực/API key (`[redacted]`); ảnh base64 không lưu, thay bằng kích thước + sha256 + mime.
- Mỗi phần tối đa `QUERY_LOG_PAYLOAD_MAX_BYTES` (mặc định 2 MB), vượt thì cắt và đánh dấu. Tắt toàn bộ bằng `QUERY_LOG_PAYLOAD_ENABLED=false`.
- **Không tự xóa theo thời gian** (theo yêu cầu): cần theo dõi dung lượng bảng `query_log_payloads` ở môi trường chạy lâu.
- Migration `20261112150000_add_query_log_payloads`. Sau khi nâng cấp phải chạy lại `db:seed` để ADMIN nhận quyền mới.
- Bản ghi tạo trước bản này không có nội dung (tab báo "chưa lưu").

## 2026-11-11

### Thay đổi hành vi (cần biết khi nâng cấp)
- **Thống kê**: preset mặc định đổi từ "Hôm nay" sang **7 ngày qua** (`last_7d`).
- **Thống kê**: ngưỡng tự động gom theo ngày → tháng đổi từ 92 sang **90 ngày**.
- **Lịch sử**: khoảng thời gian là **nửa mở `[from, to)`** theo giờ VN. Trước đây `to` dùng `lte` và `YYYY-MM-DD`
  parse theo UTC nên lệch 7 giờ so với ngày VN. Nay `to` dạng ngày bao trọn ngày đó; `to` có giờ:phút (FE) gồm cả phút đã chọn.
- **Quyền mới `history:export`**: chỉ ADMIN có (seed). Role khác phải tick thủ công nếu cần xuất CSV.
- **IP khi ghi log**: `::ffff:x.x.x.x` được lưu thành `x.x.x.x`; IP không hợp lệ (ví dụ `X-Forwarded-For` rác) lưu `NULL`
  thay vì làm mất dòng log.
- **Sắp xếp theo `createdAt`** bỏ `NULLS LAST` (cột NOT NULL) để dùng index; kết quả không đổi.

### Thêm
- **Drill-down Thống kê → Lịch sử**: mọi thẻ, cột biểu đồ, dòng datasource và mã lỗi đều bấm được và mở Lịch sử
  với đúng bộ lọc (bảng `STATS_COUNTER_HISTORY_FILTER` trong `packages/shared`).
- **Bộ lọc Lịch sử mới** (một where-builder dùng chung cho Thống kê, Lịch sử, CSV, Phân tích): `outcome`
  (answered/empty/gap), `statusCode`, `errorCode`, `ip`, `durationMinMs`/`durationMaxMs`, `hasRecords`,
  `upstreamRequestId`, `offHours`; token `__null__`. Toàn bộ bộ lọc nằm trên URL.
- **Lịch sử**: sắp theo thời gian / thời gian xử lý / số bản ghi; tổng hợp (tổng, tỉ lệ thành công, p95);
  dialog chi tiết với liên kết tới user, IP, mã lỗi; `GET /history/summary`, `GET /history/datasources`.
- **Thống kê**: thêm preset 24 giờ, 7 / 30 / 90 ngày, tháng trước; chọn granularity thủ công; so sánh kỳ trước (±%).
- **Phân tích** (`/quan-tri/phan-tich-tra-cuu`, quyền `history:view_all`): top user, top lỗi, độ trễ theo nguồn,
  hoạt động theo user và theo IP, bất thường (tăng đột biến, ngoài giờ, CCCD dùng chung, IP dùng chung).
- **Xuất CSV**: Lịch sử tối đa 50.000 dòng, Phân tích tối đa 100 dòng/bảng; chống CSV injection; cần `history:export`.
- **Audit**: 6 action mới (`query_log.view_detail`, `query_log.export_csv`, `query_log.view_user_activity`,
  `query_log.view_ip_activity`, `query_insights.view_anomalies`, `query_insights.export_csv`), ghi bộ lọc, không ghi response.
- **Biến `TRUST_PROXY`** (mặc định tắt): IP thật sau reverse proxy. Giá trị sai được cảnh báo và bỏ qua.
- **2 index** `query_logs(ip, created_at DESC)` và `query_logs(upstream_request_id)` (migration `20261111180000_...`).
- Tài liệu: [`query-log-drilldown-and-insights.md`](./query-log-drilldown-and-insights.md) (mới),
  [`system-architecture.md`](./system-architecture.md) (mới), [`query-stats-dashboard.md`](./query-stats-dashboard.md) (cập nhật).

### Giới hạn đã biết
- `records` là số bản ghi trong các trang đã trả về, không phải tổng dữ liệu nguồn.
- Log ghi trước khi có cột `status_code` không có mã HTTP (hiển thị "—").
- Chưa kiểm tra giao diện trên trình duyệt thật.
- Chưa có retention/dọn `query_logs` (cần quyết định chính sách lưu giữ).
- Ngưỡng bất thường và giờ làm việc là giá trị tạm, cần xác nhận nghiệp vụ.
- `apps/api/test/query.e2e-spec.ts` fail 5/7 từ trước: dùng datasource `CITIZEN_BASIC` đã tắt trong `config.json`, không do tính năng này.

### Triển khai
- Quyền `admin:query_stats` và `history:export` do `seed` tạo; ADMIN tự có. Role khác cần tick quyền thủ công.
  Dùng PG có sẵn: chạy lại `seed` 1 lần sau khi nâng cấp (xem [`deployment-guide.md`](./deployment-guide.md)).
- Migration 2 index: bảng lớn nên tạo bằng `CREATE INDEX CONCURRENTLY` trước, rồi `prisma migrate resolve --applied`
  (xem [`deployment-guide.md`](./deployment-guide.md#nâng-cấp-lên-image-có-drill-down-và-phân-tích)).
- Đặt `TRUST_PROXY` đúng nếu API đứng sau nginx/proxy, nếu không trang IP và "IP dùng chung" sẽ sai.

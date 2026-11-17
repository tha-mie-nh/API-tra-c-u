# 08. Lịch sử tra cứu, log và truy vết, cấu hình và triển khai (HIS, LOG, CFG, DEP)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md). Nên chạy **sau** các file 05-07 để có sẵn nhiều lượt tra cứu (thành công, lỗi 401 của `SA_IMAGES_BADKEY`, lỗi 502/504 của `T_FLAKY`).
Trang: **Lịch sử tra cứu** (`/lich-su`). Bộ lọc: **Tên đăng nhập**, **API**, **Trạng thái** (`Thành công`/`Thất bại`/`Bị từ chối`), **Từ ngày**, **Đến ngày**, nút **Tìm lịch sử**. Bảng: **Thời gian**, **Người dùng**, **API**, **Tóm tắt điều kiện**, **Trạng thái**, **Số bản ghi**, cột **Chi tiết** (nút **Xem chi tiết**).

---
## HIS-01 Mỗi lượt tra cứu có đúng một dòng lịch sử (P1)
**Các bước:** ghi số dòng hiện có (hoặc lọc **API** = `SA_SEARCH_GET`). Tra cứu `SA_SEARCH_GET` `param1=val1`, `count=2` **đúng 3 lần**; mở lại **Lịch sử tra cứu** và bấm **Tìm lịch sử**.
**Kết quả mong đợi:** tăng đúng **3** dòng, dòng mới nhất ở trên cùng, cột **Người dùng** `pwtest`, **API** là tên nguồn, **Trạng thái** **Thành công**, **Số bản ghi** `2`, **Tóm tắt điều kiện** nêu `param1`, `count`.
**Đối chiếu:** `docker exec app-tra-cuu-du-lieu-postgres-1 psql -U app_user -d app_tra_cuu -tAc "select count(*) from app.query_logs where datasource_code='SA_SEARCH_GET' and created_at > now() - interval '5 minutes'"` bằng số lượt bạn vừa làm.

---
## HIS-02 Lỗi ghi đúng mã và nguyên nhân (P1, lỗi đã báo)
**Các bước:** lọc **API** = `SA_IMAGES_BADKEY`; bấm **Xem chi tiết** dòng mới nhất, tab **Tổng quan**.
**Kết quả mong đợi:** **Trạng thái** **Thất bại**; trong chi tiết: mã HTTP `502`, mã lỗi **`UPSTREAM_UNAUTHORIZED`**, **Thông báo lỗi** `Upstream rejected the access key (HTTP 401)`; **Số bản ghi** `0`, **Thời gian xử lý** vài ms. Với `T_FLAKY` ở RES-03 (404): mã lỗi `UPSTREAM_ERROR`, thông báo `Upstream datasource returned HTTP 404`; với RES-04: `UPSTREAM_TIMEOUT` mã 504.
**Thử thêm:** lọc **Trạng thái** = **Thất bại** chỉ ra các dòng lỗi; **Thành công** chỉ ra các dòng còn lại.

---
## HIS-03 Phạm vi xem: người thường chỉ thấy của mình (P1)
**Các bước:** đăng nhập `tester_a` (vai trò `Người thử` có `history:view_own`), tra cứu `SA_SEARCH_GET` một lần, mở **Lịch sử tra cứu**.
**Kết quả mong đợi:** chỉ thấy lượt của **`tester_a`**, **không** thấy lượt của `pwtest`; bộ lọc **Tên đăng nhập** không cho xem người khác. Với `pwtest` (có quyền xem tất cả) lọc **Tên đăng nhập** = `tester_a` thấy dòng đó.
**Đối chiếu API:** `curl -s localhost:3000/api/v1/history -H "authorization: Bearer $TA" | node -pe 'const r=JSON.parse(require("fs").readFileSync(0));[...new Set((r.items||r.data).map(x=>x.username))].join(",")'` chỉ ra `tester_a`.

---
## HIS-04 Chi tiết: xem chính xác gửi gì và nhận gì (P1)
**Các bước:** với `pwtest`, tra cứu `T_ECHO_POST` (file 03, đã có `tab=1` và header `X-ReqType`) `Số hộ chiếu`=`B777`. Mở **Lịch sử tra cứu** → dòng mới nhất → **Xem chi tiết**. Xem lần lượt tab **Tổng quan**, **Đầu vào**, **Đầu ra**.
**Kết quả mong đợi:**
- **Đầu vào** có hai khung: **Người dùng gửi lên (đầu vào)** (`{"params":{"soHC":"B777"}}`) và **API này gửi tới upstream** với **Phương thức** `POST`, **URL** `http://localhost:4200/find?tab=1&soHC=B777`, **Header** gồm `x-reqtype: LOOKUP`, `x-request-id: web-...`, **Body** (rỗng nếu mọi trường là query), **Lần thử** `1`.
- **Đầu ra** có **Upstream phản hồi** (trạng thái HTTP `200`, thời gian, body có `data.items`) và **Phản hồi trả về cho người dùng**.
- Mỗi khung có nút sao chép và **Tải .json**; hiển thị số dòng và bytes.
- Header chứa khóa (ví dụ ở nguồn `SA_IMAGES`: `X-Access-Key`) hiện **`[redacted]`**, **không** có `my-secret-key`.
**Đối chiếu:** `grep -c "my-secret-key" /tmp/dev2.log` ra **0**; trong DB: `select upstream_request::text from app.query_log_payloads p join app.query_logs l on l.id=p.query_log_id where l.datasource_code='SA_IMAGES' order by l.created_at desc limit 1` không chứa `my-secret-key`.
**Thử thêm:** đăng nhập `tester_a` (không có quyền xem payload) mở chi tiết cùng lượt của chính họ: các tab **Đầu vào/Đầu ra** hiện **Bạn không có quyền xem nội dung đầu vào/đầu ra của request này.**

---
## HIS-05 Bộ lọc và thời gian (P1)
**Các bước:** (1) **Từ ngày** = hôm nay, **Đến ngày** = hôm nay → **Tìm lịch sử**. (2) **Từ ngày** = ngày mai. (3) sao chép URL trang sau khi lọc rồi mở trong tab mới.
**Kết quả mong đợi:** (1) có các lượt hôm nay (khoảng thời gian tính theo **giờ Việt Nam**, gồm trọn ngày "Đến ngày"); (2) **Không có lịch sử tra cứu nào.**; (3) tab mới hiện cùng bộ lọc và cùng kết quả (bộ lọc nằm trên URL). Khối **Tóm tắt theo bộ lọc hiện tại** có **Tổng lượt tra cứu**, **Tỉ lệ thành công**, **TB thời gian xử lý**, **p95 thời gian xử lý** khớp với số dòng đang lọc.

---
## HIS-06 Xuất CSV (P1)
**Các bước:** với `pwtest` ở trang lịch sử bấm **Xuất CSV** (nút đổi thành **Đang xuất…**).
**Kết quả mong đợi:** tải về file `.csv`; thông báo **Đã xuất N dòng** với N bằng số dòng đang lọc; mở bằng trình soạn thảo thấy dòng tiêu đề tiếng Việt và dữ liệu đúng. Ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm dấu nháy đơn đầu (chống chèn công thức). Người không có quyền xuất (`tester_a`) **không** thấy nút **Xuất CSV**.
**Đối chiếu:** `wc -l <file.csv>` bằng N + 1 (dòng tiêu đề).

---
## LOG-01 Một lượt tra cứu để lại chuỗi log đầy đủ cùng mã truy vết (P1)
**Các bước:** bật `tail -f /tmp/dev2.log | grep --line-buffered "apps/api dev"`. Tra cứu `SA_SEARCH_GET` một lần. Mở Network lấy `X-Request-Id` của request `query` (dạng `web-xxxxxxxxxxxxxxxxxxxxxxxx`).
**Kết quả mong đợi:** thấy **đúng 6 dòng** có cùng `requestId=<mã đó>`, theo thứ tự:
1. `... - INFO - HttpRequest - --> POST /api/v1/query/SA_SEARCH_GET requestId=web-... ip=...`
2. `... - INFO - QueryService - query start datasource=SA_SEARCH_GET user=pwtest requestId=web-... page=1`
3. `... - INFO - HttpInfoAdapter - upstream --> GET http://localhost:8000/search?... ds=SA_SEARCH_GET attempt=1 requestId=web-...`
4. `... - INFO - HttpInfoAdapter - upstream <-- 200 ds=SA_SEARCH_GET attempt=1 <N>ms requestId=web-...`
5. `... - INFO - QueryService - query ok datasource=SA_SEARCH_GET requestId=web-... records=<n> tookMs=<N>`
6. `... - INFO - HttpRequest - <-- POST /api/v1/query/SA_SEARCH_GET 200 <N>ms requestId=web-... user=pwtest`
Mỗi dòng bắt đầu bằng thời gian dạng `2026-11-17 09:12:34,567`, kế đó ` - MỨC - ngữ cảnh - nội dung`.
**Đối chiếu:** `grep "requestId=web-<mã>" /tmp/dev2.log | wc -l` ra **6**.

---
## LOG-02 Log không chứa dữ liệu nhạy cảm (P1)
**Các bước:** tra cứu `T_ECHO_POST` với `Số hộ chiếu` = `CCCD-079099001234-BI-MAT`; sau đó `grep -c "079099001234" /tmp/dev2.log`.
**Kết quả mong đợi:** ra **0**: giá trị tra cứu **không** nằm trong log (log chỉ có đường dẫn, mã yêu cầu, người dùng, thời gian; **không có** body hay query string). Thêm: `grep -c "my-secret-key" /tmp/dev2.log` ra **0**. (Giá trị tra cứu chỉ xem được trong **Lịch sử → chi tiết** bởi người có quyền.)

---
## LOG-03 Khớp log của giao diện với log backend (P1)
**Các bước:** làm nhiều lần cho đến khi gặp một lỗi (ví dụ tra cứu `SA_IMAGES_BADKEY`). Mở **Console**: có dòng `[api] 502 POST /query/SA_IMAGES_BADKEY code=UPSTREAM_UNAUTHORIZED requestId=...`. Chép `requestId`.
**Kết quả mong đợi:** `grep "<requestId>" /tmp/dev2.log` thấy chuỗi dòng của lượt đó, trong đó dòng `WARN`/`ERROR` nêu nguyên nhân (`upstream <-- 401`, `query failed ... code=UPSTREAM_UNAUTHORIZED`).
**Quy tắc đọc khi một request "treo":** không có dòng `-->` nào ⇒ request **chưa tới** máy chủ (lỗi mạng giữa trình duyệt và API); có `-->` nhưng không có `upstream -->` ⇒ kẹt **trước khi** gọi upstream; có `upstream -->` mà không có `upstream <--` ⇒ **upstream** không trả lời.

---
## LOG-04 Giao diện chỉ ghi cảnh báo và lỗi (P2)
**Các bước:** mở **Console**, xóa log, thao tác bình thường: đăng nhập, vào vài trang, tra cứu thành công, chuyển trang kết quả.
**Kết quả mong đợi:** Console **trống** (không có `[api]` nào). Gây lỗi 422 (nhập `Số lượng` = `99` rồi gọi API trực tiếp bằng `q`) hoặc 401 (AUTH-07) thì mới có `[api] ...` kèm `requestId`.

---
## LOG-05 Mã truy vết đi tới upstream và chống chèn dòng log (P1)
**Các bước:** (a) tra cứu `T_ECHO_POST` rồi `docker logs --tail 3 echo-mock` lấy `requestId=` ở dòng `-->`; so với `X-Request-Id` của request `query` trong Network. (b) thử mã độc hại, mỗi lệnh một lần:
```bash
curl -si localhost:3000/api/v1/health -H 'X-Request-Id: abc def'        | grep -i '^x-request-id'   # có dấu cách
curl -si localhost:3000/api/v1/health -H "X-Request-Id: $(printf 'a%.0s' $(seq 1 70))" | grep -i '^x-request-id' | cut -c1-60   # 70 ký tự
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/v1/health -H $'X-Request-Id: x\nFAKE LOG LINE'              # có xuống dòng
curl -si localhost:3000/api/v1/health -H 'X-Request-Id: web-ok.1_2'     | grep -i '^x-request-id'   # hợp lệ
grep -c "FAKE LOG LINE" /tmp/dev2.log
```
**Kết quả mong đợi:** (a) hai mã **trùng nhau**. (b) dòng 1 và 2: máy chủ trả về một **UUID mới** (mã gửi lên bị bỏ vì không hợp lệ); dòng 3: **`400`** (máy chủ từ chối header có xuống dòng); dòng 4: trả lại đúng `web-ok.1_2`; dòng cuối: **`0`** (không có dòng log giả). Quy tắc: chỉ nhận mã gồm chữ, số, `.`, `_`, `-`, dài 1-64 ký tự.

---
## CFG-01 Schema trong image thắng schema cũ trong thư mục config (P1)
**Chạy sau khi đã build lại image `api` mới** (Dockerfile có dòng `COPY config/config.schema.json schema/config.schema.json`). Đây là phép thử trực tiếp cho lỗi **"must NOT have additional properties"**.
**Các bước**
1. Đưa schema **cũ** vào thư mục config được mount của stack test: `git show 2a5c307~1:deploy-check/config/config.schema.json > deploy-check/config/config.schema.json`.
2. `docker compose -f docker-compose.test.yml --env-file .env.test pull && docker compose -f docker-compose.test.yml --env-file .env.test up -d` (image `api` mới), đăng nhập http://localhost:8081 bằng `admin`.
3. **Quản trị → Nguồn dữ liệu** → **Sửa** một nguồn → đặt **Trường làm tiêu đề (labelField)** và **Hiển thị cho người dùng (displayFormat)** ở một trường ngày → **Lưu**.
**Kết quả mong đợi:** lưu **thành công**; **không** có thông báo **must NOT have additional properties**. Đối chứng: với image **cũ** (`api-v12`) cùng các bước phải hiện đúng lỗi đó.
Dọn: `git checkout deploy-check/config/config.schema.json deploy-check/config/config.json`.

---
## CFG-02 Cấu hình cũ có `mapTo`/`from` vẫn chạy (P1)
**Các bước:** lấy cấu hình trước lần chuyển đổi: `git show 93964e1~1:config/config.json > /tmp/old-style.json`; chạy API với `APP_CONFIG_PATH=/tmp/old-style.json` (dev: đặt biến rồi chạy lại `pnpm dev`) hoặc đọc kết quả của unit test; đăng nhập, tra cứu một nguồn trong file đó.
**Kết quả mong đợi:** API khởi động, tra cứu ra kết quả đúng như trước. Chuyển sang kiểu mới: `node scripts/migrate-config-single-key.js /tmp/old-style.json` (chỉ in thay đổi) rồi `--write`; chạy lại ra kết quả như cũ.

---
## CFG-03 Giá trị mặc định (`defaults`) được áp dụng (P1)
**Các bước:** nguồn thử `T_FLAKY` **không** khai báo retry/timeout; làm RES-01.
**Kết quả mong đợi:** có `retrying after attempt 1/3` (=`defaults.retry.attempts` 2 → tổng 3 lần). Xem mặc định trong `config.json`: `node -pe 'JSON.stringify(require("./config/config.json").defaults)'` ra `{"maxResults":100,"pageSize":20,"timeoutMs":10000,"retry":{"attempts":2,"backoffMs":300}}`. Sửa `defaults.retry.attempts` thành `0`, reload: RES-01 lần này **báo lỗi 502** ngay lần đầu (không thử lại). Trả lại `2`.

---
## DEP-01 Stack đóng gói khởi động và truy cập đúng cổng (P1)
**Các bước:** `docker compose -f docker-compose.prod.yml --env-file .env.prod ps` (hoặc `docker-compose.test.yml` với `.env.test`).
**Kết quả mong đợi:** `postgres`, `api`, `web` đều **healthy**; `migrate`, `seed`, `config-perms` ở **Exited (0)** (bình thường). Chỉ `web` công bố cổng ra máy chủ (`80` cho prod, `8081` cho test); `api` **không** công bố cổng (`3000/tcp` không có `->`). `curl -s localhost:80/api/v1/health` (qua nginx) ra `ok`; giao diện và API cùng địa chỉ (không có CORS).

---
## DEP-02 Nâng cấp giữ dữ liệu cũ (P1)
**Các bước:** (1) chạy stack với image cũ `api-v12`/`web-v15`, tạo một người dùng và tra cứu vài lượt. (2) đổi sang image mới trong compose, `up -d`. (3) đăng nhập người dùng đó, mở **Lịch sử tra cứu**.
**Kết quả mong đợi:** migration chạy xong (`migrate` Exited (0)); người dùng và lịch sử cũ **còn nguyên**; lượt tra cứu cũ hiện bình thường (cột không có dữ liệu hiện `—`).

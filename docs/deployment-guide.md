# Hướng dẫn triển khai

Deploy nội bộ — không mở ra internet, chỉ cần mạng LAN/VPN tới được server. Từ server trống tới
lúc app chạy được.

## Yêu cầu

- Server Linux (Ubuntu 22.04+), quyền `sudo`, trong mạng nội bộ/VPN.
- Mở port **80** trong mạng nội bộ. App chạy HTTP thuần, không tự có HTTPS — xem mục "Về HTTPS".
- Internet tạm thời lúc pull image lần đầu/khi cập nhật; sau đó chạy hoàn toàn nội bộ.

## Bước 0 — Cài Docker (bỏ qua nếu đã có)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Đăng xuất/đăng nhập lại rồi kiểm tra:

```bash
docker --version && docker compose version
```

Cần Docker Compose **v2** (`docker compose`, có dấu cách) — script trên tự cài kèm.

## Bước 1 — Lấy bộ file deploy

Nhận file **`deploy-check.zip`** qua kênh an toàn (không qua email/chat thường — bên trong có
`.env.prod` chứa secret thật). Giải nén:

```bash
mkdir -p /opt/app-tra-cuu
unzip deploy-check.zip -d /opt/app-tra-cuu
cd /opt/app-tra-cuu/deploy-check
```

```
deploy-check/
├── docker-compose.prod.yml
├── .env.prod
├── config/                        (config.json, config.schema.json, mock-data/)
├── schema/                        (3 file .sql — chỉ cần nếu dùng PG có sẵn, xem "Về Postgres")
├── deployment-guide.md            (file này)
├── docker-images-explained.md     (tùy chọn — giải thích image Docker đóng gói gì)
└── docker/                        (tùy chọn — bản gốc Dockerfile)
```

4 mục đầu cần để chạy app (`schema/` chỉ cần nếu không dùng Postgres tự chứa). `docker/` và
`docker-images-explained.md` chỉ để đọc/kiểm tra trước khi tin tưởng chạy, không bắt buộc.

## Bước 2 — Sửa `.env.prod` (thường không cần)

Mặc định chạy ngay ở `http://<IP-server>`. Chỉ sửa khi cần:

| Biến | Khi nào sửa |
|---|---|
| `WEB_PORT` | đổi cổng 80 sang cổng khác |
| `CORS_ORIGIN` | chỉ khi tách FE/BE ra 2 origin khác nhau |
| `COOKIE_SECURE` | đổi `true` khi có proxy/gateway khác đứng trước lo HTTPS |

```bash
chmod 600 .env.prod
nano .env.prod
```

Không commit, không gửi qua chat/email không mã hóa.

## Bước 3 — Chạy

Image public trên Docker Hub (`gthanh/app_tra_cuu:api-*`/`web-*`) — không cần `docker login`.
Tag ghi sẵn trong `docker-compose.prod.yml`.

```bash
cd /opt/app-tra-cuu/deploy-check
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

`pull` là bước duy nhất cần internet. Thứ tự tự động: postgres → migrate → seed → api → web
(`postgres`/`migrate`/`seed` chỉ chạy ở chế độ tự chứa; chế độ dùng PG có sẵn chỉ còn api → web,
xem "Về Postgres"). ~30-60s.

## Bước 4 — Kiểm tra

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl http://localhost/api/v1/health
```

Chế độ tự chứa: 3 dòng `postgres/api/web` phải `Up (healthy)`. Chế độ PG có sẵn: 2 dòng
`api/web`, không có `postgres` — đúng như vậy. `migrate`/`seed` không hiện trong `ps`
(chạy 1 lần rồi tắt) — `ps -a` thấy `Exited (0)` là bình thường.

Mở trình duyệt `http://<IP-server>` → thấy trang đăng nhập.

## Bước 5 — Đăng nhập

- Tài khoản: `admin`
- Mật khẩu: `grep BOOTSTRAP_ADMIN_PASSWORD .env.prod`
- Bắt buộc đổi mật khẩu lần đầu. Sau khi đổi, mật khẩu trong `.env.prod` **không còn dùng được**
  (chỉ là mật khẩu khởi tạo) — dùng mật khẩu mới.

**Tài liệu API (Swagger)**: `http://<IP-server>/api/v1/docs` — sinh tự động từ code, luôn khớp
API thật. Bấm "Authorize" rồi dán access token (lấy từ response của `POST /api/v1/auth/login`,
hoặc copy từ devtools trình duyệt sau khi đăng nhập qua giao diện) để test được cả route cần
đăng nhập.

## Về Postgres — tự chứa hay dùng PG có sẵn

2 chế độ, chọn bằng biến `COMPOSE_PROFILES` trong `.env.prod`.

**Chế độ 1 — Tự chứa (mặc định, `COMPOSE_PROFILES=local-db,db-setup`)**: app tự chạy 1 Postgres
riêng (`postgres-data` volume), tự tạo schema + bảng + tài khoản admin lúc `up -d`. Không phụ
thuộc gì bên ngoài — dùng khi demo/test.

**Chế độ 2 — Dùng PG có sẵn**: khi đã có 1 Postgres server dùng chung cho nhiều app. App
**không tự ý tạo/sửa gì trên Postgres đó** — bên quản lý Postgres tự áp schema bằng công cụ của
họ, theo đúng quy trình họ muốn.

1. Áp schema vào Postgres đó: 3 file SQL trong thư mục `schema/` (`01-init.sql`,
   `02-add-password-reset-requests.sql`, `03-add-status-code-to-query-logs.sql`), chạy **đúng
   thứ tự số** bằng công cụ bất kỳ (psql, DBeaver, DataGrip...):
   ```bash
   psql -h <host> -U <user> -d <database> -f schema/01-init.sql
   psql -h <host> -U <user> -d <database> -f schema/02-add-password-reset-requests.sql
   psql -h <host> -U <user> -d <database> -f schema/03-add-status-code-to-query-logs.sql
   ```
   File `01-init.sql` tự tạo schema `app` (`CREATE SCHEMA IF NOT EXISTS "app"`) — không đụng
   tới schema nào khác của hệ thống. Cần quyền tạo schema + extension `pgcrypto` trên
   `<database>` đó (chỉ 1 lần lúc áp schema).
2. Trong `.env.prod`: xóa dòng `COMPOSE_PROFILES=local-db,db-setup` (để trống) — container
   `postgres`/`migrate`/`seed` sẽ không chạy nữa. Sửa `DATABASE_URL` trỏ sang Postgres đó:
   ```
   DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?schema=app
   ```
3. Chạy Bước 3 (`pull`/`up -d`) — chỉ còn `api`/`web` khởi động, `api` kết nối thẳng vào
   schema đã có sẵn.
4. Tạo tài khoản admin đầu tiên (1 lần, không tự động):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod --profile db-setup run --rm seed
   ```
   Lệnh này chỉ tạo role/quyền/tài khoản admin — không đụng gì tới cấu trúc bảng. Chạy **sau
   khi `api` đã khởi động** (bước 3) thì ADMIN được cấp luôn các quyền `api:*` đã đồng bộ; thêm
   datasource sau này thì chạy lại lệnh này (xem "4 API thật" bước 4).

Ở chế độ 2, chỉ còn `api`/`web` là image tự quản lý/cập nhật — Postgres do bên vận hành Postgres
đó lo backup/vận hành/áp schema mới sau này (mỗi lần có thay đổi, nhận thêm file `.sql` mới áp
tương tự).

`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` trong `.env.prod` vẫn giữ nguyên giá trị dù
không dùng tới — chỉ là input cho container `postgres` tự chứa, không tham gia kết nối thật
(việc đó do `DATABASE_URL`).

## Biến môi trường (`.env.prod`)

| Biến | Dùng để làm gì | Cần sửa? |
|---|---|---|
| `COMPOSE_PROFILES` | `local-db,db-setup` = tự chứa + tự tạo schema/admin; trống = dùng PG có sẵn | Xem "Về Postgres" |
| `NODE_ENV` | Luôn `production` | Không |
| `PORT` | Cổng nội bộ `api` trong container | Không |
| `APP_CONFIG_PATH` | Đường dẫn `config.json` trong container | Không |
| `LOG_LEVEL` | Độ chi tiết log | Không |
| `COOKIE_SECURE` | Cookie đăng nhập có bắt buộc HTTPS | Xem "Về HTTPS" |
| `WEB_PORT` | Cổng `web` ra ngoài (mặc định 80) | Chỉ nếu đổi cổng |
| `CORS_ORIGIN` | Origin được phép gọi API | Chỉ nếu tách FE/BE 2 origin |
| `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` | Tài khoản Postgres tự chứa | Không |
| `DATABASE_URL` | Chuỗi kết nối Postgres thật | Chỉ ở chế độ PG có sẵn |
| `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` | Khóa ký JWT, đã sinh sẵn | Không |
| `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` | Thời hạn access/refresh token | Không |
| `AUTH_LOGIN_MAX_ATTEMPTS`/`AUTH_LOCKOUT_MINUTES` | Ngưỡng tự khóa tài khoản | Không |
| `LOGIN_THROTTLE_LIMIT`/`LOGIN_THROTTLE_TTL_MS` | Giới hạn gọi `/auth/login` | Không |
| `QUERY_THROTTLE_LIMIT`/`QUERY_THROTTLE_TTL_MS` | Giới hạn lượt tra cứu/người dùng | Không |
| `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` | Admin đầu tiên, tự tạo lúc `seed` | Không |
| `CITIZEN_BASIC_*`/`CITIZEN_EXT_*`/`CITIZEN_RESIDENCE_*` | Datasource demo cũ, đã tắt | Không |
| `IMMIGRATION_HISTORY_*`/`PASSPORT_INFO_*`/`DRIVER_LICENSE_*`/`FACE_PHOTO_*` | `BASE_URL`/`API_KEY` của 4 API thật, đang mock | Chỉ khi có API thật |
| `ALLOW_MOCK_DATASOURCES` | Cho phép chạy datasource mock | `false` khi hết mock |

**4 API thật — cách bật:**

1. Điền `BASE_URL`/`API_KEY` của 4 biến trên trong `.env.prod`.
   - `BASE_URL` phải là địa chỉ mà **container `api`** tới được. `localhost` trong container là
     chính container đó, **không phải máy host** — dùng IP/DNS thật của máy chạy API (vd
     `http://172.22.142.171:4000`), và mở firewall giữa 2 máy nếu cần.
2. Trong `config/config.json`, tìm đúng datasource (`IMMIGRATION_HISTORY`, `PASSPORT_INFO`,
   `DRIVER_LICENSE`, hoặc `FACE_PHOTO`), sửa khối `"transport"` từ:
   ```json
   "transport": { "kind": "mock", "dataFile": "mock-data/immigration-history.json", "timeoutMs": 10000 }
   ```
   thành:
   ```json
   "transport": {
     "kind": "http",
     "baseUrl": "${IMMIGRATION_HISTORY_BASE_URL}",
     "path": "/duong-dan-that-cua-api",
     "method": "POST",
     "headers": { "X-ReqType": "gia-tri-header-co-dinh-theo-tai-lieu-API-that" },
     "auth": { "kind": "apiKeyHeader", "header": "X-Access", "valueEnv": "IMMIGRATION_HISTORY_API_KEY" },
     "timeoutMs": 10000
   }
   ```
   - `baseUrl`: luôn viết `${TÊN_BIẾN_BASE_URL}` — tự lấy giá trị từ `.env.prod`, không ghi URL
     thẳng vào đây.
   - `path`/`method`: copy đúng từ tài liệu API thật (đường dẫn, GET hay POST).
   - `headers`: mọi header **cố định, không đổi** theo tài liệu — điền bao nhiêu cặp tùy ý,
     tên key chính là tên header thật (vd `X-ReqType`).
   - `auth.header`: tên header **xác thực** theo tài liệu (`X-Access`, `X-Api-Key`... tùy API
     thật đặt tên gì, điền đúng tên đó). `auth.valueEnv`: tên biến env chứa giá trị thật (đã có
     sẵn, vd `IMMIGRATION_HISTORY_API_KEY`) — không ghi giá trị thật vào `config.json`.
   - Chỉ đổi `kind` sang `http` cho datasource **đang bật** (`enabled: true`). Datasource đang tắt
     để nguyên `mock` — `http` mà thiếu `baseUrl`/`path` có thể làm app lỗi lúc nạp config.
   - **Cấu trúc response của API thật phải khớp phần `output`** của datasource đó: `recordsPath`
     (vd `data.0.data`) và `from` của từng field. API thật trả JSON khác mẫu mock thì sửa
     `recordsPath`/`from` cho khớp, nếu không app trả rỗng hoặc thiếu field dù gọi thành công.
3. Áp dụng thay đổi — **chọn đúng lệnh**:
   ```bash
   # Đã sửa .env.prod (dù có sửa config.json hay không): tạo lại container để nạp env mới
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
   # Chỉ sửa config.json: restart là đủ
   docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
   ```
   Docker chỉ đọc `.env.prod` **lúc tạo container**; `restart` không nạp lại env, container sẽ
   vẫn dùng `BASE_URL`/`API_KEY` cũ. Không cần pull/rebuild.
4. **Cấp quyền tra cứu.** Menu "Tra cứu" chỉ hiện datasource mà user có quyền `api:<tên>` (vd
   `api:passport_info`). `api` tự tạo các quyền này từ `config.json` lúc khởi động nhưng **không
   cấp cho role nào**; chưa cấp thì menu trống dù kết nối đúng. Cấp bằng 1 trong 2 cách:
   - Giao diện: Quản trị → Vai trò & quyền → chọn role → tick các `api:*` cần dùng → lưu → user
     đăng nhập lại.
   - Cấp cho ADMIN tự động: chạy lại `seed` **sau khi `api` đã khởi động ít nhất 1 lần** (seed
     cấp cho ADMIN mọi quyền `api:*` đã đồng bộ; chạy lại bao nhiêu lần cũng an toàn):
     ```bash
     docker compose -f docker-compose.prod.yml --env-file .env.prod --profile db-setup run --rm seed
     ```
   Role khác (OPERATOR, AUDITOR) luôn phải cấp qua giao diện. Mỗi lần thêm datasource mới vào
   `config.json` cũng làm lại bước này.
5. Test thử qua giao diện (menu Tra cứu) hoặc Swagger (`/api/v1/docs`) → gọi
   `POST /api/v1/query/IMMIGRATION_HISTORY` với tham số thật, xem có trả đúng dữ liệu không.

**Báo `Nguồn dữ liệu tạm thời không phản hồi` — cách trace.** Log `api` chỉ ghi chung
`Upstream datasource request failed`, không nói lý do. Tái hiện đúng request ngay từ trong
container `api`:

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
# 1. Container đang thấy env nào? (so với .env.prod — khác nghĩa là cần `up -d api`)
$C exec api printenv | grep -E 'BASE_URL'
# 2. Từ container có gọi tới API được không?
$C exec api curl -s -m 5 -o /dev/null -w "%{http_code}\n" "<BASE_URL>/health-hoac-path-that"
```

- `ECONNREFUSED`/timeout: `BASE_URL` sai (vd còn `localhost`), API chưa chạy, hoặc firewall chặn.
- `401`/`403`: sai `API_KEY` hoặc sai tên header `auth.header`.
- `404`: sai `path`.
- `200` nhưng app báo rỗng/thiếu field: sai `output.recordsPath`/`from` (xem bước 2).

Toàn bộ chỉ sửa `config.json` + `.env.prod` — **không cần xem/sửa code, không cần build lại
image**. Nếu tài liệu API thật có gì mà mẫu trên chưa khớp (vd cần ký request, header đặc biệt
khác) thì báo lại, lúc đó mới cần đội dev sửa code/đẩy image mới.

## Về HTTPS

App không tự có HTTPS — `web` (nginx) chỉ phục vụ HTTP thuần.

- **Sau 1 proxy/gateway khác đã có TLS** (phổ biến nhất): giữ HTTP ở đây, proxy trỏ thẳng vào
  `WEB_PORT`. Nếu proxy forward cả `/` và `/api/v1/*` vào cùng 1 địa chỉ thì không cần sửa gì
  thêm. Nếu proxy tự lo TLS end-to-end, đổi `COOKIE_SECURE=true`.
- **Chỉ LAN/VPN nội bộ tin cậy, không proxy nào khác**: giữ HTTP.
- **Cần HTTPS thật, không có proxy nào lo**: cần dựng 1 lớp TLS phía trước — không bật
  `COOKIE_SECURE=true` trước khi có TLS thật, nếu không trình duyệt sẽ từ chối cookie đăng nhập.

## Cập nhật

**Sửa 1 datasource (không đổi code):**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart api
```
Không cần pull/rebuild — `config/` mount trực tiếp vào container. Nếu có sửa cả `.env.prod`
thì dùng `up -d api` thay cho `restart` (xem "4 API thật" bước 3).

**Lên phiên bản mới (có đổi code):** nhận file `docker-compose.prod.yml` mới (tag mới ghi sẵn
trong đó), ghi đè file cũ, chạy lại:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Dữ liệu trong `postgres-data` không mất.

**Có thay đổi cấu trúc bảng (schema):** chế độ tự chứa tự áp khi `up -d` (qua `migrate`). Chế độ
dùng PG có sẵn — nhận thêm file `.sql` đánh số tiếp theo (vd `04-...sql`) trong `schema/`, áp
bằng tay giống Bước "Về Postgres" bước 1, rồi mới `pull`/`up -d` cho `api`/`web`.

## Xử lý sự cố

**Không load được trang:** kiểm tra port (80 hoặc `WEB_PORT`) mở trong mạng nội bộ chưa;
`docker compose ... ps` xem `web` có `healthy` không.

**`web` Restarting/Exited:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs web --tail 50
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d web
```

**`api` không healthy:** thường do `config/config.json` sai định dạng, hoặc không kết nối được DB.
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs api --tail 100
```

**`api` crash, log có `P1000 ... credentials for app_user are not valid`:** mật khẩu DB không
khớp. Hay gặp khi volume `postgres-data` được tạo từ lần chạy cũ — Postgres chỉ đặt mật khẩu
**1 lần lúc tạo volume**, đổi `POSTGRES_PASSWORD`/`DATABASE_URL` sau đó không áp dụng lại.
- Không cần giữ dữ liệu: `docker compose ... down -v` rồi `up -d` (**xóa toàn bộ dữ liệu DB**).
- Cần giữ dữ liệu: đặt lại mật khẩu cho khớp `DATABASE_URL`:
  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
    psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "ALTER USER app_user PASSWORD '<mật khẩu trong DATABASE_URL>';"
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api
  ```
- Chế độ PG có sẵn: kiểm tra user/mật khẩu trong `DATABASE_URL` với bên quản lý Postgres.

**Đăng nhập được nhưng menu "Tra cứu" trống:** user chưa có quyền `api:*` — không phải lỗi kết
nối. Xem "4 API thật" bước 4. Kiểm tra nhanh: F12 → Network → `GET /api/v1/datasources` trả
`200` với `[]` nghĩa là chưa cấp quyền.

**Tra cứu báo `Nguồn dữ liệu tạm thời không phản hồi`:** BE không gọi được API nguồn. Trace theo
mục "Báo `Nguồn dữ liệu tạm thời không phản hồi`" trong phần "4 API thật".

**`pull` báo lỗi 401/403 ở 1 image:** nhà cung cấp image đó vừa đổi chính sách pull công khai
(từng xảy ra thật với 1 image MinIO trước đây) — báo cho đội dev biết để xử lý.

**Chạy `--profile db-setup run --rm seed` thấy cảnh báo `migrate` lỗi P3005:** bình thường ở
chế độ PG có sẵn khi đã tự áp `schema/*.sql` bằng tay — `migrate` không biết schema đã được áp
(không qua Prisma) nên báo "schema not empty", nhưng chỉ là cảnh báo, không chặn `seed` chạy
tiếp. Bỏ qua được.

**Đăng nhập xong bị văng ra liên tục:** nếu vừa đổi `COOKIE_SECURE=true` mà `web` chưa thật sự
có HTTPS, trình duyệt sẽ âm thầm từ chối cookie — đổi lại `false` nếu chưa có TLS thật.

**Quên mật khẩu admin:** trang đăng nhập → "Quên mật khẩu?" → admin khác duyệt trong Quản trị →
Người dùng. Chỉ có 1 admin duy nhất thì cần người có quyền truy cập DB reset trực tiếp.

## Backup

Chỉ áp dụng ở chế độ tự chứa. Ở chế độ PG có sẵn, backup là trách nhiệm của bên quản lý Postgres
đó.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U app_user app_tra_cuu | gzip > "backup-$(date +%Y%m%d-%H%M%S).sql.gz"
```

Khôi phục:
```bash
gunzip -c <file> | docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U app_user -d app_tra_cuu
```

## Dừng / khởi động lại

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down   # giữ dữ liệu
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Không thêm `-v` vào `down` trừ khi muốn xóa sạch dữ liệu.

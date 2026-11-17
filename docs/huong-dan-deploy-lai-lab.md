# Hướng dẫn deploy lại trên máy lab (dọn sạch, dựng lại từ bộ `deploy-check`)

Quy trình ba bước: **(1) dọn sạch lab → (2) chuẩn bị bộ file ở máy local rồi `scp` lên → (3) pull image mới nhất và dựng.**

Quy ước: thư mục triển khai trên lab là `/root/kit`, project compose là `app-tra-cuu-kit`, cổng web `8082`, địa chỉ lab `<IP-lab>`. Đổi theo máy của bạn nếu khác.

> Không ghi mật khẩu, API key vào tài liệu hay chat. Chúng chỉ nằm trong `.env.prod` (quyền 600).

---

## Bước 1. Dọn sạch lab (image, DB, config cũ)

> **Cảnh báo:** bước này **xóa toàn bộ dữ liệu của stack `app-tra-cuu-kit`**: user, lịch sử tra cứu, API key lưu trên giao diện, config cũ. Muốn giữ gì thì sao chép ra ngoài trước (ví dụ `cp /root/kit/.env.prod /root/env.cu.bak`).

Mọi lệnh đi qua hàm `dc` có `-p app-tra-cuu-kit`, nên **chỉ đụng stack này**, không đụng stack khác trên máy (ví dụ stack của người khác). Không bao giờ chạy `docker system prune`, `docker rm $(docker ps -aq)` hay `docker volume prune`.

```bash
ssh root@<IP-lab>
cd /root/kit

# Hàm dc: tự thêm file stand-in nếu có (mục 2.4); không có thì chỉ dùng file chính
F="-f docker-compose.prod.yml"; [ -f docker-compose.stand-in.yml ] && F="$F -f docker-compose.stand-in.yml"
dc() { docker compose -p app-tra-cuu-kit $F --env-file .env.prod "$@"; }

# 1.1 Xem trước sẽ xóa gì (chỉ stack này)
dc ps -a
docker volume ls --filter label=com.docker.compose.project=app-tra-cuu-kit

# 1.2 Xóa container, mạng, volume (DB) và image của stack này
dc down -v --rmi all --remove-orphans

# 1.3 Kiểm tra đã sạch (cả hai lệnh phải không in dòng nào)
docker ps -a --filter label=com.docker.compose.project=app-tra-cuu-kit -q
docker volume ls --filter label=com.docker.compose.project=app-tra-cuu-kit -q

# 1.4 Xóa thư mục triển khai cũ (config, logs, .env.prod cũ)
cd /root && rm -rf /root/kit
```

Hàm `dc` mất khi đóng phiên SSH; vào lại phải gõ lại hai dòng `F=` và `dc()`.

Nếu `/root/kit` đã không còn (hoặc không có `docker-compose.prod.yml`) thì `dc` không chạy được: lấy lại bộ file ở Bước 2 trước rồi mới dọn.

---

## Bước 2. Chuẩn bị bộ file nền: config, compose, env

**Mục tiêu:** có một thư mục đầy đủ gồm `docker-compose.prod.yml`, `config/` (đã đúng), `.env.prod` (đã điền xong) để đưa lên lab.

### 2.1 Lấy `deploy-check` về local

Chọn một trong hai cách (làm trên máy local):

**Cách A: `git pull` ở local**
```bash
cd <thư-mục-repo> && git pull origin main
mkdir -p ~/lab-deploy && cp -a deploy-check/. ~/lab-deploy/
rm -f ~/lab-deploy/.env.prod ~/lab-deploy/config/*.bak        # không mang secret/ bản backup của máy khác
cd ~/lab-deploy
```

**Cách B: chỉ kéo thư mục `deploy-check` bằng git sparse-checkout** (không cần cả repo; cần git ≥ 2.25; repo private thì cần token hoặc deploy key)
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/tha-mie-nh/API-tra-c-u.git /tmp/repo-lab
(cd /tmp/repo-lab && git sparse-checkout set deploy-check)
mkdir -p ~/lab-deploy && cp -a /tmp/repo-lab/deploy-check/. ~/lab-deploy/ && rm -rf /tmp/repo-lab
cd ~/lab-deploy
```

Muốn kéo thẳng trên lab (không qua local): chạy lệnh của Cách B trên lab, nhưng đích là `/root/kit`. Khi đó phần 2.2 và 2.3 làm bằng `nano` ngay trên lab.

### 2.2 Sinh `.env.prod` nền và điền nốt (làm ở local)

```bash
./init-env-prod.sh --out ~/lab-deploy/.env.prod
```
Script sinh sẵn các secret (JWT, mật khẩu Postgres, khóa mã hóa API key `SECRETS_ENCRYPTION_KEY`, mật khẩu admin khởi tạo) và **in mật khẩu admin một lần: ghi lại ngay**. Sau đó điền các biến còn thiếu (script liệt kê danh sách):

```bash
nano ~/lab-deploy/.env.prod
```
Cần điền:
- `CORS_ORIGIN=http://<IP-lab>:8082` (đúng địa chỉ người dùng gõ vào trình duyệt)
- `WEB_PORT=8082`
- 4 cặp `*_BASE_URL` / `*_API_KEY` của API thật (IMMIGRATION_HISTORY, PASSPORT_INFO, DRIVER_LICENSE, FACE_PHOTO):
  - **Đã có API thật:** điền địa chỉ (truy cập được từ trong container `api`, không dùng `localhost`) và key.
  - **Chưa có API thật:** điền giá trị giữ chỗ để ứng dụng vẫn khởi động được (tra cứu 4 nguồn đó sẽ báo lỗi kết nối cho tới khi thay giá trị thật):
    ```bash
    sed -i 's/^\(IMMIGRATION_HISTORY\|PASSPORT_INFO\|DRIVER_LICENSE\|FACE_PHOTO\)_BASE_URL=.*/\1_BASE_URL=http:\/\/api-chua-co.invalid/; s/^\(IMMIGRATION_HISTORY\|PASSPORT_INFO\|DRIVER_LICENSE\|FACE_PHOTO\)_API_KEY=.*/\1_API_KEY=chua-co-key/' ~/lab-deploy/.env.prod
    ```

Kiểm tra:
```bash
./init-env-prod.sh --check --out ~/lab-deploy/.env.prod     # phải 0 lỗi
```
Cảnh báo `CORS_ORIGIN đang là localhost` chỉ bình thường nếu bạn chỉ vào lab bằng SSH tunnel.

### 2.3 Rà `config/config.json`

`~/lab-deploy/config/config.json` là cấu hình chuẩn của bản phát hành. Nguồn dữ liệu bật/tắt ở đây; nguồn **đang bật** mà thiếu biến môi trường thì `api` không khởi động. Muốn tắt một nguồn: đặt `"enabled": false` trong file này trước khi đưa lên. Đừng mang `config.json` cũ từ lab vào nếu nó ở định dạng cũ.

### 2.4 Chốt API tra cứu giả cần dùng (không bắt buộc)

Chỉ làm khi lab cần thêm các API giả để thử nghiệm (không dùng cho production). **Chốt ở đây, trước khi `scp`**, rồi tạo `docker-compose.stand-in.yml` trong `~/lab-deploy` chỉ với các dịch vụ bạn chọn. Mẫu đủ hai API:

```bash
cat > ~/lab-deploy/docker-compose.stand-in.yml <<'EOF'
# API giả cho lab: cùng mạng Docker với `api`, không mở cổng ra ngoài. Xóa dịch vụ nào không cần.
services:
  simple-api:                # API mẫu: GET/POST /search, GET /images (header X-Access-Key: my-secret-key)
    image: vhung98vp/simple-api:1.0
    restart: unless-stopped
    networks: [backend]
  mock-echo:                 # trả lại đúng những gì nhận được; log từng request
    image: gthanh/app_tra_cuu:mock-echo-v1
    restart: unless-stopped
    environment:
      PORT: 4200
    networks: [backend]
EOF
```
Địa chỉ để dùng sau khi dựng xong: `http://simple-api:8080` và `http://mock-echo:4200`. Nếu API giả cần biến môi trường, thêm vào `.env.prod` ở bước 2.2.
Tạo các nguồn dữ liệu tương ứng trên giao diện (mục 3.4). Không cần file stand-in nào thì bỏ qua mục này; hàm `dc` sẽ tự chỉ dùng file chính.

### 2.5 `scp` lên lab

```bash
cd ~ && scp -rp lab-deploy root@<IP-lab>:/root/kit
ssh root@<IP-lab> 'chmod 600 /root/kit/.env.prod && ls -la /root/kit'
```
Trên lab phải thấy: `docker-compose.prod.yml`, `.env.prod` (quyền `-rw-------`), `config/`, `init-env-prod.sh`, `schema/`, `docker/`, và `docker-compose.stand-in.yml` nếu có.

Sau khi `scp` xong, **xóa bản nháp ở local nếu máy không an toàn**: `rm -rf ~/lab-deploy` (trong đó có secret thật của lab).

---

## Bước 3. Pull image mới nhất và dựng

```bash
ssh root@<IP-lab>
cd /root/kit
F="-f docker-compose.prod.yml"; [ -f docker-compose.stand-in.yml ] && F="$F -f docker-compose.stand-in.yml"
dc() { docker compose -p app-tra-cuu-kit $F --env-file .env.prod "$@"; }

grep -n "app_tra_cuu:" docker-compose.prod.yml     # api-v13 và web-v16 (tag đã được ghi đè bằng bản mới nhất)
dc pull
dc up -d
dc ps
```
Mong đợi: `api`, `web`, `postgres` là `healthy`; `config-perms`, `migrate`, `seed` là `Exited (0)`; `simple-api`/`mock-echo` (nếu chọn) là `Up`.

### 3.1 Kiểm tra

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/api/v1/health     # 200
dc logs api --tail 30
```
Vào `http://<IP-lab>:8082/login`; nếu cổng bị firewall chặn thì dùng SSH tunnel: `ssh -L 9082:localhost:8082 root@<IP-lab>` rồi mở `http://localhost:9082/login`. Tài khoản `admin`, mật khẩu là mật khẩu đã ghi ở bước 2.2; lần đầu bị buộc đổi.

### 3.2 Khi có API thật của đối tác

Làm trên giao diện, không cần dựng lại: **Quản trị → Nguồn dữ liệu**, mở nguồn (ví dụ `PASSPORT_INFO`):
1. `baseUrl`: ghi thẳng URL thật (truy cập được từ trong container `api`).
2. Ô **API key**: nhập key. Server mã hóa (AES-256-GCM, khóa `SECRETS_ENCRYPTION_KEY`) và lưu trong Postgres; không ghi vào `config.json` hay `.env.prod`, không hiển thị lại.
3. Lưu. Áp dụng ngay, không restart.

Nếu đối tác chỉ cấp key qua biến môi trường: sửa `*_BASE_URL`/`*_API_KEY` trong `.env.prod` rồi `dc up -d` một lần.

### 3.3 Thêm nguồn dữ liệu mới

Cùng cách như 3.2, nhưng chọn **Thêm nguồn dữ liệu**: `baseUrl` ghi thẳng URL, key nhập vào ô API key; không cần sửa `.env.prod`, không restart.

### 3.4 Tạo nguồn cho API giả (nếu đã chọn ở 2.4)

**Thêm nguồn dữ liệu** trên giao diện: kiểu HTTP, `baseUrl` = `http://simple-api:8080` (hoặc `http://mock-echo:4200`). Với `simple-api` ở đường `/images`, xác thực "API key trên header", header `X-Access-Key`, key `my-secret-key` (nhập vào ô API key). Trường nhập/xuất xem cấu hình mẫu `SA_*` trong `config/config.json` của repo dev.

---

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `pull` báo `manifest unknown` | Tag chưa có trên Docker Hub | Kiểm tra tên tag trong compose |
| `api` restart liên tục, log báo biến `*_BASE_URL`/`*_API_KEY` chưa đặt | Có nguồn **đang bật** thiếu biến | Điền giá trị giữ chỗ (2.2) hoặc tắt nguồn đó trong `config.json` |
| `api` không lên, log báo không kết nối DB | `POSTGRES_PASSWORD`/`DATABASE_URL` không khớp | Bước 1 chưa xóa hết volume: chạy lại 1.2, dựng lại |
| `api` không lên, log báo config không hợp lệ | `config.json` định dạng cũ | Dùng bản `deploy-check/config/config.json` từ git |
| Ô API key trên giao diện bị khóa | Thiếu/sai `SECRETS_ENCRYPTION_KEY` | Kiểm tra `./init-env-prod.sh --check`, sửa rồi `dc up -d` |
| `permission denied` ở `config/` hoặc `logs/` | uid 1000 không ghi được | `chown -R 1000:1000 config logs`; NFS/SELinux xem `deployment-guide.md` |
| Nguồn API giả báo lỗi kết nối | Chưa có `docker-compose.stand-in.yml` hoặc `dc` chưa nạp nó | `dc ps` phải thấy dịch vụ; gõ lại hai dòng `F=`/`dc()` |
| Quên mật khẩu admin | | Mục "Xử lý sự cố" trong `deployment-guide.md` |

## Lần cập nhật sau (không cần dọn sạch)

Trên máy dev: sửa code, build và push image, chạy `scripts/sync-deploy-check.sh`, commit, push. Trên lab, nếu chỉ đổi image: `dc pull && dc up -d`. Nếu compose hoặc config đổi: lấy lại `deploy-check` (2.1), **giữ `.env.prod` và `config/` đang chạy**, chép đè các file khác rồi `dc pull && dc up -d`.

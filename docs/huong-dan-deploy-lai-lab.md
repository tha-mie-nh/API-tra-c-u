# Hướng dẫn deploy lại trên máy lab (chuẩn bị ở local, `scp` lên, dựng)

Quy trình: **(1) dọn sạch lab → (2) chuẩn bị TOÀN BỘ ở máy local (env, compose, config, API tra cứu giả) → (3) `scp` lên lab rồi dựng một lần.**
Lab **không cần git, không cần repo**: mọi thứ nằm trong thư mục bạn `scp` lên. Dựng xong là có đủ hệ thống và các API tra cứu.

Quy ước: thư mục trên lab `/root/kit`, project compose `app-tra-cuu-kit`, cổng web `8082`, địa chỉ lab `<IP-lab>`. Đổi theo máy của bạn nếu khác.

> Không ghi mật khẩu, API key vào tài liệu hay chat. Chúng chỉ nằm trong `.env.prod` (quyền 600).

**Cần có ở local:** repo này, `docker`, `openssl`, `python3`, `ssh`/`scp` tới lab. **Cần có ở lab:** Docker, và kéo được image từ Docker Hub.

---

## Bước 1. Dọn sạch lab (image, DB, config cũ)

> **Cảnh báo:** xóa **toàn bộ dữ liệu của stack `app-tra-cuu-kit`**: user, lịch sử tra cứu, API key lưu trên giao diện, config cũ. Muốn giữ gì thì chép ra ngoài trước (ví dụ `cp /root/kit/.env.prod /root/env.cu.bak`).

Mọi lệnh đi qua hàm `dc` có `-p app-tra-cuu-kit`, nên **chỉ đụng stack này**, không đụng stack khác trên máy. Không chạy `docker system prune`, `docker volume prune`, `docker rm $(docker ps -aq)`.

```bash
ssh root@<IP-lab>
cd /root/kit

# Hàm dc: tự thêm file API giả nếu có; không có thì chỉ dùng file chính
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
Nếu `/root/kit` đã không còn thì `dc` không chạy được: dùng `docker ps -a --filter label=com.docker.compose.project=app-tra-cuu-kit` để xem, và xóa bằng `docker rm -f` / `docker volume rm` đúng các mục đó.

---

## Bước 2. Chuẩn bị tất cả ở máy local

Một lệnh, chạy trong thư mục repo:

```bash
./scripts/prepare-lab-deploy.sh --cors-origin http://<IP-lab>:8082 --web-port 8082 --out ~/lab-deploy
```

Script làm theo thứ tự:
1. Chép `deploy-check/` sang `~/lab-deploy` (không đụng `deploy-check/` trong repo; không mang theo `.env.prod` hay file `.bak` cũ).
2. Sinh `.env.prod` bằng `init-env-prod.sh`: secret mới (JWT, mật khẩu Postgres, mật khẩu admin, `SECRETS_ENCRYPTION_KEY`), quyền 600. **In mật khẩu admin một lần: ghi lại ngay.**
3. Điền `CORS_ORIGIN`, `WEB_PORT`, và giá trị giữ chỗ cho 4 API thật chưa có (xem dưới).
4. **Dựng trước các API tra cứu giả:** `docker pull` image của chúng ở local (kiểm tra chắc chắn tồn tại), ghi `docker-compose.stand-in.yml`, và thêm các nguồn dữ liệu tương ứng vào `config/config.json` với địa chỉ là tên dịch vụ trong mạng Docker (`http://simple-api:8080`, `http://mock-echo:4200`). Mặc định có cả hai.
5. Chạy `init-env-prod.sh --check`: phải **0 lỗi**.

Tùy chọn:
- `--stand-in simple-api` (chỉ một API giả) hoặc `--stand-in none` (không dùng API giả, lab chỉ có hệ thống).
- `--no-pull` để bỏ bước pull ở local (khi đang không có mạng).

### 2.1 Rà lại trước khi gửi (nên làm)

```bash
cd ~/lab-deploy
ls -A                                  # .env.prod, docker-compose.prod.yml, docker-compose.stand-in.yml, config/ ...
grep -n "app_tra_cuu:" docker-compose.prod.yml          # api-v13, web-v16
grep -c '"enabled": true' config/config.json            # các nguồn đang bật
nano .env.prod                         # chỉ khi cần đổi (xem dưới)
./init-env-prod.sh --check             # chạy lại sau khi sửa
```

**4 API thật (IMMIGRATION_HISTORY, PASSPORT_INFO, DRIVER_LICENSE, FACE_PHOTO):**
- Chưa có: giữ giá trị giữ chỗ script đã điền. Ứng dụng vẫn khởi động; tra cứu 4 nguồn này báo lỗi kết nối cho tới khi có API thật.
- Đã có: sửa `*_BASE_URL` (địa chỉ truy cập được từ **trong container `api`**, không dùng `localhost`) và `*_API_KEY` trong `.env.prod` ở bước này, hoặc nhập trên giao diện sau khi dựng (mục "Khi có API thật").

**Muốn đổi API giả hoặc config:** sửa `config/config.json` (nguồn nào `"enabled": true` mà thiếu biến môi trường thì `api` không khởi động), hoặc sửa/xóa dịch vụ trong `docker-compose.stand-in.yml`. Thêm một API giả khác: thêm dịch vụ vào file đó (cùng `networks: [backend]`) và thêm nguồn tương ứng vào `config.json`.

### 2.2 `scp` lên lab

```bash
scp -rp ~/lab-deploy root@<IP-lab>:/root/kit
ssh root@<IP-lab> 'chmod 600 /root/kit/.env.prod && ls -la /root/kit'
```
Trên lab phải thấy `docker-compose.prod.yml`, `docker-compose.stand-in.yml`, `.env.prod` (quyền `-rw-------`), `config/`, `init-env-prod.sh`, `schema/`, `docker/`.

Gửi xong, xóa bản nháp ở local nếu máy không an toàn: `rm -rf ~/lab-deploy` (trong đó có secret thật của lab).

---

## Bước 3. Dựng hệ thống trên lab

```bash
ssh root@<IP-lab>
cd /root/kit
F="-f docker-compose.prod.yml"; [ -f docker-compose.stand-in.yml ] && F="$F -f docker-compose.stand-in.yml"
dc() { docker compose -p app-tra-cuu-kit $F --env-file .env.prod "$@"; }

dc pull          # kéo image mới nhất: api-v13, web-v16 và các API giả
dc up -d
dc ps
```
Mong đợi: `api`, `web`, `postgres` là `healthy`; `simple-api`, `mock-echo` là `Up`; `config-perms`, `migrate`, `seed` là `Exited (0)`.

### 3.1 Kiểm tra

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/api/v1/health     # 200
dc logs api --tail 30
```
Vào `http://<IP-lab>:8082/login`; cổng bị firewall chặn thì dùng SSH tunnel: `ssh -L 9082:localhost:8082 root@<IP-lab>` rồi mở `http://localhost:9082/login`.
Tài khoản `admin`, mật khẩu là mật khẩu script in ở bước 2; lần đầu bị buộc đổi.

Thử các nguồn mẫu trên màn hình tra cứu:

| Nguồn | Nhập | Kết quả đúng |
|---|---|---|
| `SA_SEARCH_GET`, `SA_SEARCH_POST` | `param1` = `a` | Có bảng kết quả |
| `SA_IMAGES` | `count` = `2` | Hiện ảnh |
| `SA_IMAGES_BADKEY` | `count` = `2` | Báo upstream từ chối key (401): đây là **kết quả đúng** |
| `ECHO_DEMO` | `soHC` = `B1234567` | Kết quả lặp lại đúng giá trị nhập |

### 3.2 Khi có API thật của đối tác

Làm trên giao diện, không cần dựng lại: **Quản trị → Nguồn dữ liệu**, mở nguồn (ví dụ `PASSPORT_INFO`):
1. `baseUrl`: ghi thẳng URL thật.
2. Ô **API key**: nhập key. Server mã hóa (AES-256-GCM, khóa `SECRETS_ENCRYPTION_KEY`) và lưu trong Postgres; không ghi vào `config.json` hay `.env.prod`, không hiển thị lại.
3. Lưu. Áp dụng ngay, không restart.

Nếu đối tác chỉ cấp key qua biến môi trường: sửa `*_BASE_URL`/`*_API_KEY` trong `.env.prod` rồi `dc up -d` một lần.
Thêm nguồn dữ liệu mới hoàn toàn: **Thêm nguồn dữ liệu**, cùng cách (URL ghi thẳng, key nhập ở ô API key; không sửa `.env.prod`, không restart).

---

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `pull` báo `manifest unknown` | Tag chưa có trên Docker Hub | Kiểm tra tên tag trong compose |
| `api` restart liên tục, log báo biến `*_BASE_URL`/`*_API_KEY` chưa đặt | Có nguồn **đang bật** thiếu biến | Điền giá trị (hoặc giữ chỗ) trong `.env.prod` ở local, hoặc tắt nguồn trong `config.json`, rồi `scp` lại |
| `api` không lên, log báo không kết nối DB | `POSTGRES_PASSWORD` không khớp volume cũ | Bước 1 chưa xóa hết volume: chạy lại 1.2 rồi dựng lại |
| `api` không lên, log báo config không hợp lệ | `config.json` sai định dạng | Chạy lại script ở bước 2 (tạo `--out` mới) |
| Ô API key trên giao diện bị khóa | Thiếu/sai `SECRETS_ENCRYPTION_KEY` | `./init-env-prod.sh --check`, sửa rồi `dc up -d` |
| `permission denied` ở `config/` hoặc `logs/` | uid 1000 không ghi được | `chown -R 1000:1000 config logs`; NFS/SELinux xem `deployment-guide.md` |
| Nguồn API giả báo lỗi kết nối | `dc` chưa nạp `docker-compose.stand-in.yml` | Gõ lại hai dòng `F=`/`dc()`; `dc ps` phải thấy `simple-api`, `mock-echo` |
| Lab không kéo được image từ Docker Hub | Chặn mạng ra ngoài | Ở local: `docker save <image> \| ssh root@<IP-lab> docker load` cho từng image, rồi `dc up -d` |
| Quên mật khẩu admin | | Mục "Xử lý sự cố" trong `deployment-guide.md` |

## Lần cập nhật sau

- Chỉ đổi image (đã push lên Hub): trên lab `dc pull && dc up -d`.
- Đổi compose hoặc config: chạy lại Bước 2 với `--out` mới, rồi chép **chỉ các file cần đổi** lên lab (`scp ~/lab-deploy2/docker-compose.prod.yml root@<IP-lab>:/root/kit/`), giữ nguyên `.env.prod` và `config/` đang chạy (config trên giao diện lưu ở đó) trừ khi cố ý thay. Sau đó `dc up -d`.
- Bộ `deploy-check/` trong repo luôn được đồng bộ bằng `scripts/sync-deploy-check.sh`; không sửa tay.

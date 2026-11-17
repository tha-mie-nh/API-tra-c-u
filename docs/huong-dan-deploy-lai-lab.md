# Hướng dẫn deploy lại trên máy lab (xóa `/root/kit`, kéo lại từ git)

Áp dụng khi: xóa thư mục triển khai cũ (`/root/kit`) và dựng lại từ bộ `deploy-check/` trong git, dùng image trên Docker Hub (`gthanh/app_tra_cuu:api-v13`, `web-v16`).

Quy ước dưới đây: thư mục triển khai là `/root/kit`, tên project compose là `app-tra-cuu-kit`, cổng web là `8082`. Đổi theo máy của bạn nếu khác.

> Không ghi mật khẩu, API key vào tài liệu hay chat. Chúng chỉ nằm trong `.env.prod` trên chính máy lab (quyền 600).

---

## 0. Quyết định trước: giữ hay bỏ dữ liệu

Dữ liệu (user, lịch sử tra cứu) nằm trong **volume Postgres của Docker**, không nằm trong `/root/kit`. Xóa thư mục không xóa DB.

| Mục tiêu | Làm gì | Hệ quả |
|---|---|---|
| **A. Giữ dữ liệu** | `dc down` (không `-v`) và **dùng lại `.env.prod` cũ** (đặc biệt `POSTGRES_PASSWORD`) | User, lịch sử còn nguyên |
| **B. Dựng sạch từ đầu** | `dc down -v` rồi sinh `.env.prod` mới bằng `init-env-prod.sh` | **Mất toàn bộ dữ liệu**; seed tạo lại admin |

Lỗi hay gặp: chọn A nhưng sinh `.env.prod` mới thì mật khẩu DB mới không khớp volume cũ, API không kết nối được DB. Chọn A thì phải copy `.env.prod` cũ.

---

## 1. Backup trước khi xóa

```bash
ssh root@<IP-máy-lab>
cd /root
cp -a kit kit.bak-$(date +%y%m%d)      # giữ .env.prod, config/, logs/ cũ
ls kit.bak-*/                            # kiểm tra có .env.prod và config/
```

Không xóa `kit.bak-*` cho tới khi bản mới chạy ổn.

## 2. Dừng stack cũ

```bash
cd /root/kit
dc() { docker compose -p app-tra-cuu-kit -f docker-compose.prod.yml --env-file .env.prod "$@"; }
dc ps
dc down            # chọn A (giữ dữ liệu)
# dc down -v       # chọn B (XÓA DB) — chỉ khi chắc chắn
```

Luôn dùng `-p app-tra-cuu-kit` để không đụng stack khác trên cùng máy. Hàm `dc` mất khi đóng phiên SSH; vào lại phải gõ lại.

## 3. Kéo riêng thư mục `deploy-check` từ git

Cần git ≥ 2.25 (kiểm tra `git --version`). Nếu repo private, cần token hoặc deploy key.

```bash
cd /root && mv kit kit.old && mkdir kit && cd kit
git clone --depth 1 --filter=blob:none --sparse https://github.com/tha-mie-nh/API-tra-c-u.git repo
cd repo && git sparse-checkout set deploy-check && cd ..
cp -a repo/deploy-check/. . && rm -rf repo
ls                 # phải có docker-compose.prod.yml, docker/, config/, schema/, init-env-prod.sh, .env.prod.example
```

Nếu máy lab không có git hoặc không vào được GitHub: trên máy dev chạy `scripts/sync-deploy-check.sh --zip`, `scp deploy-check.zip` lên lab rồi `unzip`. Zip này không chứa `.env.prod`.

## 4. Tạo `.env.prod`

**Chọn A (giữ dữ liệu):**
```bash
cp /root/kit.old/.env.prod .env.prod && chmod 600 .env.prod
```
`.env.prod` cũ có thể thiếu biến mới. So với mẫu:
```bash
diff <(grep -oE '^[A-Z_]+=' .env.prod.example | sort -u) <(grep -oE '^[A-Z_]+=' .env.prod | sort -u)
```
Dòng bắt đầu bằng `<` là biến có trong mẫu mà `.env.prod` chưa có. Thêm vào (ví dụ `LOG_FILE`, `TRUST_PROXY`, `QUERY_LOG_PAYLOAD_ENABLED`). Giữ `WEB_PORT=8082` nếu lab đang dùng cổng đó.

**Chọn B (dựng mới):**
```bash
./init-env-prod.sh        # in mật khẩu admin MỘT lần, hãy ghi lại
nano .env.prod            # điền các biến __SET_ME__: CORS_ORIGIN, *_BASE_URL, *_API_KEY; đặt WEB_PORT=8082
```

**Khóa mã hóa API key (cả hai chọn):** `.env.prod` phải có `SECRETS_ENCRYPTION_KEY` (64 ký tự hex). Chọn B thì script đã sinh sẵn.
Chọn A mà `.env.prod` cũ chưa có thì thêm (lab đã từng có key lưu trong DB thì phải dùng lại đúng khóa cũ, đừng sinh khóa khác):
```bash
grep -q '^SECRETS_ENCRYPTION_KEY=' .env.prod || echo "SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.prod
```
Sao lưu `.env.prod` ở nơi an toàn: mất khóa này thì các API key đã nhập trên giao diện không giải mã được nữa.

Kiểm tra (cả hai chọn):
```bash
./init-env-prod.sh --check
```
Phải ra `0 lỗi`. Các `*_BASE_URL` không được trỏ `localhost`; phải là địa chỉ truy cập được từ **trong container api**.

## 5. Cấu hình datasource (`config/config.json`)

`config/config.json` từ git là bản chuẩn của bản phát hành hiện tại. **Không copy đè bằng config cũ** nếu nó ở định dạng cũ (schema đã đổi), vì API sẽ từ chối khởi động. Làm như sau:

1. Dùng bản trong git trước.
2. Đối chiếu với bản cũ để lấy lại phần lab cần: `diff /root/kit.old/config/config.json config/config.json`.
3. Bật/sửa datasource qua giao diện (trang quản trị) hoặc sửa file, rồi `dc restart api`.

## 6. Kéo image và chạy

```bash
dc() { docker compose -p app-tra-cuu-kit -f docker-compose.prod.yml --env-file .env.prod "$@"; }
grep -n "app_tra_cuu:" docker-compose.prod.yml     # phải là api-v13 và web-v16
dc pull
dc up -d
dc ps
```

Mong đợi: `api` và `web` là `healthy`; `config-perms`, `migrate`, `seed` là `Exited (0)`.

`config-perms` chạy một lần để cấp quyền ghi cho `./config` và `./logs` (API chạy bằng user uid 1000, không phải root). Nếu thấy `permission denied`, xem mục 8.

## 7. Kiểm tra

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/api/v1/health     # 200
dc logs api --tail 50
ls -l logs/                                                                       # có api.log
```

Vào web: `http://<IP-máy-lab>:8082/login`. Nếu cổng bị firewall chặn, dùng SSH tunnel: `ssh -L 9082:localhost:8082 root@<IP-máy-lab>` rồi mở `http://localhost:9082/login`.

- Chọn A: đăng nhập bằng tài khoản cũ.
- Chọn B: tài khoản `admin`, mật khẩu in ra ở bước 4; lần đầu bị buộc đổi.

Sau khi đăng nhập, thử một tra cứu. Nếu lỗi CORS, đặt `CORS_ORIGIN` đúng địa chỉ web bạn gõ vào trình duyệt (ví dụ `http://<IP>:8082`) rồi `dc up -d`.

## 8. Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `pull` báo `manifest unknown` | Tag chưa có trên Docker Hub | Kiểm tra tên tag trong compose |
| `api` restart liên tục, log nói không kết nối được DB | Chọn A nhưng `POSTGRES_PASSWORD` khác volume cũ | Dùng lại `.env.prod` cũ, hoặc chọn B |
| `api` không lên, log báo config không hợp lệ | `config.json` định dạng cũ | Dùng bản trong git (mục 5) |
| `permission denied` ở `config/` hoặc `logs/` | uid 1000 không ghi được thư mục | `chown -R 1000:1000 config logs`; nếu thư mục nằm trên NFS/SELinux thì xem `docs/deployment-guide.md` |
| Lưu datasource trên UI báo lỗi | Cùng nguyên nhân quyền ghi `config/` | Như trên |
| Quên mật khẩu admin | | Mục "Xử lý sự cố" trong `deployment-guide.md` |

## 9. Quay về bản cũ

```bash
dc down
rm -rf /root/kit && mv /root/kit.old /root/kit      # hoặc kit.bak-<ngày>
cd /root/kit && dc up -d
```
Muốn quay về image cũ: đổi tag trong `docker-compose.prod.yml` (`api-vN`, `web-vN`) rồi `dc pull && dc up -d`.

## 10. Lần cập nhật sau

Không cần xóa thư mục. Trên máy dev: sửa code, build và push image, chạy `scripts/sync-deploy-check.sh`, commit, push. Trên lab: cập nhật lại `deploy-check` (mục 3, ghi đè file nhưng **giữ `.env.prod`, `config/`**), rồi `dc pull && dc up -d`.

# Hướng dẫn deploy lại trên máy lab (chưa có API thật của đối tác)

Áp dụng khi: xóa thư mục triển khai cũ (`/root/kit`), dựng lại từ bộ `deploy-check/` trong git bằng image Docker Hub
(`gthanh/app_tra_cuu:api-v13`, `web-v16`), và **lab chưa có API thật của đối tác** nhưng vẫn muốn có các nguồn tra cứu
mẫu giống môi trường dev.

Quy ước: thư mục triển khai `/root/kit`, project compose `app-tra-cuu-kit`, cổng web `8082`. Đổi theo máy của bạn nếu khác.

> Không ghi mật khẩu, API key vào tài liệu hay chat. Chúng chỉ nằm trong `.env.prod` trên chính máy lab (quyền 600).

## Tổng quan: lab chạy gì khi chưa có API thật

| Thành phần | Lab chưa có API thật | Khi có API thật |
|---|---|---|
| 4 nguồn thật: `IMMIGRATION_HISTORY`, `PASSPORT_INFO`, `DRIVER_LICENSE`, `FACE_PHOTO` | **Tắt** (không cần biến môi trường) | Bật, điền địa chỉ + key (mục 9) |
| `ECHO_DEMO` | Bật, gọi `mock-echo` (API giả trả lại đúng thứ nhận được) | Giữ hoặc tắt |
| `SA_SEARCH_GET`, `SA_SEARCH_POST`, `SA_IMAGES`, `SA_IMAGES_BADKEY` | Bật, gọi `simple-api` (API mẫu: tra cứu, ảnh, lỗi 401) | Giữ hoặc tắt |

Hai API giả chạy **như hai container trong cùng mạng Docker** với `api` (file `docker-compose.lab.yml`), không mở cổng ra ngoài.
Chúng đi qua đường `http` thật của ứng dụng (không dùng chế độ `mock`), nên hành vi giống API thật: timeout, retry, 401, ảnh.
**Không dùng cho production.**

Hai file riêng cho lab nằm trong `deploy-check/`: `docker-compose.lab.yml` và `config/config.lab.json`.

---

## 0. Quyết định trước: giữ hay bỏ dữ liệu

Dữ liệu (user, lịch sử tra cứu, API key nhập trên giao diện) nằm trong **volume Postgres của Docker**, không nằm trong `/root/kit`.

| Mục tiêu | Làm gì | Hệ quả |
|---|---|---|
| **A. Giữ dữ liệu** | `dc down` (không `-v`) và **dùng lại `.env.prod` cũ** | User, lịch sử còn nguyên |
| **B. Dựng sạch từ đầu** | `dc down -v`, sinh `.env.prod` mới bằng `init-env-prod.sh` | **Mất toàn bộ dữ liệu**; seed tạo lại admin |

Chọn A mà sinh `.env.prod` mới thì mật khẩu DB không khớp volume cũ, API không kết nối được DB.

## 1. Backup

```bash
ssh root@<IP-máy-lab>
cd /root && cp -a kit kit.bak-$(date +%y%m%d)     # giữ .env.prod, config/, logs/ cũ
ls kit.bak-*/
```
Giữ `kit.bak-*` tới khi bản mới chạy ổn.

## 2. Dừng stack cũ

```bash
cd /root/kit
docker compose -p app-tra-cuu-kit -f docker-compose.prod.yml --env-file .env.prod down        # chọn A
# thêm -v ở cuối nếu chọn B (XÓA DB)
```
Luôn dùng `-p app-tra-cuu-kit` để không đụng stack khác trên cùng máy.

## 3. Kéo `deploy-check` từ git

Cần git ≥ 2.25. Nếu repo private, cần token hoặc deploy key.

```bash
cd /root && mv kit kit.old && mkdir kit && cd kit
git clone --depth 1 --filter=blob:none --sparse https://github.com/tha-mie-nh/API-tra-c-u.git repo
(cd repo && git sparse-checkout set deploy-check)
cp -a repo/deploy-check/. . && rm -rf repo
ls    # có docker-compose.prod.yml, docker-compose.lab.yml, config/config.lab.json, init-env-prod.sh, .env.prod.example
```
Không có git hoặc không vào được GitHub: trên máy dev chạy `scripts/sync-deploy-check.sh --zip`, `scp deploy-check.zip` lên lab, `unzip`. Zip không chứa `.env.prod`.

## 4. Tạo `.env.prod`

**Chọn A (giữ dữ liệu):**
```bash
cp /root/kit.old/.env.prod .env.prod && chmod 600 .env.prod
diff <(grep -oE '^[A-Z_]+=' .env.prod.example | sort -u) <(grep -oE '^[A-Z_]+=' .env.prod | sort -u)
```
Dòng `<` là biến mẫu có mà `.env.prod` chưa có: thêm vào (ví dụ `LOG_FILE`, `TRUST_PROXY`). Giữ `WEB_PORT=8082`.

**Chọn B (dựng mới):**
```bash
./init-env-prod.sh        # in mật khẩu admin MỘT lần: ghi lại
```

**Cả hai chọn, làm tiếp:**

1. Đặt địa chỉ web mà người dùng gõ vào trình duyệt, và cổng:
   ```bash
   nano .env.prod     # CORS_ORIGIN=http://<IP-máy-lab>:8082   và   WEB_PORT=8082
   ```
2. **Bỏ các biến của 4 API thật** (nguồn đó đang tắt nên không cần; để `__SET_ME__` sẽ làm `--check` báo lỗi):
   ```bash
   sed -i '/^\(IMMIGRATION_HISTORY\|PASSPORT_INFO\|DRIVER_LICENSE\|FACE_PHOTO\)_/d' .env.prod
   ```
3. **Thêm biến cho hai API giả** (giá trị demo công khai, không phải secret thật):
   ```bash
   cat >> .env.prod <<'EOF'
   SIMPLE_IMAGES_API_KEY=my-secret-key
   SIMPLE_BADKEY_API_KEY=wrong-key
   EOF
   ```
4. **Khóa mã hóa API key** (dùng cho mục 9). Chọn B thì script đã sinh sẵn; chọn A mà chưa có thì thêm, còn nếu lab từng lưu key trên giao diện thì phải dùng lại đúng khóa cũ:
   ```bash
   grep -q '^SECRETS_ENCRYPTION_KEY=' .env.prod || echo "SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env.prod
   ```
5. Kiểm tra:
   ```bash
   ./init-env-prod.sh --check      # phải 0 lỗi
   ```
   Cảnh báo `CORS_ORIGIN đang là localhost` là bình thường nếu bạn chỉ vào bằng SSH tunnel.

Sao lưu `.env.prod` ở nơi an toàn: mất `SECRETS_ENCRYPTION_KEY` thì các API key đã nhập trên giao diện không giải mã được nữa.

## 5. Dùng cấu hình lab

```bash
cp config/config.lab.json config/config.json
```
Bản này: 4 nguồn thật tắt; `ECHO_DEMO` trỏ `http://mock-echo:4200`; các nguồn `SA_*` trỏ `http://simple-api:8080`.
Nếu cần giữ chỉnh sửa trên lab trước đó, đối chiếu: `diff /root/kit.old/config/config.json config/config.json`. Đừng copy đè bản cũ nếu nó ở định dạng cũ (API từ chối khởi động).

## 6. Chạy

```bash
dcl() { docker compose -p app-tra-cuu-kit -f docker-compose.prod.yml -f docker-compose.lab.yml --env-file .env.prod "$@"; }
grep -n "app_tra_cuu:" docker-compose.prod.yml     # api-v13 và web-v16
dcl pull
dcl up -d
dcl ps
```
Mong đợi: `api`, `web`, `postgres` là `healthy`; `simple-api`, `mock-echo` là `Up`; `config-perms`, `migrate`, `seed` là `Exited (0)`.

Hàm `dcl` mất khi đóng phiên SSH; vào lại phải gõ lại. **Luôn dùng `dcl` (có cả hai file)**; nếu lỡ dùng lệnh thiếu `-f docker-compose.lab.yml` thì hai API giả bị coi là container thừa.

## 7. Kiểm tra

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/api/v1/health     # 200
dcl logs api --tail 30
```
Vào `http://<IP-máy-lab>:8082/login` (hoặc SSH tunnel: `ssh -L 9082:localhost:8082 root@<IP>` rồi `http://localhost:9082/login`).
Chọn A: tài khoản cũ. Chọn B: `admin` + mật khẩu in ở bước 4, lần đầu bị buộc đổi.

Thử từng nguồn mẫu trên màn hình tra cứu:

| Nguồn | Nhập | Kết quả đúng |
|---|---|---|
| `SA_SEARCH_POST` | `param1` = `a` | Có bảng kết quả |
| `SA_SEARCH_GET` | `param1` = `a` | Có bảng kết quả |
| `SA_IMAGES` | `count` = `2` | Hiện ảnh |
| `SA_IMAGES_BADKEY` | `count` = `2` | Báo lỗi: upstream từ chối key (401); đây là **kết quả đúng** |
| `ECHO_DEMO` | `soHC` = `B1234567` | Kết quả lặp lại đúng giá trị bạn nhập |

Nếu `admin` không thấy nguồn nào: kiểm tra `dcl logs seed` và chạy lại `dcl --profile db-setup run --rm seed` một lần.

## 8. Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `pull` báo `manifest unknown` | Tag chưa có trên Docker Hub | Kiểm tra tên tag trong compose |
| `api` restart liên tục, log báo không kết nối DB | Chọn A nhưng `POSTGRES_PASSWORD` khác volume cũ | Dùng lại `.env.prod` cũ, hoặc chọn B |
| `api` không lên, log báo biến `*_BASE_URL`/`*_API_KEY` chưa đặt | Có nguồn **đang bật** thiếu biến | Dùng `config.lab.json` (mục 5), hoặc tắt nguồn đó, hoặc thêm biến |
| `api` không lên, log báo config không hợp lệ | `config.json` định dạng cũ | Dùng bản từ git |
| Nguồn `SA_*`/`ECHO_DEMO` báo lỗi kết nối | Chạy thiếu file lab | Chạy lại bằng `dcl`; `dcl ps` phải thấy `simple-api`, `mock-echo` |
| `permission denied` ở `config/` hoặc `logs/` | uid 1000 không ghi được | `chown -R 1000:1000 config logs`; NFS/SELinux xem `docs/deployment-guide.md` |
| Lưu nguồn trên giao diện báo lỗi quyền | Như trên | Như trên |
| Quên mật khẩu admin | | Mục "Xử lý sự cố" trong `deployment-guide.md` |

## 9. Khi có API thật của đối tác

Không cần dựng lại gì. Làm trên giao diện: **Quản trị → Nguồn dữ liệu**, mở nguồn tương ứng (ví dụ `PASSPORT_INFO`):

1. **Địa chỉ API (`baseUrl`)**: ghi thẳng URL, ví dụ `http://10.10.10.50:8080`. Phải truy cập được **từ trong container `api`** (không dùng `localhost`).
2. **API key**: nhập vào ô **API key**. Server mã hóa và lưu trong Postgres; không ghi vào `config.json` hay `.env.prod`, không hiển thị lại. Cần `SECRETS_ENCRYPTION_KEY` (bước 4).
3. Bật nguồn (công tắc bật/tắt), lưu. Áp dụng ngay, không restart.

Nếu bên đối tác bắt buộc cấp key qua biến môi trường: thêm `<TÊN>_BASE_URL`, `<TÊN>_API_KEY` vào `.env.prod`, chạy `dcl up -d` một lần, rồi chọn tên biến trong form.

Đủ API thật và không cần hai API giả nữa: tắt các nguồn `SA_*`, `ECHO_DEMO` trên giao diện. Muốn bỏ luôn hai container: chạy bằng `docker compose -p app-tra-cuu-kit -f docker-compose.prod.yml --env-file .env.prod up -d --remove-orphans` (không có file lab), và xóa chúng khỏi `config.json`.

**Đưa config lab lên prod:** `config.json` sửa trên giao diện chỉ nằm trên máy lab, không tự vào git. Muốn dùng lại ở prod, copy phần nguồn đó vào `config.json` của prod (hoặc thêm lại trên giao diện prod). API key không đi theo: nhập lại trên prod.

## 10. Quay về bản cũ

```bash
dcl down
rm -rf /root/kit && mv /root/kit.old /root/kit          # hoặc kit.bak-<ngày>
cd /root/kit && docker compose -p app-tra-cuu-kit -f docker-compose.prod.yml --env-file .env.prod up -d
```
Quay về image cũ: đổi tag trong `docker-compose.prod.yml` rồi `pull` + `up -d`.

## 11. Lần cập nhật sau

Không cần xóa thư mục. Trên máy dev: sửa code, build và push image, chạy `scripts/sync-deploy-check.sh`, commit, push. Trên lab: cập nhật lại `deploy-check` (mục 3, ghi đè file nhưng **giữ `.env.prod`, `config/`**), rồi `dcl pull && dcl up -d`.

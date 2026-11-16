# Deploy api-v12 / web-v15 lên lab (stack `kit`) và lấy link cho leader

Máy lab: `10.10.10.110`, **dùng chung với nhiều stack của người khác**. Chỉ động vào stack
`app-tra-cuu-kit` (thư mục `/root/kit`, web cổng **8082**).

| Stack compose | Thư mục | Web | Của ai | Được động vào? |
|---|---|---|---|---|
| `app-tra-cuu-kit` | `/root/kit` | 8082 | của mình | **Có** |
| `app-tra-cuu-du-lieu-prod` | `/root/egor/API-tra-c-u` | 8081 | Egor | **Không** |
| `platform`, `jasmin`, `secure-share` (cổng 80), `pub2kafka`, `fastapi-sparkjob` | nhiều nơi | khác | người khác | **Không** |

**Cấm** trên lab: `docker system prune`, `docker rm $(docker ps -aq)`, `docker volume prune`,
`docker compose down -v`. Chúng xóa container/volume của người khác hoặc mất dữ liệu DB.

## Phát hiện lúc kiểm tra (2026-11-12)

- `app-tra-cuu-kit-postgres-1` **đang Exited (0) từ 31 giờ trước**, trong khi `kit-api` và `kit-web` vẫn
  báo Up/healthy. Nếu leader hoặc Egor thấy lỗi khi dùng bản kit thì rất có thể do DB đang tắt. Bước 4
  (`up -d`) sẽ bật lại DB, dữ liệu nằm trong volume nên không mất.
- Cả hai stack (`kit` và `egor`) đang chạy `api-v9` / `web-v12`.

## 0. Trên lab: pull 2 image từ Docker Hub

Image `gthanh/app_tra_cuu:api-v12` và `web-v15` đã push lên Docker Hub (public, không cần `docker login`).
Sau khi SSH vào lab (`ssh root@10.10.10.110`):

```bash
docker pull gthanh/app_tra_cuu:api-v12
docker pull gthanh/app_tra_cuu:web-v15
```
- `manifest unknown` nghĩa là tag chưa có trên Hub hoặc gõ sai.
- Lỗi mạng/timeout nghĩa là lab không ra Internet. Khi đó chạy từ **máy local** (không phải trong phiên SSH vào lab):
  `docker save gthanh/app_tra_cuu:api-v12 gthanh/app_tra_cuu:web-v15 | gzip | ssh root@10.10.10.110 'gunzip | docker load'`

## 1. Vào lab, kiểm tra

```bash
ssh root@10.10.10.110
docker images | grep app_tra_cuu            # phải thấy api-v12 và web-v15
df -h /var/lib/docker                       # còn đủ chỗ (>= vài GB)
ls -la /root/kit                            # phải có docker-compose.prod.yml và .env.prod
grep -nE "image:|WEB_PORT" /root/kit/docker-compose.prod.yml /root/kit/.env.prod
```

## 2. Sao lưu trước khi đổi (bắt buộc)

```bash
cd /root/kit
cp docker-compose.prod.yml docker-compose.prod.yml.bak-$(date +%y%m%d-%H%M)
docker compose -f docker-compose.prod.yml --env-file .env.prod ps -a     # ghi lại hiện trạng
```
Nếu muốn backup DB: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres`
rồi `exec -T postgres pg_dump` (xem mục Backup trong [deployment-guide.md](deployment-guide.md)).

## 3. Gỡ container cũ của stack `kit` và đổi tag image

```bash
cd /root/kit
docker compose -f docker-compose.prod.yml --env-file .env.prod down      # KHÔNG thêm -v
sed -i 's#app_tra_cuu:api-v9#app_tra_cuu:api-v12#g; s#app_tra_cuu:web-v12#app_tra_cuu:web-v15#g' docker-compose.prod.yml
grep -n "image:" docker-compose.prod.yml                                  # kiểm tra: api-v12, web-v15
```
`down` chỉ gỡ container và network của project `app-tra-cuu-kit`. Volume Postgres vẫn còn, và `-p`/tên
project giúp không đụng stack khác. Nếu compose của kit đang ghi tag khác `api-v9`/`web-v12` thì sửa tay
hai dòng `image:` thay cho `sed`.

## 4. Dựng lại

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps -a
```
- Service `migrate` tự chạy migration mới của v12 (thêm 2 index cho `query_logs`), `seed` đồng bộ lại
  tài khoản admin theo `BOOTSTRAP_ADMIN_PASSWORD` trong `.env.prod` **nếu admin chưa đăng nhập lần đầu**.
- `migrate`, `seed`, `config-perms` ở trạng thái `Exited (0)` là bình thường.
- `web`, `api`, `postgres` phải `Up (healthy)`. Xem log nếu không: `docker logs app-tra-cuu-kit-api-1 --tail 50`.

## 5. Kiểm tra trên lab

```bash
curl -s localhost:8082/api/v1/health
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep kit
```

## 6. Link cho leader

**http://10.10.10.110:8082**  (đăng nhập `admin`)

- Leader phải cùng mạng nội bộ hoặc bật VPN thì mới vào được `10.10.10.x`. Nếu leader không cùng mạng thì
  cần một đường ra Internet (tunnel hoặc reverse proxy do bên quản lý lab cấp); chưa làm trong tài liệu này.
- Cổng 8082 phải được phép từ máy leader. Kiểm tra từ một máy khác trong mạng: `curl -I http://10.10.10.110:8082`.
- Mật khẩu admin: dùng giá trị `BOOTSTRAP_ADMIN_PASSWORD` trong `/root/kit/.env.prod` nếu chưa ai đổi. Nếu đã đổi
  và quên thì reset trong container api (ghi vào DB kit, xem mục "Quên mật khẩu" trong deployment-guide).

## Rollback nếu lỗi

```bash
cd /root/kit
cp docker-compose.prod.yml.bak-<giờ> docker-compose.prod.yml
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```
Lưu ý: migration index của v12 vẫn nằm trong DB sau khi rollback, nhưng chỉ là index nên không ảnh hưởng
bản v9 chạy lại.

## Không đụng tới

Stack của Egor (`app-tra-cuu-du-lieu-prod`, cổng 8081) vẫn chạy `api-v9`/`web-v12`. Muốn nâng cấp stack đó
thì báo Egor làm, hoặc xin phép trước.

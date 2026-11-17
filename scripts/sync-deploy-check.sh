#!/usr/bin/env bash
# Đồng bộ thư mục deploy-check/ (bộ file đem đi deploy lab/prod) từ nguồn trong repo.
# deploy-check/ KHÔNG được sửa tay các file dưới đây: sửa ở nguồn rồi chạy lại script này.
#
#   scripts/sync-deploy-check.sh           chép nguồn -> deploy-check/ và in file nào đã đổi
#   scripts/sync-deploy-check.sh --check   chỉ kiểm tra; mã thoát 1 nếu deploy-check/ đang lệch (dùng trong CI)
#   scripts/sync-deploy-check.sh --zip     đồng bộ rồi tạo deploy-check.zip (LOẠI .env.prod và mọi .bak)
#
# Nguồn -> đích:
#   docker-compose.prod.yml, docker/{api,web}.Dockerfile, docker/nginx.conf, docker/api-entrypoint.sh
#   config/config.schema.json, .env.prod.example, scripts/init-env-prod.sh (-> init-env-prod.sh)
#   docs/deployment-guide.md (-> deployment-guide.md), docs/docker-images-explained.md
#   apps/api/prisma/migrations/*/migration.sql -> schema/NN-<tên>.sql (đánh số theo thứ tự migration)
# KHÔNG đồng bộ: config/config.json (cấu hình phát hành, chỉnh có chủ đích), .env.prod (secret thật của từng máy).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MODE=sync
[ "${1:-}" = "--check" ] && MODE=check
[ "${1:-}" = "--zip" ] && MODE=zip
DC=deploy-check
changed=0

put() { # put SRC DST : chép nếu khác
  local src="$1" dst="$DC/$2"
  [ -f "$src" ] || { echo "THIẾU nguồn: $src" >&2; exit 2; }
  if [ ! -f "$dst" ] || ! cmp -s "$src" "$dst"; then
    changed=$((changed+1)); echo "  ~ $2"
    [ "$MODE" = check ] || { mkdir -p "$(dirname "$dst")"; cp -p "$src" "$dst"; }
  fi
}

echo "Đồng bộ $DC/ (chế độ: $MODE)"
put docker-compose.prod.yml docker-compose.prod.yml
put docker/api.Dockerfile docker/api.Dockerfile
put docker/web.Dockerfile docker/web.Dockerfile
put docker/nginx.conf docker/nginx.conf
put docker/api-entrypoint.sh docker/api-entrypoint.sh
put config/config.schema.json config/config.schema.json
put .env.prod.example .env.prod.example
put scripts/init-env-prod.sh init-env-prod.sh
put docs/deployment-guide.md deployment-guide.md
put docs/docker-images-explained.md docker-images-explained.md

# Schema SQL cho PG có sẵn: sinh từ các migration, giữ tên/số thứ tự ổn định (01-init, 02-..., ...)
n=0
for dir in $(ls -d apps/api/prisma/migrations/*/ | sort); do
  n=$((n+1)); name="$(basename "$dir")"; slug="${name#*_}"; slug="${slug//_/-}"
  put "$dir/migration.sql" "schema/$(printf '%02d' "$n")-$slug.sql"
done
# File SQL thừa (migration đã bị bỏ/đổi tên) cũng là lệch
for f in "$DC"/schema/*.sql; do
  base="$(basename "$f")"; found=0
  n=0; for dir in $(ls -d apps/api/prisma/migrations/*/ | sort); do
    n=$((n+1)); name="$(basename "$dir")"; slug="${name#*_}"; slug="${slug//_/-}"
    [ "$base" = "$(printf '%02d' "$n")-$slug.sql" ] && found=1
  done
  [ "$found" = 1 ] || { echo "  ! file thừa: schema/$base (không còn migration tương ứng, xóa tay nếu đúng)"; changed=$((changed+1)); }
done

# Cảnh báo: secret thật không được nằm trong bộ phát hành
if [ -f "$DC/.env.prod" ]; then
  echo "  ! $DC/.env.prod tồn tại trên máy này (chứa secret thật). KHÔNG được đóng vào bộ gửi đi; --zip tự loại nó."
fi
# Cảnh báo: image tag trong compose phải có thật trên Docker Hub (chỉ kiểm tra cú pháp ở đây)
grep -oE 'gthanh/app_tra_cuu:[a-z0-9.-]+' "$DC/docker-compose.prod.yml" | sort -u | sed 's/^/  image dùng: /'

if [ "$MODE" = check ]; then
  if [ "$changed" -gt 0 ]; then echo "LỆCH: $changed mục. Chạy scripts/sync-deploy-check.sh rồi commit." >&2; exit 1; fi
  echo "deploy-check/ khớp nguồn."; exit 0
fi
echo "Xong: $changed mục đã cập nhật."

if [ "$MODE" = zip ]; then
  rm -f deploy-check.zip
  (cd "$DC/.." && zip -qr deploy-check.zip deploy-check -x 'deploy-check/.env.prod' 'deploy-check/.env.prod.bak*' 'deploy-check/*.bak' 'deploy-check/config/*.bak' 'deploy-check/logs/*')
  echo "Đã tạo deploy-check.zip ($(du -h deploy-check.zip | cut -f1)), không chứa .env.prod."
fi

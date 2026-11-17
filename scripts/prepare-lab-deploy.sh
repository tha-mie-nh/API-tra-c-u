#!/usr/bin/env bash
# Chuẩn bị TOÀN BỘ bộ file deploy cho máy lab ở MÁY LOCAL, để chỉ việc `scp` lên lab rồi `docker compose up`.
# Lab không cần git, không cần repo: mọi thứ (compose, config, .env.prod, API tra cứu giả) đã nằm trong thư mục tạo ra.
#
#   scripts/prepare-lab-deploy.sh --cors-origin http://10.10.10.110:8082 [--web-port 8082] [--out ~/lab-deploy]
#                                 [--stand-in simple-api,mock-echo|none] [--no-pull]
#
# Làm gì: chép deploy-check/ -> OUT; sinh .env.prod bằng init-env-prod.sh (secret mới, quyền 600); điền giá trị giữ chỗ
# cho 4 API thật chưa có; thêm API tra cứu giả đã chọn (docker-compose.stand-in.yml + các nguồn tương ứng trong
# config/config.json, địa chỉ là TÊN dịch vụ trong mạng Docker); pull trước image API giả để chắc chắn tồn tại; chạy --check.
# KHÔNG đụng deploy-check/ trong repo. Không dùng cho production (API giả).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT="$HOME/lab-deploy"; CORS=""; WEB_PORT="8082"; STAND_IN="simple-api,mock-echo"; PULL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --out) shift; OUT="${1:?--out cần thư mục}" ;;
    --cors-origin) shift; CORS="${1:?--cors-origin cần URL}" ;;
    --web-port) shift; WEB_PORT="${1:?--web-port cần số cổng}" ;;
    --stand-in) shift; STAND_IN="${1:?--stand-in cần danh sách hoặc none}" ;;
    --no-pull) PULL=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Tham số lạ: $1 (dùng --help)" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$CORS" ] || { echo "Thiếu --cors-origin (địa chỉ web người dùng gõ vào trình duyệt, vd http://10.10.10.110:8082)" >&2; exit 2; }
[ -e "$OUT" ] && { echo "$OUT đã tồn tại, không ghi đè. Xóa nó (chứa secret cũ) hoặc chọn --out khác." >&2; exit 1; }
for tool in openssl python3; do command -v "$tool" >/dev/null || { echo "Thiếu $tool" >&2; exit 2; }; done

echo "[1/5] Chép deploy-check/ -> $OUT"
mkdir -p "$OUT"; cp -a deploy-check/. "$OUT"/
rm -f "$OUT"/.env.prod "$OUT"/.env.prod.bak* "$OUT"/config/*.bak "$OUT"/docker-compose.stand-in.yml; rm -rf "$OUT"/logs

echo "[2/5] Sinh .env.prod (secret mới) và điền giá trị"
"$OUT/init-env-prod.sh" --out "$OUT/.env.prod" | grep -A1 "Mật khẩu khởi tạo" | tail -1 | sed 's/^ */  Mật khẩu admin (GHI LẠI, chỉ hiện một lần): /'
sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=$CORS|; s|^WEB_PORT=.*|WEB_PORT=$WEB_PORT|" "$OUT/.env.prod"
# 4 API thật chưa có: giá trị giữ chỗ để api vẫn khởi động (tra cứu các nguồn đó báo lỗi kết nối cho tới khi thay bằng giá trị thật)
sed -i -E 's#^(IMMIGRATION_HISTORY|PASSPORT_INFO|DRIVER_LICENSE|FACE_PHOTO)_BASE_URL=.*#\1_BASE_URL=http://api-chua-co.invalid#; s#^(IMMIGRATION_HISTORY|PASSPORT_INFO|DRIVER_LICENSE|FACE_PHOTO)_API_KEY=.*#\1_API_KEY=chua-co-key#' "$OUT/.env.prod"

echo "[3/5] API tra cứu giả: $STAND_IN"
if [ "$STAND_IN" != none ]; then
  python3 - "$OUT" "$STAND_IN" "$PULL" <<'PY'
import json, subprocess, sys
out, wanted, pull = sys.argv[1], [s for s in sys.argv[2].split(',') if s], sys.argv[3] == '1'
spec = json.load(open('scripts/lab-stand-in-datasources.json'))
unknown = [w for w in wanted if w not in spec]
if unknown: sys.exit(f"Không có API giả: {unknown}. Có: {list(spec)}")
cfg_path = f"{out}/config/config.json"
cfg = json.load(open(cfg_path))
codes = {d['code'] for d in cfg['datasources']}
lines = ["# API giả cho lab (không dùng cho production): cùng mạng Docker với `api`, không mở cổng ra ngoài.", "services:"]
for name in wanted:
    s = spec[name]
    if pull:
        print(f"  pull {s['image']}"); subprocess.run(['docker', 'pull', '-q', s['image']], check=True, stdout=subprocess.DEVNULL)
    lines += [f"  {name}:", f"    image: {s['image']}", "    restart: unless-stopped", "    networks: [backend]"]
    if name == 'mock-echo': lines += ["    environment:", "      PORT: 4200"]
    for ds in s['datasources']:
        if ds['code'] in codes: sys.exit(f"config.json đã có nguồn {ds['code']}")
        cfg['datasources'].append(ds)
open(f"{out}/docker-compose.stand-in.yml", 'w').write('\n'.join(lines) + '\n')
json.dump(cfg, open(cfg_path, 'w'), ensure_ascii=False, indent=2); open(cfg_path, 'a').write('\n')
print("  đã thêm nguồn:", [d['code'] for n in wanted for d in spec[n]['datasources']])
PY
fi

# Nguồn SA_IMAGES / SA_IMAGES_BADKEY đọc key từ biến môi trường (giá trị demo công khai của simple-api, không phải secret thật)
case ",$STAND_IN," in *,simple-api,*)
  printf 'SIMPLE_IMAGES_API_KEY=my-secret-key\nSIMPLE_BADKEY_API_KEY=wrong-key\n' >> "$OUT/.env.prod" ;;
esac

echo "[4/5] Kiểm tra .env.prod"
"$OUT/init-env-prod.sh" --check --out "$OUT/.env.prod" | tail -3

echo "[5/5] Xong. Thư mục: $OUT (chứa secret thật của lab: không commit, không gửi qua chat)"
echo "      Tiếp: scp -rp $OUT root@<IP-lab>:/root/kit   (xem docs/huong-dan-deploy-lai-lab.md)"

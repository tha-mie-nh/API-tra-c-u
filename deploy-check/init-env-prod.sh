#!/usr/bin/env bash
# Tạo .env.prod trên MÁY ĐÍCH từ .env.prod.example, sinh secret mới tại chỗ.
#
#   ./init-env-prod.sh                 tạo .env.prod (từ chối nếu đã có)
#   ./init-env-prod.sh --force         ghi đè (file cũ được lưu thành .env.prod.bak-<giờ>, quyền 600)
#   ./init-env-prod.sh --check         kiểm tra .env.prod đã đủ và an toàn chưa (mã thoát 1 nếu chưa)
#   ./init-env-prod.sh --out FILE      ghi ra FILE khác thay cho .env.prod
#
# Không bao giờ đọc/ghi secret của môi trường khác: mọi secret sinh mới bằng openssl trên máy này.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE=create
FORCE=0
OUT=".env.prod"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --force) FORCE=1 ;;
    --out) shift; OUT="${1:?--out cần tên file}" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Tham số lạ: $1 (dùng --help)" >&2; exit 2 ;;
  esac
  shift
done

find_example() {
  for d in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$PWD"; do
    [ -f "$d/.env.prod.example" ] && { echo "$d/.env.prod.example"; return; }
  done
  echo "Không thấy .env.prod.example cạnh script" >&2; exit 2
}

get() { { grep -E "^$1=" "$OUT" || true; } | head -1 | cut -d= -f2-; }
set_kv() { # set_kv KEY VALUE (giá trị chỉ gồm ký tự an toàn: chữ, số, - _ . : / @)
  local tmp; tmp="$(mktemp)"
  awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k && !done {print k"="v; done=1; next} {print}' "$OUT" > "$tmp"
  cat "$tmp" > "$OUT"; rm -f "$tmp"
}

if [ "$MODE" = check ]; then
  [ -f "$OUT" ] || { echo "Không có $OUT. Chạy ./init-env-prod.sh trước." >&2; exit 1; }
  errors=0; warn=0
  bad() { echo "  [LỖI] $*"; errors=$((errors+1)); }
  note() { echo "  [CẢNH BÁO] $*"; warn=$((warn+1)); }
  while IFS= read -r line; do bad "chưa điền: ${line%%=*}"; done < <(grep -E '=(__GENERATE__|__SET_ME__)' "$OUT" | grep -vE '^\s*#' || true)
  for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
    v="$(get $k)"; [ "${#v}" -ge 32 ] || bad "$k quá ngắn (cần >= 32 ký tự)"
    case "$v" in change_me*|*secret*) bad "$k còn là giá trị mẫu";; esac
  done
  [ "$(get JWT_ACCESS_SECRET)" != "$(get JWT_REFRESH_SECRET)" ] || bad "JWT_ACCESS_SECRET và JWT_REFRESH_SECRET đang giống nhau"
  case "$(get POSTGRES_PASSWORD)" in app_password|password|"") bad "POSTGRES_PASSWORD là giá trị mặc định/trống";; esac
  case "$(get DATABASE_URL)" in *"$(get POSTGRES_PASSWORD)"*) ;; *) note "DATABASE_URL không chứa POSTGRES_PASSWORD (đúng nếu dùng PG có sẵn của tổ chức)";; esac
  case "$(get BOOTSTRAP_ADMIN_PASSWORD)" in change_me*|"") bad "BOOTSTRAP_ADMIN_PASSWORD còn là giá trị mẫu/trống";; esac
  v="$(get BOOTSTRAP_ADMIN_PASSWORD)"; [ "${#v}" -ge 12 ] || bad "BOOTSTRAP_ADMIN_PASSWORD ngắn hơn 12 ký tự"
  v="$(get SECRETS_ENCRYPTION_KEY)"; printf '%s' "$v" | grep -qE '^[0-9a-fA-F]{64}$' || bad "SECRETS_ENCRYPTION_KEY thiếu/sai (cần 64 ký tự hex). Thêm: echo \"SECRETS_ENCRYPTION_KEY=\$(openssl rand -hex 32)\" >> $OUT"
  [ "$(get NODE_ENV)" = production ] || bad "NODE_ENV phải là production"
  [ "$(get ALLOW_MOCK_DATASOURCES)" = false ] || note "ALLOW_MOCK_DATASOURCES khác false"
  case "$(get CORS_ORIGIN)" in *localhost*|*127.0.0.1*) note "CORS_ORIGIN đang là localhost";; esac
  for k in $(grep -E '_BASE_URL=' "$OUT" | grep -vE '^\s*#' | cut -d= -f1); do
    case "$(get $k)" in *localhost*|*127.0.0.1*) note "$k trỏ localhost: trong container api, localhost là chính container";; esac
  done
  perm="$(stat -c %a "$OUT" 2>/dev/null || echo ?)"; [ "$perm" = 600 ] || note "quyền file là $perm, nên là 600 (chmod 600 $OUT)"
  echo "Kết quả: $errors lỗi, $warn cảnh báo."
  [ "$errors" -eq 0 ]; exit $?
fi

EXAMPLE="$(find_example)"
if [ -e "$OUT" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "$OUT đã tồn tại, không ghi đè. Dùng --force nếu thật sự muốn tạo lại (file cũ sẽ được lưu .bak)." >&2
    exit 1
  fi
  bak="$OUT.bak-$(date +%y%m%d-%H%M%S)"; cp -p "$OUT" "$bak"; chmod 600 "$bak"
  echo "Đã lưu bản cũ: $bak (chứa secret cũ, xóa khi không cần)."
fi

: > "$OUT"; chmod 600 "$OUT"      # tạo file quyền 600 TRƯỚC khi ghi secret vào
cat "$EXAMPLE" > "$OUT"

pw_pg="$(openssl rand -hex 24)"
pw_admin="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)Aa9"
set_kv JWT_ACCESS_SECRET "$(openssl rand -hex 32)"
set_kv JWT_REFRESH_SECRET "$(openssl rand -hex 32)"
set_kv SECRETS_ENCRYPTION_KEY "$(openssl rand -hex 32)"
set_kv POSTGRES_PASSWORD "$pw_pg"
set_kv BOOTSTRAP_ADMIN_PASSWORD "$pw_admin"
set_kv DATABASE_URL "postgresql://$(get POSTGRES_USER):$pw_pg@postgres:5432/$(get POSTGRES_DB)"

echo "Đã tạo $OUT (quyền 600) từ $(basename "$EXAMPLE")."
echo
echo "  Mật khẩu khởi tạo của tài khoản admin (chỉ in ra MỘT lần, cũng nằm trong $OUT):"
echo "    $pw_admin"
echo
left="$(grep -E '=__SET_ME__' "$OUT" | grep -vE '^\s*#' | cut -d= -f1 || true)"
if [ -n "$left" ]; then
  echo "  Còn phải TỰ ĐIỀN các biến sau trong $OUT (nano $OUT):"
  echo "$left" | sed 's/^/    - /'
else
  echo "  Không còn biến nào phải điền tay."
fi
echo
echo "  Xong thì chạy: ./$(basename "$0") --check"

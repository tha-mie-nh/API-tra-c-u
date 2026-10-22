# Image Docker được đóng gói như thế nào

Không cần đọc để chạy app — xem `deployment-guide.md` là đủ (chỉ `pull` image có sẵn, không tự
build). Dành cho ai muốn kiểm tra bên trong image có gì trước khi tin tưởng chạy. Bản gốc 2 file
nằm cạnh tài liệu này: `docker/api.Dockerfile`, `docker/web.Dockerfile`.

## Multi-stage build

Cả 2 Dockerfile build nhiều giai đoạn:

```
base → deps → build → runtime   (chỉ "runtime" trở thành image thật)
```

- `base`/`deps`/`build`: xưởng tạm — cài công cụ build, tải thư viện, biên dịch TypeScript →
  JavaScript. Không bao giờ đi vào image cuối.
- `runtime`: image thật chạy trên server — chỉ copy sản phẩm đã biên dịch (`dist/*.js`), không
  mang theo mã nguồn `.ts` gốc, không mang theo công cụ build/`devDependencies`.

Image cuối nhỏ hơn, không ai đọc được code TypeScript gốc chỉ bằng cách tải image về.

## `docker/api.Dockerfile` — Backend (NestJS)

| Giai đoạn | Làm gì |
|---|---|
| `base` | Node.js 22 (Debian slim), cài `openssl`/`ca-certificates` |
| `deps` | Cài thư viện (`pnpm install`) |
| `build` | Biên dịch TypeScript → JavaScript, sinh Prisma Client |
| `runtime` | Chỉ cài thư viện bản production, copy code đã biên dịch + migration Prisma |

Lựa chọn bảo mật/vận hành:
- `USER node` — không chạy bằng root.
- `tini` làm tiến trình số 1 — `docker stop` tắt app đúng cách, không treo 10s rồi bị kill cứng.
- `HEALTHCHECK` gọi `GET /api/v1/health` mỗi 30s.
- Xóa `npm`/`npx`/`corepack` khỏi image cuối — không dùng tới lúc chạy.
- `EXPOSE 3000` — cổng nội bộ, không tự mở ra ngoài (`api` không publish cổng nào ra host).

## `docker/web.Dockerfile` — Frontend (React, build xong) + nginx

| Giai đoạn | Làm gì |
|---|---|
| `base`/`deps`/`build` | Biên dịch React/TypeScript thành file tĩnh |
| `runtime` | Image `nginx:1.27-alpine` chính thức, copy file tĩnh + `docker/nginx.conf` |

Lựa chọn bảo mật/vận hành:
- `USER nginx` — không chạy bằng root.
- `apk upgrade` — vá gói hệ thống (OpenSSL...) lúc build.
- Cổng `8080` không phải `80` — cổng `<1024` cần quyền root.
- `docker/nginx.conf` phục vụ giao diện và chuyển tiếp `/api/v1/*` sang backend.

## Image cuối không chứa gì

- Không có mã nguồn TypeScript gốc — chỉ có bản đã biên dịch.
- Không có `.env`/secret nào — secret chỉ đưa vào lúc chạy container, qua `.env.prod`.
- Không có `devDependencies`.
- Quét ClamAV (malware) + Trivy (lỗ hổng bảo mật) trước mỗi lần đẩy lên Docker Hub — xem
  `docs/security-checklist.md`.

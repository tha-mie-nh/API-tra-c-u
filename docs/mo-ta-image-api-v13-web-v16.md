# Mô tả image phát hành: api-v13, web-v16 (và mock-echo)

Tài liệu mô tả image phát hành: image nào, chứa gì, khác bản trước ra sao, cách chạy và lưu ý khi nâng cấp.
Chi tiết cách đóng gói (multi-stage, bảo mật) xem `deploy-check/docker-images-explained.md`.

## 1. Danh sách image

Tất cả nằm trong repo Docker Hub công khai `gthanh/app_tra_cuu`.

| Image | Vai trò | Digest | Kích thước |
|---|---|---|---|
| `gthanh/app_tra_cuu:api-v13` | Backend NestJS (tra cứu, quản trị, log) | `sha256:91ad7425ef08a3d6194bcc882586028d5fc1e482bb5567138bb5ec0b8b041a30` | ~881 MB |
| `gthanh/app_tra_cuu:web-v16` | Giao diện React đã build + nginx | `sha256:055778e52963822198fdaa9ca91ff31cafff986e24e6a0c23b9406d70fbe50fe` | ~99 MB |
| `gthanh/app_tra_cuu:mock-echo-v1` | API giả để kiểm thử/trace (không dùng ở production) | `sha256:87bb5c36004e854919b381186b517566eb33399ac76c3876bc16b2fae55dc0af` | ~239 MB |
| `mock-echo-v2` (chỉ build trên máy, chưa push) | Như v1, thêm tham số cho kiểm thử tải (jitter, tỉ lệ lỗi, chế độ im lặng) | — | ~239 MB |

Bản trước: `api-v12` / `web-v15`. Tag cũ giữ nguyên, không bị ghi đè.

## 2. Thành phần bên trong

### api-v13 (backend)
- Node.js 22 (Debian slim), chạy bằng user `node` (không root), `tini` làm tiến trình số 1.
- Mã đã biên dịch (không có mã nguồn TypeScript), migration Prisma, script seed.
- Cổng 3000 (nội bộ, không publish ra host). Có `HEALTHCHECK` gọi `GET /api/v1/health`.
- **Không chứa** `config.json` hay secret: `config/` được mount từ ngoài, secret nằm trong `.env.prod`.

### web-v16 (frontend + nginx)
- `nginx:1.27-alpine`, chạy bằng user `nginx`, cổng 8080.
- Phục vụ giao diện và chuyển tiếp `/api/v1/*` sang container `api:3000` (frontend và backend cùng origin, nên không cần cấu hình CORS cho người dùng thường).
- Đã `apk upgrade` khi build: `libxslt 1.1.42-r3` (vá 4 CVE).

### mock-echo-v1 (chỉ để kiểm thử)
- Mọi method/path trả 200 kèm bản ghi mặc định và khối `echo` (method, URL, query, header đã che khóa, body).
- Biến môi trường: `MOCK_ECHO_DELAY_MS`, `MOCK_ECHO_STATUS`, `MOCK_ECHO_FAIL_FIRST`, `MOCK_ECHO_FAIL_MODE=reset|503`, `MOCK_ECHO_RESPONSE`. Bản v2 (chưa push) thêm `MOCK_ECHO_JITTER_MS`, `MOCK_ECHO_FAIL_RATE`, `MOCK_ECHO_QUIET`, dùng cho kiểm thử tải (xem `docs/ket-qua-kiem-thu-tai-api-v13.md`).

## 3. Khác gì so với api-v12 / web-v15

**Sửa lỗi**
- Ngày/giờ không sort; datetime sai định dạng hoặc hiện `-`; lưu form admin làm mất `format`.
- Lần đầu tra cứu lỗi (502) rồi lần sau mới được: cấu hình `defaults.retry` trước đây không được áp dụng.
- Form nguồn dữ liệu mất URL/tên biến API key khi xóa cache.
- Lưu form admin làm mất khóa cấu hình form không biết (như `labelField`).
- Phiên đăng nhập gọi `/auth/me` khi chưa có token (luôn 401 rồi refresh thừa).
- `displayFormat` bị schema từ chối khi lưu.
- Giá trị ngày không phải ISO không còn bị đọc kiểu tháng/ngày của Mỹ.

**Bản build 2026-11-17 (ghi đè tag)** bổ sung: schema cấu hình nằm trong image; định dạng ngày và `in: body|query` cho trường input; ảnh base64 hiển thị trực tiếp, xem lớn 80%; mã lỗi `UPSTREAM_UNAUTHORIZED`; ngày giờ không kèm múi giờ được ghim về UTC (hoặc múi giờ nguồn); response mảng ở gốc.

**Tính năng mới**
- Chọn định dạng đọc/hiển thị ngày, múi giờ nguồn và múi giờ hiển thị cho từng trường.
- Trang **Danh mục** (enum dictionary), trường dùng lại danh mục.
- Chỉ map một lần: key theo API là tên trường, tên hiển thị là nhãn.
- Query param tĩnh cho nguồn dữ liệu (`tab=1` thành `?tab=1`).
- Log backend dạng `asctime - LEVEL - context - message`: mỗi request/response, truy vấn, lần gọi upstream, lỗi kèm nguyên nhân; ghi thêm ra file nếu đặt `LOG_FILE`.
- Frontend gửi `X-Request-Id`, log `warn/error` ra console kèm id để khớp với log backend.
- Giao diện mới (màu, bố cục).

## 4. Cách chạy

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Biến môi trường chính (đặt trong `.env.prod`): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `CORS_ORIGIN`, `TRUST_PROXY`, `*_BASE_URL` / `*_API_KEY` của từng nguồn dữ liệu.
Tùy chọn: `LOG_LEVEL`, `LOG_FILE`, `LOG_TIMEZONE`, `QUERY_THROTTLE_LIMIT`/`QUERY_THROTTLE_TTL_MS`, `LOGIN_THROTTLE_LIMIT`/`LOGIN_THROTTLE_TTL_MS`.

## 5. Lưu ý khi nâng cấp từ v12/v15

1. **Cập nhật cả thư mục `config/`** (bản `deploy-check/config/*`): `config.json` đã chuyển sang map một lần và `config.schema.json` có khóa mới. Thư mục này được mount đè lên `/repo/config`, nên dùng schema cũ sẽ báo config không hợp lệ.
2. Config cũ còn `mapTo`/`from` vẫn chạy; chuyển bằng `node scripts/migrate-config-single-key.js <config.json> --write`.
3. Muốn log ra file: tạo thư mục `./logs` (đã mount trong `docker-compose.prod.yml`).
4. Máy đã pull `web-v16` trước khi vá cần `docker pull` lại nếu thấy digest khác (bản này đã build kèm bản vá hệ thống).
5. Chưa quét ClamAV/Trivy cho hai image này theo quy ước phát hành hiện tại (lab tự quét).

## 6. Kết quả kiểm thử tải (tóm tắt)

Đã kiểm thử bằng chính hai image này trên stack test (qua nginx, 60 người dùng thật, upstream nhanh/chậm/treo/chập chờn, spam). Dùng bình thường ổn định (99,3% thành công, trung vị khoảng 78 ms), điểm bão hòa khoảng 234 lượt/giây một tiến trình. Có một lỗi cấu hình giới hạn đăng nhập cần xử lý. Chi tiết: `docs/ket-qua-kiem-thu-tai-api-v13.md`.

## 7. Kiểm tra sau khi chạy

- `curl -s http://<host>/api/v1/health` trả `{"status":"ok"}`.
- Đăng nhập admin, mở **Quản trị → Nguồn dữ liệu**: mở form sửa, các ô URL/biến API key hiển thị đúng tên biến.
- Mở **Quản trị → Danh mục**: trang hiển thị bình thường.
- Tra cứu một lần: log backend có đủ dòng `-->`, `query start`, `upstream -->`, `upstream <--`, `query ok`, `<--` cùng một `requestId`.

Các bước kiểm tra tay đầy đủ: `docs/huong-dan-test-tay-2026-11-16.md`.

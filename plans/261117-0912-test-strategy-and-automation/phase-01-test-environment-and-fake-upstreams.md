# Phase 01: Môi trường kiểm thử và API giả lập

## Context Links
- [plan.md](plan.md)
- Có sẵn: `scripts/mock-upstream-server.js` (API công dân mẫu), `scripts/mock-echo-server.js`, `scripts/load-test/mock-blackhole-proxy.js`, `docker-compose.test.yml`
- API tham chiếu: image `vhung98vp/simple-api:1.0` (digest `sha256:8f1fe1d75a35ff79d7659d8440c3c57842a17185334bd3d5fbd791b259471366`, 49 MB)

## Overview
- Ưu tiên: cao. Trạng thái: chưa làm.
- Dựng một stack kiểm thử đóng gói duy nhất, lặp lại được, có đủ loại upstream để mô phỏng "API thật" ở mọi biến thể mà ứng dụng cần xử lý.

## Key Insights
- `simple-api` (đã chạy thử) cho 3 hành vi thật: `GET /search` trả **mảng ở gốc**, `POST /search?query` + body JSON trả `{data:[...]}`, `GET /images?count` kèm header `X-Access-Key` trả `{data:[{id(số), image_base64,...}]}`; sai khóa trả 401. Đã dùng để tìm ra lỗi ảnh (id số, ảnh base64) và response mảng gốc.
- `simple-api` không điều khiển được độ trễ, lỗi, định dạng ngày lẫn lộn, bearer/basic auth, phân trang, response lồng sâu, payload lớn. Cần lớp upstream điều khiển được.
- Lỗi mạng (kết nối bị bỏ âm thầm, đứt giữa chừng) phải gây ở tầng TCP, không thể giả bằng HTTP thuần: đã có `mock-blackhole-proxy`.

## Requirements
Các tầng upstream:
| Tầng | Công cụ | Vai trò |
|---|---|---|
| A. API tham chiếu | `vhung98vp/simple-api:1.0` (ghim theo digest) | Tra cứu GET/POST, ảnh base64, xác thực bằng header |
| B. API điều khiển hành vi | `mock-echo-v2` (độ trễ, jitter, lỗi theo tỉ lệ, lỗi N lần đầu, chế độ treo, ép mã trạng thái) | Retry, timeout, lỗi 5xx/429, đo thời gian |
| C. Lỗi mạng | `mock-blackhole-proxy` (nuốt dữ liệu sau khi nhàn rỗi) | Kết nối chết, treo đến hết timeout |
| D. Kịch bản dữ liệu | **`mock-scenario` mới** (mở rộng echo, định tuyến theo đường dẫn `/s/<tên>`) | Biến thể response còn thiếu (bên dưới) |
| E. API công dân mẫu | `mock-upstream-server.js` | 11 nguồn dữ liệu cấu hình sẵn |

Biến thể `mock-scenario` cần có:
- Phản hồi: mảng gốc, `data.items`, lồng sâu `data.0.data`, một object đơn, rỗng, rất lớn (>2 MB), không phải JSON, JSON hỏng, ngày giờ lẫn lộn (`DD/MM/YYYY HH:mm:ss`, `YYYY-MM-DD`, ISO có múi giờ, chuỗi lạ), id kiểu số/chuỗi/trùng, trường thiếu hoặc null.
- Xác thực: header khóa (đúng/sai/thiếu), Bearer, Basic, khóa hết hạn (đổi giữa chừng).
- Hành vi: 401/403/404/422/429 (kèm `Retry-After`)/500/502/503, treo, trả chậm từng phần, chậm 1 lần rồi nhanh, trả khác nhau theo lần gọi (để kiểm sắp xếp, phân trang).
- Ghi lại mọi request nhận được qua `GET /__log` (để test khẳng định ứng dụng đã gửi đúng query/body/header, và `X-Request-Id`).
- Ảnh: base64 có/không tiền tố `data:`, nhiều định dạng, ảnh lớn, URL ảnh.

## Architecture
```
docker-compose.e2e.yml  (project: app-tra-cuu-e2e, cổng riêng, không đụng dev/prod/test)
  postgres, migrate, seed, config-perms, api, web   (image phát hành hoặc build local)
  simple-api            (tầng A, cổng 8000 nội bộ)
  echo-fast / echo-slow / echo-flaky / echo-hang    (tầng B)
  scenario              (tầng D)
  blackhole-web         (tầng C: đứng trước web, mô phỏng đường trình duyệt -> nginx)
  blackhole-upstream    (tầng C: đứng trước simple-api, mô phỏng đường api -> upstream)
  playwright            (chạy test trình duyệt, dùng ở phase 04)
config e2e: thư mục config riêng khai báo ~15 nguồn dữ liệu trỏ vào các tầng trên
```
Mọi dịch vụ đặt tên và cổng cố định để test tham chiếu được, `healthcheck` rõ ràng, và một lệnh `pnpm e2e:up` / `pnpm e2e:down`.

## Related Code Files
Tạo mới:
- `docker-compose.e2e.yml`, `docker/mock-scenario.Dockerfile`, `scripts/mock-scenario-server.js` (+ test của chính nó)
- `e2e/config/config.json` (+ schema đi kèm), `e2e/seed/*.sql|ts` (người dùng, vai trò mẫu)
- `scripts/e2e-up.sh`, `scripts/e2e-down.sh`
Sửa: `scripts/mock-echo-server.js` (đưa các tham số v2 vào nhánh chính, push `mock-echo-v2` lên Hub nếu cần).

## Implementation Steps
1. Ghim `simple-api` theo digest trong compose; viết `healthcheck` bằng `GET /manage/health`.
2. Viết `mock-scenario-server.js` theo danh sách biến thể; có `GET /__log` và `POST /__reset`.
3. Viết `e2e/config/config.json`: mỗi nguồn dữ liệu một mục đích (ví dụ `E2E_SA_GET`, `E2E_SA_POST`, `E2E_SA_IMG`, `E2E_SA_IMG_BADKEY`, `E2E_FAST`, `E2E_SLOW`, `E2E_FLAKY`, `E2E_HANG`, `E2E_ROOT_ARRAY`, `E2E_NESTED`, `E2E_DATES_MIXED`, `E2E_BEARER`, `E2E_BASIC`, `E2E_BIG`, `E2E_NOT_JSON`).
4. Seed người dùng/vai trò: `admin`, `operator_a`, `operator_b`, `auditor`, `no_perm` (không có quyền nào), mật khẩu cố định.
5. Dựng `docker-compose.e2e.yml`; kiểm chứng `up -> health -> down -v` sạch trên máy mới.
6. Viết tài liệu `docs/e2e-environment.md` (cổng, tài khoản, cách đặt lại dữ liệu).

## Todo List
- [ ] Compose e2e và các lệnh `e2e:up/down/reset`
- [ ] `mock-scenario` với đủ biến thể và `__log`
- [ ] Cấu hình e2e (khoảng 15 nguồn dữ liệu) và seed người dùng
- [ ] Hai blackhole proxy gắn vào compose
- [ ] Tài liệu môi trường, kiểm tra trên máy sạch

## Success Criteria
- `pnpm e2e:up` đưa toàn bộ stack về trạng thái healthy dưới 3 phút trên máy sạch; `e2e:reset` đưa dữ liệu về ban đầu dưới 20 giây.
- Mỗi biến thể trong danh sách có ít nhất một nguồn dữ liệu cấu hình và một ca test dùng nó.
- Có thể tái hiện bằng một lệnh các lỗi đã gặp: treo do kết nối chết, 401 từ upstream, ảnh id số, mảng gốc.

## Risks
- Dùng image của bên ngoài (`simple-api`): phiên bản có thể đổi. Giảm thiểu: ghim digest, ghi hành vi mong đợi vào test hợp đồng (phase 02) để phát hiện khi đổi.
- Cổng bị hệ điều hành giữ (đã gặp trên Windows: dải 55412-56011). Giảm thiểu: dùng cổng thấp hơn 15000 và cho đặt qua biến môi trường.
- Chi phí bảo trì `mock-scenario`: giữ nhỏ, mỗi biến thể một hàm ngắn, có test riêng.

## Security Considerations
- Chỉ chứa dữ liệu giả; khóa thử (`my-secret-key`, `wrong-key`) không dùng ở nơi khác.
- Stack e2e chỉ nghe trên `127.0.0.1`, không publish ra mạng ngoài.

## Next Steps
Phase 02, 04 phụ thuộc phase này.

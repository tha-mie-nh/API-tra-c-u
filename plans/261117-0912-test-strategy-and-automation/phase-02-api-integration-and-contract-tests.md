# Phase 02: Test API, tích hợp và hợp đồng

## Context Links
- [plan.md](plan.md), [phase 01](phase-01-test-environment-and-fake-upstreams.md)
- Có sẵn: `apps/api/test/*.e2e-spec.ts` (16 file), `apps/api/test/fixtures/`, `jest-e2e.json`

## Overview
- Ưu tiên: cao. Trạng thái: chưa làm.
- Mục tiêu: lấp khoảng trống unit ở 5 module, đưa e2e API dùng upstream giả lập thật (qua HTTP), sửa 5 ca e2e hỏng, thêm test **hợp đồng** giữa ứng dụng và upstream.

## Key Insights
- Module chưa có unit test: `auth`, `rbac`, `roles`, `users`, `config` (chỉ được phủ gián tiếp bằng e2e).
- `query.e2e-spec.ts` hỏng 5/7 ca vì dùng nguồn `CITIZEN_BASIC` đã tắt trong config: cần chuyển sang cấu hình e2e riêng (phase 01) thay vì phụ thuộc `config/config.json` của dev.
- Các lỗi gần đây đều là lỗi **hợp đồng** (ứng dụng và upstream hiểu khác nhau về hình dạng dữ liệu) hoặc lỗi **cấu hình** (schema, mặc định). Test hợp đồng bắt được chúng sớm.

## Requirements
Chạy trên Postgres thật và upstream giả thật qua HTTP (không mock bằng thư viện).

### 2.1 Unit bổ sung (nhanh, không cần mạng)
| Module | Phủ |
|---|---|
| `auth` | băm/kiểm tra mật khẩu, khóa tài khoản sau N lần sai, tạo/thu hồi refresh token, đổi mật khẩu bắt buộc |
| `rbac` | gộp quyền từ nhiều vai trò, quyền `api:*` theo nguồn dữ liệu, ADMIN tự có quyền mới |
| `roles`, `users` | luật tạo/sửa/xóa, không xóa vai trò đang dùng, không tự hạ quyền admin cuối cùng |
| `config` | kiểm tra biến môi trường bắt buộc, giá trị sai |
| `datasources` | đã nhiều; thêm: giải tham chiếu danh mục, áp `defaults`, múi giờ, `in`/`format` của input, mảng gốc/đối tượng đơn |

### 2.2 E2E API với upstream giả (Jest + Postgres + stack e2e)
Mỗi nhóm dưới đây là một file `*.e2e-spec.ts`, dùng nguồn dữ liệu e2e của phase 01 và khẳng định cả phía upstream qua `GET /__log`:
1. **Tra cứu thành công**: GET (query), POST (query + body), query-only POST không có body, mảng gốc, lồng sâu, đối tượng đơn, bản ghi rỗng, nhiều bản ghi nhóm theo định danh, sắp xếp (ngày `DD/MM/YYYY`, ISO, lẫn lộn), phân trang, cắt `maxResults`.
2. **Định dạng**: `format` đọc nhiều dạng (`|`), `sourceTimeZone`, `displayTimeZone`, định dạng ngày của **input** (`DD/MM/YYYY`, `YYYYMMDD`), danh mục (`optionsRef`/`valueMapRef`), `labelField`.
3. **Xác thực upstream**: header khóa đúng/sai/thiếu, Bearer, Basic; sai khóa phải ra `UPSTREAM_UNAUTHORIZED` (HTTP 502) và ghi lịch sử đúng mã.
4. **Chịu lỗi**: retry khi đứt kết nối hoặc 503; không retry khi 4xx; timeout đúng thời hạn; treo; 429; tổng thời gian bị chặn bởi `timeoutMs`; đảm bảo `X-Request-Id` đi sang upstream.
5. **Ảnh**: ảnh base64 nội tuyến (id số và chuỗi, có/không tiền tố `data:`), proxy ảnh (minio-pg), 404 khi không có ảnh.
6. **Cấu hình**: tải lại nóng; ghi cấu hình qua API quản trị (kiểm tra bản ghi trên đĩa); schema trong image thắng schema cũ trong thư mục mount; từ chối khóa lạ, danh mục không tồn tại, múi giờ sai, `in: body` với GET; tạo/sửa/xóa danh mục, không xóa danh mục đang dùng.
7. **Quyền và giới hạn**: quyền theo nguồn dữ liệu, giới hạn 30 lượt/phút/người (người khác không bị ảnh hưởng), giới hạn đăng nhập theo IP, khóa tài khoản.
8. **Lịch sử và nhật ký**: mỗi lượt tra cứu ghi đúng bản ghi (thành công/lỗi, mã, thời gian, payload vào/ra), lọc, xuất CSV (chống chèn công thức), audit khi xem payload.
9. **Cấu trúc log**: mỗi request có dòng vào và ra cùng `requestId`; không có CCCD trong log.

### 2.3 Test hợp đồng với upstream tham chiếu
Một bộ nhỏ chạy trực tiếp vào `simple-api` (không qua ứng dụng) xác nhận hình dạng mà ứng dụng đang giả định: mảng gốc cho `GET /search`, `data` cho `POST /search`, `id` kiểu số và `image_base64`, 401 khi sai khóa. Nếu image đổi hành vi thì test này hỏng trước khi các test khác hỏng khó hiểu.

## Architecture
- `apps/api/test/e2e/` chia theo nhóm ở trên; helper dùng chung: đăng nhập theo vai trò, gọi `/__log` và `/__reset` của upstream giả, đọc cấu hình trên đĩa.
- Cấu hình jest e2e đọc địa chỉ từ biến môi trường do `e2e-up.sh` xuất ra.

## Related Code Files
Sửa: `apps/api/test/query.e2e-spec.ts` (đổi nguồn dữ liệu), `jest-e2e.json`, thêm `test/helpers/*`.
Tạo: các spec unit mới trong `apps/api/src/{auth,rbac,roles,users,config}/*.spec.ts`; `apps/api/test/e2e/*.e2e-spec.ts`; `apps/api/test/contract/simple-api.contract-spec.ts`.

## Implementation Steps
1. Viết helper e2e và chuyển `query.e2e-spec` sang cấu hình e2e (sửa 5 ca hỏng).
2. Thêm unit cho 5 module còn trống.
3. Viết nhóm e2e 1, 3, 4 trước (liên quan trực tiếp các lỗi đã gặp), rồi 2, 5, 6, 7, 8, 9.
4. Viết test hợp đồng cho `simple-api`.
5. Đo độ phủ (`jest --coverage`) và bổ sung ca cho nhánh chưa phủ ở `datasources`, `query`, `auth`.

## Todo List
- [ ] Sửa 5 ca `query.e2e` hỏng
- [ ] Unit cho auth, rbac, roles, users, config
- [ ] 9 nhóm e2e dùng upstream giả
- [ ] Test hợp đồng simple-api
- [ ] Báo cáo độ phủ (mục tiêu: dòng >= 80% ở datasources, query, auth, rbac)

## Success Criteria
- Toàn bộ e2e API pass trên stack e2e; không ca nào phụ thuộc `config/config.json` của dev.
- Mỗi lỗi trong bộ `REG-*` (phase 05) có ít nhất một ca API tự động.
- Độ phủ dòng >= 80% cho `datasources`, `query`, `auth`, `rbac`.

## Risks
- E2E chậm, dễ chập chờn nếu dùng chung dữ liệu: mỗi file dùng người dùng và dữ liệu riêng, dọn sau mỗi file, chạy tuần tự khi cần.
- Thời gian (timeout, throttle theo phút) làm test chậm: dùng biến môi trường để rút ngắn cửa sổ giới hạn trong stack e2e, và một vài ca "đúng thời gian thật" tách riêng.

## Security Considerations
- Test không in token/mật khẩu ra báo cáo; mật khẩu seed cố định chỉ dùng trong stack e2e.

## Next Steps
Phase 04 tái sử dụng helper và dữ liệu seed.

# Kế hoạch kiểm thử toàn diện (thủ công + tự động)

Ngày lập: 2026-11-17. Trạng thái: **đề xuất, chờ duyệt**. Mục tiêu: có bộ kịch bản kiểm thử chi tiết cho mọi chức năng, chạy được bằng tay theo từng bước và chạy tự động (máy, CI), kèm API giả lập API thật.

## Vì sao cần
Nhiều lỗi gần đây (config schema cũ, định dạng ngày, ảnh, treo kết nối, form mất giá trị, giới hạn đăng nhập) chỉ lộ ra khi người dùng thật thao tác trên môi trường thật. Nguyên nhân chung: thiếu test chạy **qua trình duyệt + backend + upstream thật** trên stack đóng gói như production.

## Hiện trạng (đã khảo sát)
| Lớp | Có sẵn | Thiếu |
|---|---|---|
| Unit API (Jest) | 251 test (datasources 11 file, history 6, admin-datasources 4...) | `auth`, `rbac`, `roles`, `users`, `config` chưa có unit test |
| E2E API (Jest + Postgres) | 16 file, khoảng 130 ca (auth, rbac, query, history, stats, insights, image-proxy, admin-datasources) | Không chạy trong CI; 5/7 ca `query.e2e` hỏng từ trước (dùng nguồn đã tắt); chưa có upstream giả có hành vi đa dạng |
| Web (Vitest) | 194 test (admin 16 file, history 7, query 8, auth 2) | `datasources` 0 test; không có test trình duyệt thật |
| Tải / hỗn loạn | `scripts/load-test/` (9 kịch bản), `mock-echo-server`, `mock-blackhole-proxy` | Chưa tự động hóa, chưa gắn vào quy trình |
| Thủ công | `docs/huong-dan-test-tay-2026-11-16.md` (theo lỗi đã sửa) | Chưa theo chức năng, chưa có ID, chưa có kết quả mong đợi đầy đủ |
| CI | `ci.yml`: lint, typecheck, build, audit, `pnpm test` (chỉ unit) | Không có e2e API, không có test trình duyệt, không có test image |

## Nguyên tắc
- Kim tự tháp: nhiều unit nhanh, ít e2e chậm nhưng bao phủ hành trình quan trọng.
- Mỗi lỗi đã gặp thành một ca hồi quy có ID cố định (bộ `REG-*`).
- Upstream giả lập đa tầng (xem phase 01): `simple-api` của vhung98vp làm "API thật tham chiếu", `mock-echo` điều khiển hành vi, `blackhole-proxy` gây lỗi mạng, `mock-scenario` mới cho các biến thể còn thiếu.
- Test chạy trên **image đóng gói** (`docker-compose.e2e.yml`), không chỉ trên mã nguồn.
- Dữ liệu thử không chứa CCCD thật.

## Các giai đoạn
| # | Giai đoạn | Kết quả | Ưu tiên | Ước lượng |
|---|---|---|---|---|
| 1 | [Môi trường và API giả lập](phase-01-test-environment-and-fake-upstreams.md) | `docker-compose.e2e.yml`, `simple-api` + `mock-scenario` + tiện ích lỗi mạng, dữ liệu mẫu | Cao | 2 ngày |
| 2 | [Test API: tích hợp và hợp đồng](phase-02-api-integration-and-contract-tests.md) | Bổ sung unit cho 5 module, e2e dùng upstream giả, sửa 5 ca hỏng | Cao | 4 ngày |
| 3 | [Test giao diện: thành phần](phase-03-frontend-component-tests.md) | Lấp khoảng trống Vitest | Trung bình | 2 ngày |
| 4 | [Test trình duyệt (Playwright)](phase-04-browser-e2e-playwright.md) | 25-30 hành trình qua trình duyệt thật, chạy trên stack đóng gói | Cao | 5 ngày |
| 5 | [Danh mục ca kiểm thử + test tay](phase-05-manual-test-cases.md) | Khoảng 150 ca có ID, bước làm, kết quả mong đợi, ánh xạ sang tự động | Cao | 3 ngày |
| 6 | [Phi chức năng: tải, hỗn loạn, bảo mật, nâng cấp](phase-06-non-functional-chaos-load-security.md) | Bộ chạy lặp lại được, ngưỡng chấp nhận | Trung bình | 3 ngày |
| 7 | [CI, báo cáo, bảo trì](phase-07-ci-reporting-and-maintenance.md) | Pipeline 3 tầng, báo cáo HTML, quy ước thêm ca | Trung bình | 2 ngày |

Tổng ước lượng: khoảng 21 ngày công cho một người; giai đoạn 1 và 5 làm trước, 2/3/4 chạy song song sau đó.

## Thứ tự làm đề xuất
1. Giai đoạn 1 (không có API giả lập thì các phần sau không kiểm được hành vi lỗi).
2. Bộ hồi quy `REG-*` (đã có sẵn dữ liệu lỗi) ở cả test tay (phase 05) và Playwright (phase 04).
3. Phủ rộng theo chức năng: auth, quản trị nguồn dữ liệu, tra cứu, lịch sử.
4. Phi chức năng và CI.

## Tiêu chí hoàn thành chung
- Mọi chức năng trong bảng bao phủ ở phase 05 có ít nhất một ca tự động hoặc có lý do ghi rõ vì sao chỉ làm tay.
- Bộ `REG-*` 100% pass trên image sắp phát hành.
- CI chạy được: tầng 1 (unit, mỗi PR), tầng 2 (e2e API + Playwright smoke, mỗi PR vào main), tầng 3 (đầy đủ + hỗn loạn + tải, hằng đêm hoặc trước phát hành).
- Có báo cáo kết quả dạng file (HTML/Markdown) để đính kèm khi bàn giao.

## Câu hỏi còn mở
1. CI hiện chạy ở đâu (GitHub Actions có Docker không)? Quyết định tầng 2/3 chạy ở đâu.
2. Có cho thêm Playwright (khoảng 150 MB trình duyệt) vào devDependencies của repo không?
3. Ai thực hiện test tay và ghi nhận kết quả (người, tần suất, mẫu biên bản)?
4. Có cần kiểm thử với API đối tác thật (cần địa chỉ và khóa) hay chỉ giả lập?
5. Ngưỡng hiệu năng chấp nhận (ví dụ p95 tra cứu, số người dùng đồng thời) do ai chốt?

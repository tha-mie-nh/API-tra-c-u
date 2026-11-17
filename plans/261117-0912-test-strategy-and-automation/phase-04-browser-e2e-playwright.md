# Phase 04: Test trình duyệt thật (Playwright)

## Context Links
- [plan.md](plan.md), [phase 01](phase-01-test-environment-and-fake-upstreams.md), [phase 05](phase-05-manual-test-cases.md) (ID ca)
- Đã thử nghiệm: các kịch bản Playwright tạm thời trong phiên làm việc (tái hiện lỗi mất URL/API key, treo do kết nối chết, ảnh, định dạng ngày tùy chỉnh) cho thấy cách này tìm ra lỗi mà test đơn vị không thấy.

## Overview
- Ưu tiên: cao. Trạng thái: chưa làm.
- Mục tiêu: 25-30 hành trình chạy qua **trình duyệt thật + nginx + backend + upstream giả**, trên stack đóng gói của phase 01. Là lớp duy nhất bắt được lỗi do thư viện giao diện, mạng và cấu hình ghép lại với nhau.

## Key Insights
- Phần lớn lỗi người dùng báo (mất URL khi xóa cache, chọn URL tự viết, treo khi kết nối chết, ảnh không hiện, ảnh to 80%, lưu không báo lỗi) đều **chỉ tái hiện được trên trình duyệt thật**.
- Cần điều khiển điều kiện mạng: xóa cache (ngữ cảnh mới), làm chậm API (giả lập tải chậm danh sách biến môi trường), cắt kết nối (`blackhole`), hết hạn token.

## Requirements
Công cụ: Playwright (Chromium là chính; Firefox và WebKit cho bộ smoke). Chạy trong container `playwright` thuộc compose e2e, hoặc trên máy bằng `pnpm e2e:ui`.

Quy ước:
- Mỗi test độc lập: đăng nhập bằng API rồi nạp phiên, dữ liệu riêng, dọn sau.
- Bộ chọn phần tử theo vai trò/nhãn tiếng Việt, không theo class (chống vỡ khi đổi giao diện).
- Mỗi test gắn thẻ `@reg` (hồi quy), `@smoke`, `@slow`; khi lỗi lưu ảnh chụp, video, log console và log backend theo `requestId`.
- Test **không được** sleep cố định; chờ theo điều kiện (phản hồi mạng, phần tử hiện).

### Danh sách hành trình (xem ID chi tiết ở phase 05)
**Xác thực và phiên**
- E-AUTH-01 đăng nhập đúng/sai, bị khóa; E-AUTH-02 bắt buộc đổi mật khẩu lần đầu; E-AUTH-03 tải lại giữ phiên, không có 401 thừa; E-AUTH-04 token hết hạn giữa chừng, tự làm mới, không phải bấm lại; E-AUTH-05 đăng xuất.

**Quản trị nguồn dữ liệu (nhóm lỗi nhiều nhất)**
- E-DS-01 tạo mới đủ loại (GET, POST query, POST body, ảnh); E-DS-02 sửa rồi lưu **không đổi gì** thì cấu hình giữ nguyên byte-for-byte (`REG`); E-DS-03 **xóa cache** rồi mở form: URL và tên biến API key đúng, không có `${}` (`REG`, làm chậm danh sách biến môi trường); E-DS-04 chọn URL env rồi "Tự viết URL khác" gõ được (`REG`); E-DS-05 định dạng ngày **input** chọn mẫu và tùy chỉnh, lưu, tra cứu thấy đúng (`REG`); E-DS-06 định dạng hiển thị, múi giờ nguồn/hiển thị (`REG`); E-DS-07 trường làm tiêu đề (`REG`); E-DS-08 "gửi bằng body/query" từng trường; E-DS-09 lưu bị từ chối thì có thông báo nổi nêu lỗi (`REG`, dùng schema cũ trong thư mục mount để gây lỗi); E-DS-10 bật/tắt, xóa, tải lại cấu hình.
- E-DICT-01 tạo danh mục, dùng cho trường enum đầu vào và valueMap đầu ra, sửa danh mục thì form tra cứu đổi theo (không restart); E-DICT-02 xóa danh mục đang dùng bị chặn; E-DICT-03 trùng khóa, tên sai.

**Tra cứu (người dùng cuối)**
- E-Q-01 GET search (mảng gốc); E-Q-02 POST search (query + body); E-Q-03 lọc bằng danh mục (giới tính); E-Q-04 ngày giờ: sắp xếp, mẫu hiển thị, múi giờ (`REG`); E-Q-05 giá trị ngày lạ hiện nguyên văn; E-Q-06 lỗi 401 từ upstream hiển thị rõ "API key sai" và lịch sử ghi đúng (`REG`); E-Q-07 timeout/504; E-Q-08 upstream chập chờn: lần bấm đầu có kết quả nhờ thử lại (`REG`); E-Q-09 spam: bị giới hạn, người khác không ảnh hưởng.
- E-IMG-01 ảnh base64 hiện thumbnail, không báo "không có ảnh nào khớp" với id số (`REG`); E-IMG-02 bấm ảnh phóng tới 80% chiều cao màn hình ở nhiều cỡ cửa sổ (`REG`); E-IMG-03 điều hướng ảnh bằng bàn phím, đóng; E-IMG-04 ảnh lỗi/không có.

**Độ bền mạng (dùng blackhole)**
- E-NET-01 để trang nhàn rỗi 12 giây trên đường bị bỏ âm thầm, bấm một lần: có kết quả trong dưới 5 giây, console có cảnh báo kết nối chết (`REG`); E-NET-02 backend tạm tắt rồi bật, thông báo rõ, không treo; E-NET-03 trên bản `web` cũ cùng kịch bản phải **treo** (kiểm chứng test thật sự bắt lỗi).

**Lịch sử, thống kê, phân tích, quản trị khác**
- E-H-01 lịch sử của chính mình, bộ lọc trên URL, chi tiết, xem payload (admin) có ghi audit; E-H-02 xuất CSV; E-STAT-01 bảng thống kê, bấm vào thẻ mở lịch sử đã lọc; E-INS-01 trang phân tích; E-USER-01 tạo/khóa/đặt lại mật khẩu người dùng; E-ROLE-01 gán quyền, hiệu lực tức thì; E-AUD-01 nhật ký quản trị.

**Giao diện chung**
- E-UI-01 sidebar theo quyền; E-UI-02 phản hồi theo kích thước (1280, 1024, 768); E-UI-03 màu/chế độ tối nếu bật; E-UI-04 ảnh chụp so sánh các trang chính (so khớp thị giác có dung sai).

## Architecture
```
e2e/
  playwright.config.ts   (projects: chromium; firefox+webkit chỉ @smoke)
  fixtures/              (đăng nhập bằng API, tạo/xóa nguồn dữ liệu, đọc /__log của upstream giả)
  tests/{auth,datasource-admin,dictionary,query,image,network,history,admin-misc,ui}/*.spec.ts
  reports/               (HTML, trace, video khi lỗi)
```
Cách kiểm chứng `E-NET-*`: trình duyệt đi qua `blackhole-web` (phase 01). Cách kiểm chứng `E-DS-09`: một biến thể stack gắn `config.schema.json` cũ vào thư mục mount; do image mới dùng schema trong image nên test khẳng định lưu **thành công**, và test thứ hai dùng biến `CONFIG_SCHEMA_PATH` trỏ tới schema cũ để khẳng định thông báo lỗi nổi hiện ra.

## Related Code Files
Tạo: `e2e/**`, `docker-compose.e2e.yml` (dịch vụ `playwright`), script `pnpm e2e:ui`, `pnpm e2e:ui:reg`. Phụ thuộc: `@playwright/test` (devDependency của gói `e2e`).

## Implementation Steps
1. Dựng khung `e2e/` và fixture đăng nhập/dọn dẹp; chạy 1 ca mẫu qua CI cục bộ.
2. Viết bộ `@reg` trước (khoảng 15 ca, lấy từ lỗi đã gặp), kiểm chứng mỗi ca **hỏng** trên image cũ (`api-v12`/`web-v15`) và **qua** trên image mới.
3. Viết bộ phủ rộng theo nhóm trên.
4. Thiết lập báo cáo (HTML + trace), chạy 3 lần liên tiếp để phát hiện test chập chờn.

## Todo List
- [ ] Khung Playwright + fixtures
- [ ] 15 ca `@reg`, mỗi ca đã kiểm chứng hỏng/qua trên hai phiên bản image
- [ ] Bộ phủ rộng (auth, admin, danh mục, tra cứu, ảnh, mạng, lịch sử, UI)
- [ ] Bộ `@smoke` chạy đủ 3 trình duyệt
- [ ] Báo cáo và quy ước chống chập chờn

## Success Criteria
- Bộ `@reg` pass 100% trên image sắp phát hành và **hỏng đúng chỗ** trên image cũ tương ứng.
- Bộ `@smoke` dưới 5 phút; bộ đầy đủ dưới 25 phút.
- 3 lần chạy liên tiếp cho cùng kết quả (không chập chờn).

## Risks
- Chập chờn do thời gian: dùng chờ theo điều kiện, tắt hiệu ứng động khi test, ghim kích thước cửa sổ.
- Chi phí bảo trì khi giao diện đổi: bộ chọn theo vai trò/nhãn, gom thao tác vào page object cho các màn hình hay đổi (form nguồn dữ liệu).
- Trình duyệt không tái hiện đúng lỗi của hệ điều hành/mạng người dùng (Docker Desktop, VPN): ghi rõ trong báo cáo, và giữ kịch bản `blackhole` để mô phỏng.

## Security Considerations
- Trace và video có thể chứa dữ liệu nhạy cảm: stack e2e chỉ chứa dữ liệu giả; thư mục `reports/` không commit.

## Next Steps
Phase 07 gắn vào CI.

# Phase 03: Test giao diện, thành phần (Vitest)

## Context Links
- [plan.md](plan.md); có sẵn 194 test web (admin 16 file, history 7, query 8, auth 2).

## Overview
- Ưu tiên: trung bình. Trạng thái: chưa làm. Mục tiêu: lấp các khoảng trống mà lỗi gần đây cho thấy, bằng test nhanh không cần trình duyệt thật.

## Key Insights
- Lỗi form ở admin đều từ **chuyển đổi giữa dữ liệu lưu và giá trị form** (mất khóa khi lưu, định dạng ngày, chế độ "tự viết URL") và từ **hành vi bất thường của thư viện ô chọn** (bắn giá trị rỗng).
- `features/datasources` (menu và dữ liệu nguồn) chưa có test.
- Một số lỗi chỉ thấy trên trình duyệt thật (kết nối chết, kích thước ảnh): để phase 04, không cố giả trong jsdom.

## Requirements
Bổ sung test cho:
1. **Bộ chuyển đổi form <-> cấu hình** (`datasource-entry-converters`, `datasource-field-row-converters`): vòng đi-về giữ nguyên mọi khóa (kể cả khóa form không biết), xóa đúng khóa khi để trống, `format`/`in`/`optionsRef`/`valueMapRef`/múi giờ.
2. **Ô chọn có danh sách thay đổi** (URL env, biến API key, mẫu định dạng): bỏ qua giá trị rỗng, chế độ "tự viết" ưu tiên, giữ giá trị khi chuyển chế độ.
3. **Mẫu định dạng ngày** (`DateFormatSelect`): chọn mẫu, tùy chỉnh, ví dụ xem trước theo múi giờ, giá trị lạ lưu nguyên.
4. **Định dạng hiển thị** (`format.ts`): chỉ nhận ISO, múi giờ, mẫu tùy chỉnh, giá trị lạ hiện nguyên văn.
5. **Kết quả tra cứu**: bảng thông tin (ngày, enum, ảnh), màn ảnh (`recordId` số/chuỗi, ảnh base64 nội tuyến, rỗng), thông báo lỗi theo mã (kể cả `UPSTREAM_UNAUTHORIZED`).
6. **Biểu mẫu tra cứu động**: ô theo từng kiểu (chuỗi, số, ngày, ngày giờ, enum từ danh mục), kiểm tra hợp lệ phía client khớp với phía server.
7. **api-client**: thăm dò kết nối sau nhàn rỗi, làm mới token một lần, `X-Request-Id`, log cảnh báo, không log khi thành công.
8. **Danh mục (trang Danh mục)**: tạo, sửa, trùng khóa, xóa danh mục đang dùng bị chặn, tên không hợp lệ.
9. **Phân quyền giao diện**: sidebar và route theo quyền, `datasources` hook.
10. **Lịch sử và thống kê**: bộ lọc trên URL, trạng thái rỗng/lỗi/tải.

## Architecture
Vitest + Testing Library hiện có; MSW là tùy chọn nhưng dự án đang mock `fetch` trực tiếp (giữ cách đó cho nhất quán, KISS). Dùng `vi.useFakeTimers` cho thời gian.

## Related Code Files
Tạo/sửa trong `apps/web/src/**/*.test.ts(x)` cạnh mã tương ứng (quy ước hiện có).

## Implementation Steps
1. Liệt kê các hàm thuần và thành phần chưa có test bằng báo cáo độ phủ (`vitest --coverage`).
2. Viết test theo thứ tự 1, 2, 4, 5, 7 (liên quan lỗi đã gặp), rồi các mục còn lại.
3. Thêm ngưỡng độ phủ vào CI (không giảm so với hiện tại).

## Todo List
- [ ] Đo độ phủ hiện tại, ghi làm mốc
- [ ] 10 nhóm test ở trên
- [ ] Ngưỡng độ phủ trong CI

## Success Criteria
- Mỗi lỗi giao diện trong bộ `REG-*` có test Vitest hoặc được ghi rõ là chỉ kiểm bằng trình duyệt (phase 04).
- Độ phủ dòng `apps/web/src/features` >= 75% và không giảm theo thời gian.

## Risks
- Test jsdom dễ "xanh giả" với ô chọn Radix (hành vi khác trình duyệt thật). Giảm thiểu: các ca liên quan ô chọn có thêm ca Playwright tương ứng ở phase 04.

## Security Considerations
- Kiểm tra không có chỗ hiển thị khóa/mật khẩu hay giá trị bí mật trong DOM (ô biến môi trường chỉ hiện tên).

## Next Steps
Phase 04 bổ sung phần chỉ trình duyệt thật mới kiểm được.

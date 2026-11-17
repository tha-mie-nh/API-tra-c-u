# Phase 06: Phi chức năng: tải, hỗn loạn, bảo mật, nâng cấp

## Context Links
- [plan.md](plan.md), [phase 01](phase-01-test-environment-and-fake-upstreams.md)
- Có sẵn: `scripts/load-test/run-load-test.js`, `docs/ket-qua-kiem-thu-tai-api-v13.md`, `docs/load-test-results/`

## Overview
- Ưu tiên: trung bình. Trạng thái: một phần (tải đã chạy tay một lần, chưa tự động, chưa có ngưỡng chấp nhận).
- Mục tiêu: biến các thử nghiệm đã làm bằng tay thành bộ chạy lặp lại được, có ngưỡng đạt/không đạt, và bổ sung bảo mật, hỗn loạn, nâng cấp.

## Key Insights
- Lần đo tải đầu có kết quả sai vì dùng chung người dùng giữa các kịch bản và bộ đếm giới hạn dồn: bộ tự động phải dùng người dùng riêng cho mỗi kịch bản (script đã hỗ trợ `--load-session`).
- Phát hiện đã có từ tải: đăng nhập đồng loạt bị chặn chung IP; nhật ký tăng không giới hạn; log lỗi upstream quá ồn.
- Lỗi "kết nối chết" chỉ có ở tầng mạng: cần bộ hỗn loạn gây lỗi thật.

## Requirements
### 6.1 Tải và hiệu năng (ngưỡng đề xuất, chờ chốt)
| Kịch bản | Tải | Ngưỡng đạt |
|---|---|---|
| Nền | 1 người, 50 lượt | p95 dưới 150 ms (upstream nhanh) |
| Một ngày làm việc | 60 người, nghỉ 2-6 giây, 90 giây | thành công >= 99%, 0 lượt 429, `/health` p95 dưới 50 ms |
| Upstream chậm | 20 người liên tục | 100% thành công, không tắc nghẽn các nguồn khác |
| Upstream treo | timeout 3 giây | 504 trong 3,0-3,2 giây |
| Chập chờn 30% | 20 người x 20 lượt | thành công >= 96% |
| Spam một người | 200 lượt | đúng 30 lượt thành công, người khác 100% thành công |
| Dồn cùng lúc | 60 người | 100% thành công, tối đa dưới 1 giây |
| Chạy dài | 60 người, 15-30 phút | không rò rỉ bộ nhớ (tăng dưới 10%), không lỗi |
| Bão hòa | 180 luồng | ghi nhận mức tối đa, không lỗi 5xx |
| Đăng nhập đồng loạt | 60 người | >= 95% thành công (sau khi sửa giới hạn), p95 dưới 8 giây |
Thêm: kịch bản **trang lịch sử/thống kê với 1-5 triệu dòng** (chưa từng đo), và dung lượng `query_logs` theo số lượt.

### 6.2 Hỗn loạn (mạng, tiến trình)
- Kết nối chết (blackhole) ở hai đường (trình duyệt -> nginx, api -> upstream), kết nối đứt ở giữa phản hồi, upstream trả chậm từng phần, DNS lỗi tạm (xóa/đổi IP container `api` rồi kiểm tra nginx tự phục hồi sau 30 giây), tắt/bật `api`, `postgres`, `web` khi đang có người dùng, đầy đĩa log.
- Kỳ vọng: không treo vô hạn, thông báo rõ, tự phục hồi không cần F5/restart thủ công.

### 6.3 Bảo mật
- Xác thực và phiên: dò mật khẩu (khóa tài khoản), giả mạo/token hết hạn/sai chữ ký, refresh token tái sử dụng, cookie `HttpOnly`/`SameSite`.
- Phân quyền: truy cập chéo (người dùng A xem lịch sử B, gọi API quản trị khi không có quyền, IDOR trên `/history/:id` và `/history/:id/payload`).
- Đầu vào: injection vào bộ lọc lịch sử, XSS qua dữ liệu upstream và qua tên/mô tả cấu hình, CSV injection (xuất), path traversal ở `dataFile` của nguồn mock, SSRF qua `baseUrl` do admin nhập (ghi nhận rủi ro, kiểm tra chính sách tên biến), tải trọng lớn.
- Cấu hình: header bảo mật của nginx (CSP, X-Frame-Options...), CORS chỉ cho origin cấu hình, không lộ khóa/biến môi trường ở API quản trị (`env-refs` chỉ trả tên), log không có bí mật.
- Chuỗi cung ứng: `pnpm audit`, quét image (Trivy, ClamAV), image chạy bằng user không phải root.

### 6.4 Nâng cấp và tương thích
- Nâng cấp từ `api-v12/web-v15` sang bản mới với DB có dữ liệu: migration, dữ liệu cũ còn nguyên, cấu hình cũ chạy, thư mục config có schema cũ không làm hỏng.
- Quay lui (rollback) về image cũ: ứng dụng cũ vẫn chạy trên DB đã migrate.
- Sao lưu và khôi phục DB (`backup-postgres.sh`, `restore-postgres.sh`).

## Architecture
`scripts/nft/` gồm: `run-load.sh` (bọc `run-load-test.js` với ngưỡng và mã thoát), `chaos/*.sh` (docker pause/stop/restart, blackhole), `security/*.sh` (dò cơ bản bằng curl + kiểm tra header). Kết quả JSON vào `reports/nft/<ngày>/`, đối chiếu ngưỡng tự động.

## Related Code Files
Tạo: `scripts/nft/**`; mở rộng `scripts/load-test/run-load-test.js` (đọc ngưỡng, trả mã thoát khác 0 khi vượt); `docs/nft-thresholds.md`.

## Implementation Steps
1. Chốt ngưỡng với người ra quyết định (xem câu hỏi mở ở plan.md).
2. Bọc bộ tải hiện có bằng ngưỡng; chạy 3 lần để xác định độ dao động.
3. Viết bộ hỗn loạn (6 tình huống) và kiểm chứng kỳ vọng.
4. Viết kiểm tra bảo mật tự động cho nhóm phân quyền/đầu vào/header; phần còn lại làm tay.
5. Kịch bản nâng cấp/quay lui bằng hai phiên bản image và DB mẫu.

## Todo List
- [ ] Chốt ngưỡng hiệu năng
- [ ] Bộ tải có ngưỡng và mã thoát
- [ ] Đo với lịch sử 1-5 triệu dòng
- [ ] 6 tình huống hỗn loạn
- [ ] Kiểm tra bảo mật tự động + danh sách kiểm tra tay
- [ ] Kịch bản nâng cấp, quay lui, sao lưu/khôi phục

## Success Criteria
- Toàn bộ kịch bản 6.1 đạt ngưỡng trên máy chuẩn; báo cáo lưu theo ngày.
- Mọi tình huống 6.2 phục hồi mà không cần can thiệp thủ công hoặc có thông báo lỗi rõ.
- Không còn phát hiện bảo mật mức cao chưa xử lý ở 6.3.
- Nâng cấp và quay lui chạy được trên bản sao dữ liệu thật đã ẩn danh.

## Risks
- Kết quả tải phụ thuộc máy (đã thấy: máy phát tải dùng chung CPU): ghi cấu hình máy trong báo cáo, so sánh theo xu hướng và tỉ lệ chứ không theo số tuyệt đối.
- Hỗn loạn có thể làm hỏng môi trường dùng chung: chỉ chạy trong stack e2e riêng.

## Security Considerations
- Công cụ dò chỉ chạy trên stack e2e/staging của chính mình, không chạy vào hệ thống ngoài.

## Next Steps
Phase 07 đặt các bộ này vào tầng 3 của pipeline.

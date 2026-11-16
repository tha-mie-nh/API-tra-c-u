# Kết quả kiểm thử tải: api-v13 / web-v16 (2026-11-16)

Mục tiêu: xem hệ thống cư xử thế nào khi có nhiều người dùng thật dùng cùng lúc, khi upstream nhanh, chậm, treo, chập chờn, và khi có người gửi dồn dập (spam). Số liệu thô nằm ở `docs/load-test-results/`.

## 1. Kết luận ngắn

- **Dùng bình thường: tốt.** 60 người dùng (mỗi người cách 2-6 giây một lượt) trong 90 giây: 99,3% thành công, không lượt nào bị giới hạn, `/health` luôn dưới 41 ms. Thời gian trả lời của tra cứu nhanh: trung vị khoảng 78 ms.
- **Upstream chậm không làm nghẽn hệ thống:** người dùng chờ đúng bằng thời gian upstream, API vẫn trả `/health` dưới 10 ms.
- **Upstream treo:** trả lỗi 504 sau đúng 3,0 giây (đúng cấu hình), không bị nhân lên theo số lần thử lại.
- **Upstream chập chờn (30% lỗi):** tự thử lại, chỉ còn 2,5% lỗi đến người dùng.
- **Spam:** người gửi 200 lượt liên tục chỉ được 30 lượt (giới hạn 30 lượt/phút/người), 170 lượt bị chặn (429) trong vài chục mili giây; 10 người dùng khác làm việc cùng lúc **không bị ảnh hưởng** (133/133 thành công).
- **Điểm bão hòa:** khoảng 234 lượt/giây trên một tiến trình API (gấp hàng chục lần nhu cầu 50 người dùng), 0 lỗi, bộ nhớ ổn định.
- **Có 1 lỗi cấu hình cần sửa trước khi dùng thật: đăng nhập đồng loạt bị chặn** (mục 4, phát hiện 1). Với giới hạn mặc định, 60 người đăng nhập cùng lúc chỉ 8 người vào được.

## 2. Môi trường

| Mục | Giá trị |
|---|---|
| Máy | WSL2, AMD Ryzen 7 5800H (4 nhân cấp cho WSL), RAM 9,7 GB, Docker 28.5.1 |
| Stack | `docker-compose.test.yml` với image `api-v13`, `web-v16`, postgres 16; truy cập qua nginx `:8081` (như người dùng thật) |
| Upstream | 4 container `mock-echo-v2` trong cùng mạng: `LT_FAST` (20-80 ms), `LT_SLOW` (1,5-3 s), `LT_FLAKY` (30% đứt kết nối), `LT_TIMEOUT` (không trả lời, timeout cấu hình 3 s) |
| Cấu hình | `retry` 2 lần, `timeoutMs` 10 s (mặc định), giới hạn tra cứu 30 lượt/phút/người, đăng nhập 10 lượt/phút/IP (mặc định của ứng dụng) |
| Người dùng | 72 tài khoản thật tạo qua API quản trị, đăng nhập thật, gọi `POST /api/v1/query/:code` thật |
| Công cụ | `scripts/load-test/run-load-test.js` (Node thuần) |

Lưu ý: máy phát tải và toàn bộ hệ thống chạy chung một máy 4 nhân, nên các con số năng lực là **mức tối thiểu**; máy chủ riêng sẽ cao hơn.

## 3. Kết quả từng kịch bản

Thời gian tính bằng mili giây (ms). "Lỗi" gồm 429 (bị giới hạn), 502/504 (upstream).

### Giới hạn mặc định (giống production)

| Kịch bản | Tải | Kết quả |
|---|---|---|
| **B. Một ngày làm việc** | 60 người, nghỉ 2-6 s giữa các lượt, 70% nhanh / 20% chậm / 10% chập chờn, 90 s: 1204 lượt, 12,5 lượt/s | 99,3% thành công; 9 lỗi 502 đều của upstream chập chờn; 0 lượt bị 429. Trung vị 78, p95 2652, p99 2930 (p95 phản ánh 20% lượt đến upstream chậm 1,5-3 s). `/health` p95 6, tối đa 41 |
| **F. Một người spam** | 1 người gửi 200 lượt (20 luồng) trong khi 10 người khác làm việc bình thường, 30 s | Người spam: 30 thành công, 170 bị 429. 10 người kia: 133/133 thành công, p95 126. Lượt bị chặn trả lời trong vài chục ms |
| **Đăng nhập đồng loạt** | 60 người đăng nhập cùng lúc | **Chỉ 8/60 thành công**, 52 bị 429 (xem phát hiện 1) |

### Bỏ giới hạn theo người dùng (đo năng lực thực của hệ thống)

| Kịch bản | Tải | Kết quả |
|---|---|---|
| **Đăng nhập đồng loạt** | 60 người cùng lúc | 60/60 thành công trong 5,2 s; trung vị 2963, p95 5133 (băm mật khẩu tốn CPU, khoảng 11,5 đăng nhập/giây) |
| **A. Nền** | 1 người, 50 lượt liên tiếp, upstream nhanh | 100% thành công; trung vị 61, p95 91, p99 133 |
| **C. Upstream chậm** | 20 người gửi liên tục, upstream 1,5-3 s, 40 s: 360 lượt | 100% thành công; trung vị 2240, p95 2947, tối đa 3013; 8,4 lượt/s (đúng bằng 20 người / thời gian chờ); `/health` p95 6 |
| **D. Upstream treo** | 10 người x 3 lượt, timeout 3 s | 30/30 trả 504 sau 3015 ms (tối đa 3032); không nhân với số lần thử lại; `/health` p95 7 |
| **E. Upstream chập chờn** | 20 người x 20 lượt, 30% lượt gọi upstream bị đứt | 97,5% thành công, 10/400 lỗi 502 (2,5%, khớp lý thuyết 0,3^3 = 2,7% khi thử lại 2 lần); p95 1011 (do chờ thử lại 300-600 ms) |
| **G. Dồn cùng một khoảnh khắc** | 60 người gửi 1 lượt đúng cùng lúc | 60/60 thành công; trung vị 353, p95 427, tối đa 462 |
| **H. Chạy dài** | 60 người, nghỉ 1,5-4 s, 120 s: 2304 lượt, 18,4 lượt/s, 85% nhanh / 15% chậm | 100% thành công; trung vị 69, p95 2533 (do 15% upstream chậm); `/health` p95 4; bộ nhớ API 118,7 → 120,1 MB (không rò rỉ), postgres 47 → 54 MB |
| **I. Bão hòa** | 180 luồng đồng thời (3 luồng mỗi người), không nghỉ, 30 s | **234 lượt/giây**, 7198 lượt, 100% thành công; trung vị 735, p95 959, tối đa 1079; `/health` trung vị 655 (một tiến trình Node đã chạy hết công suất); bộ nhớ API 253 MB |

Cơ sở dữ liệu sau kịch bản năng lực: 6785 dòng lịch sử tra cứu và 6785 dòng payload (13 MB + 3,5 MB), khoảng 2,4 KB mỗi lượt với phản hồi nhỏ của mock.

## 4. Phát hiện và đề xuất

| # | Mức | Phát hiện | Đề xuất |
|---|---|---|---|
| 1 | **Cao** | **Đăng nhập bị chặn chung.** (a) Mọi người dùng đi qua nginx nên backend thấy cùng một IP (`172.23.0.3`, container nginx) vì `TRUST_PROXY` chưa đặt trong stack test. (b) Route `POST /auth/login` chỉ gắn `ThrottlerGuard` mà không loại các bộ giới hạn khác, nên ngoài giới hạn đăng nhập 10 lượt/phút còn bị áp thêm giới hạn tra cứu (30/phút) và mặc định (100/phút), tính theo IP. Hậu quả: toàn bộ người dùng chia nhau tối đa 8-10 lượt đăng nhập mỗi phút. Một văn phòng dùng chung IP cũng gặp hiện tượng này dù đã đặt `TRUST_PROXY` | Đặt `TRUST_PROXY` đúng (1 bước nginx); sửa route đăng nhập và quên mật khẩu chỉ chịu giới hạn `login`; nâng `LOGIN_THROTTLE_LIMIT` hợp lý, hoặc giới hạn theo `username` + IP để chống dò mật khẩu mà không chặn cả văn phòng. Cần kiểm tra `.env.prod` hiện tại |
| 2 | Trung bình | Đăng nhập chậm khi nhiều người cùng lúc: 60 người cùng lúc mất 5,2 s (p95 5,1 s) vì băm mật khẩu tốn CPU, một tiến trình xử lý khoảng 11,5 đăng nhập/giây. Trong lúc đó `/health` có lúc 315 ms | Chấp nhận được với 50 người. Nếu cần, rải đăng nhập hoặc tăng số bản sao API |
| 3 | Trung bình | Nhật ký tra cứu (`query_logs` + payload) tăng không giới hạn, chưa có chính sách xóa. Mỗi lượt khoảng 2,4 KB với phản hồi nhỏ; phản hồi thật lớn hơn (tối đa 2 MB mỗi phần trước khi cắt) | Theo dõi dung lượng bảng; quyết định chính sách lưu giữ (đã nêu từ trước, cần quyết định) |
| 4 | Thấp | Lỗi timeout/upstream (dự kiến, không phải lỗi hệ thống) được ghi mức ERROR kèm stack `HttpException: Http Exception`; 120 dòng ERROR trong một lần chạy | Hạ xuống WARN, bỏ stack cho lỗi upstream |
| 5 | Thông tin | Giới hạn 30 lượt/phút/người: người dùng bình thường (1 lượt mỗi 2-6 s) không chạm giới hạn trong 1204 lượt. Người tra cứu rất nhanh (nhiều hơn 1 lượt mỗi 2 s liên tục) sẽ bị 429 | Chỉnh qua `QUERY_THROTTLE_LIMIT` / `QUERY_THROTTLE_TTL_MS` nếu nghiệp vụ cần |
| 6 | Thông tin | Một tiến trình API đạt khoảng 234 lượt/giây (4 nhân, chung máy phát tải). Khi bão hòa `/health` cũng chậm theo (tiến trình bận hết) | Với khoảng 50 người dùng (vài lượt/giây) còn dư rất nhiều; chưa cần mở rộng |

Hành vi tốt đã xác nhận: lượt bị giới hạn được từ chối rất rẻ (vài chục ms), người spam không làm chậm người khác; timeout được giới hạn tổng thời gian; thử lại làm giảm lỗi chập chờn từ 30% xuống 2,5%; bộ nhớ ổn định qua 2300+ lượt chạy dài.

## 5. Giới hạn của lần kiểm thử

- Một máy duy nhất, máy phát tải dùng chung CPU với hệ thống; upstream là mock với độ trễ giả lập, không phải API thật qua mạng thật.
- Cơ sở dữ liệu nhỏ (vài nghìn dòng); chưa đo khi lịch sử lên hàng triệu dòng, và các trang Thống kê/Lịch sử/Phân tích chưa được đo.
- Chỉ chạy dài 2 phút, chưa phải thử nghiệm nhiều giờ.
- Chưa đo tra cứu ảnh (`image`), tải trang tĩnh qua nginx, hay làm mới token (refresh) dưới tải.
- Lần chạy đầu tiên bị loại bỏ vì sai phương pháp (người dùng bị chặn đăng nhập và bộ đếm giới hạn dồn giữa các kịch bản); các số liệu ở trên là lần chạy lại với người dùng riêng cho từng kịch bản.

## 6. Cách chạy lại

```bash
# 1. dựng stack test + 4 upstream giả (cần file override mô tả 4 container mock-echo-v2: xem phần cấu hình trong docs/load-test-results/)
docker compose -f docker-compose.test.yml -f <override.yml> --env-file .env.test up -d

# 2. chạy toàn bộ kịch bản (giới hạn theo người dùng mặc định)
node scripts/load-test/run-load-test.js --base http://localhost:8081 \
  --admin-password "<BOOTSTRAP_ADMIN_PASSWORD>" \
  --pg-container app-tra-cuu-du-lieu-test-postgres-1 \
  --containers app-tra-cuu-du-lieu-test-api-1,app-tra-cuu-du-lieu-test-postgres-1 \
  --users 60 --out ket-qua.json

# chỉ chạy một số kịch bản: --only B,F    |    đăng nhập trước rồi chạy sau: --prepare-only --save-session s.json  /  --load-session s.json
```

Cấu hình nguồn dữ liệu giả: `docs/load-test-results/load-test-datasources-config.json` (đặt thành `config.json` trong thư mục được mount vào `/repo/config` của container `api`, kèm `config.schema.json`).
Để đo năng lực, đặt `LOGIN_THROTTLE_LIMIT` và `QUERY_THROTTLE_LIMIT` rất cao cho container `api`; để đo hành vi giới hạn, để mặc định.

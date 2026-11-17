# 07. Độ bền: lỗi upstream, kết nối chết, giới hạn tốc độ (RES)

Chuẩn bị: [00](00-chuan-bi-moi-truong-va-cach-quan-sat.md). Các ca dùng nguồn thử trỏ vào **API giả echo**. Tạo **một lần** hai nguồn thử bằng giao diện theo mẫu DS-02 ([file 03](03-quan-tri-nguon-du-lieu.md)), chỉ khác địa chỉ:
| Mã | Base URL (tự viết) | Ghi chú |
|---|---|---|
| `T_FLAKY` | `http://localhost:4201` | echo hỏng lần đầu (503) |
| `T_ECHO_OK` | `http://localhost:4200` | echo bình thường |
Cả hai: path `/find`, phương thức **POST**, input `soHC` (Chuỗi, **Query param**), output `cccd`, `ho_ten`, `soHC` (Chuỗi), mốc thời gian/định danh `cccd`, labelField `ho_ten`, **recordsPath** `data.items`, **không** khai báo retry/timeout (dùng mặc định: timeout 10 giây, thử lại 2 lần).
Đặt lại echo hỏng lần đầu bất cứ lúc nào: `docker restart echo-flaky`.

---
## RES-01 Upstream hỏng thoáng qua: lần bấm đầu vẫn có kết quả (P1, lỗi đã báo)
**Mục tiêu:** một lần 503 thoáng qua không đến tay người dùng.
**Các bước:** `docker restart echo-flaky`; mở **T_FLAKY**; `Số hộ chiếu` = `B1`; bấm **Tra cứu** **một lần**.
**Kết quả mong đợi:** *Đúng khi:*
- Có kết quả ngay (1 nhóm **Nguyễn Văn Mock**, `Số hộ chiếu: B1`), **không** có khung lỗi; thời gian chờ khoảng **0,3-0,5 giây** hơn bình thường.
- Log backend (`grep "ds=T_FLAKY" /tmp/dev2.log | tail -6`) có đúng chuỗi: `upstream --> POST ... attempt=1` → `upstream <-- 503 ... attempt=1` → `T_FLAKY: retrying after attempt 1/3 failed` → `upstream --> POST ... attempt=2` → `upstream <-- 200 ... attempt=2` → `query ok`.
- Log echo (`docker logs --tail 5 echo-flaky`): một dòng `simulated failure (503) for request #1/1` rồi một dòng `<-- 200`.
- Lịch sử: **một** dòng **Thành công** cho lượt này (lần thử lại không tạo dòng thứ hai).
**Thử thêm:** bấm **Tra cứu** lần nữa ngay sau đó: lần này `attempt=1` thành công luôn (echo chỉ hỏng lần đầu).

---
## RES-02 Upstream hỏng liên tục: báo lỗi sau khi hết số lần thử (P1)
**Chuẩn bị:** dừng và chạy lại echo hỏng **mọi** request: `docker rm -f echo-flaky && docker run -d --name echo-flaky -p 4201:4200 -e MOCK_ECHO_FAIL_FIRST=100 -e MOCK_ECHO_FAIL_MODE=503 gthanh/app_tra_cuu:mock-echo-v1`.
**Các bước:** tra cứu **T_FLAKY** `B1`.
**Kết quả mong đợi:** sau khoảng **1-2 giây** (thử 3 lần: 0, +0,3 s, +0,9 s) hiện **Nguồn dữ liệu tạm thời không phản hồi, vui lòng thử lại sau.**; Network `query` = **502**, `error.code = "UPSTREAM_ERROR"`, `message = "Upstream datasource returned HTTP 503"`. Log có `retrying after attempt 1/3`, `retrying after attempt 2/3`, rồi `query failed ... code=UPSTREAM_ERROR`. Khôi phục echo: `docker rm -f echo-flaky && docker run -d --name echo-flaky -p 4201:4200 -e MOCK_ECHO_FAIL_FIRST=1 -e MOCK_ECHO_FAIL_MODE=503 gthanh/app_tra_cuu:mock-echo-v1`.

---
## RES-03 Upstream trả lỗi 4xx: không thử lại (P1)
**Chuẩn bị:** `docker rm -f echo-flaky && docker run -d --name echo-flaky -p 4201:4200 -e MOCK_ECHO_STATUS=404 gthanh/app_tra_cuu:mock-echo-v1` (mọi request trả 404).
**Các bước:** tra cứu **T_FLAKY** `B1`.
**Kết quả mong đợi:** lỗi hiện **gần như tức thì** (dưới 0,3 giây); log chỉ có **một** `upstream --> ... attempt=1` và **không** có dòng `retrying`; Network `query` = 502 với `message = "Upstream datasource returned HTTP 404"`. (Lỗi phía người gọi không đáng thử lại.)
Thử tương tự `MOCK_ECHO_STATUS=400`: cũng một lần gọi.

---
## RES-04 Upstream chậm hơn giới hạn: 504 đúng hạn (P1)
**Chuẩn bị:** `docker rm -f echo-flaky && docker run -d --name echo-flaky -p 4201:4200 -e MOCK_ECHO_DELAY_MS=15000 gthanh/app_tra_cuu:mock-echo-v1` (mỗi request chờ 15 giây).
**Các bước:** tra cứu **T_FLAKY** `B1`, bấm giờ.
**Kết quả mong đợi:** sau **khoảng 10 giây** (bằng timeout mặc định 10 000 ms, **không** phải 30 giây) hiện **Nguồn dữ liệu tạm thời không phản hồi...**; Network `query` = **504**, `error.code = "UPSTREAM_TIMEOUT"`. Trong lúc chờ, **các tab/nguồn khác vẫn dùng bình thường** (tra cứu `SA_SEARCH_GET` ở tab khác trả kết quả tức thì).
**Đối chiếu:** `curl -s localhost:3000/api/v1/health` ra `ok` trong khi đang chờ.
**Thử thêm:** ở nguồn đặt **Timeout (ms)** = `3000` và **Lưu**: lần tra cứu lại báo lỗi sau khoảng **3 giây**.

---
## RES-05 Upstream nhận rồi im lặng ở lần đầu, các lần sau bình thường (P1)
**Mục tiêu:** hiểu giới hạn: nếu chính upstream không trả lời thì phải đợi hết timeout.
**Chuẩn bị:** `docker rm -f echo-flaky && docker run -d --name echo-flaky -p 4201:4200 -e MOCK_ECHO_FAIL_FIRST=1 -e MOCK_ECHO_FAIL_MODE=hang gthanh/app_tra_cuu:mock-echo-v1` (**lưu ý:** chế độ `hang` có trong script `scripts/mock-echo-server.js`; nếu image `mock-echo-v1` không hỗ trợ thì chạy trực tiếp `MOCK_ECHO_FAIL_FIRST=1 MOCK_ECHO_FAIL_MODE=hang PORT=4201 node scripts/mock-echo-server.js`).
**Các bước:** tra cứu **T_FLAKY** `B1` lần 1; rồi lần 2, lần 3.
**Kết quả mong đợi:** lần 1 treo khoảng **10 giây** rồi **504**; lần 2 và 3 có kết quả ngay (khoảng 50 ms). Đây là **hành vi đã biết**: không phân biệt được "upstream bị treo" với "upstream chậm" nên phải chờ hết thời hạn. Ghi lại thời gian thực tế.

---
## RES-06 Kết nối trình duyệt tới máy chủ bị bỏ âm thầm khi nhàn rỗi (P1, lỗi đã báo)
**Mục tiêu:** sau khi để trang nhàn rỗi, bấm một lần là có kết quả, không treo.
**Chuẩn bị (dựng đường đi bị cắt):**
```bash
(cd apps/web && npx vite build && npx vite preview --port 4173) &        # bản web mới, /api đi tới API :3000
node scripts/load-test/mock-blackhole-proxy.js --listen 8091 --target localhost:4173 --idle-ms 4000 &
```
Proxy này **đứng giữa** trình duyệt và web: sau 4 giây nhàn rỗi nó nuốt dữ liệu và không đóng kết nối (giống tường lửa bỏ kết nối âm thầm).
**Các bước**
1. Mở http://localhost:8091, đăng nhập `pwtest`, vào **SimpleAPI GET /search**, tra cứu một lần (để có kết nối đang mở).
2. **Để yên trang đúng 12 giây** (không bấm gì).
3. Gõ `Số lượng` = `2` và bấm **Tra cứu** **một lần**; bấm giờ.
**Kết quả mong đợi:** có kết quả sau khoảng **2-3 giây** (không treo vô hạn). Console có dòng `[api] N stale connection(s) did not answer after 12s idle — dropped, reconnecting`. Terminal của proxy in `swallowed ... (request never answered)` cho các kết nối chết.
**Đối chứng (bản cũ phải treo):** chạy proxy thứ hai trỏ tới stack dùng image `web-v15`/`web-v16` bản đầu (`--listen 8090 --target localhost:8081`) và lặp lại bước 1-3: bản **không** có cơ chế thăm dò sẽ **treo hàng chục giây** (không có kết quả). Nếu bản mới cũng treo thì là **hỏng**.
Dọn: dừng hai tiến trình nền (`jobs` rồi `kill %1 %2`).

---
## RES-07 Backend tạm tắt rồi bật lại (P2)
**Các bước:** ở trang kết quả tra cứu, dừng API (Ctrl+C `pnpm dev` hoặc `docker stop` stack test), bấm **Tra cứu**; chờ; bật lại; bấm **Tra cứu** lần nữa **không tải lại trang**.
**Kết quả mong đợi:** khi tắt, hiện **Không thể kết nối tới máy chủ, vui lòng kiểm tra kết nối mạng** hoặc lỗi 502 từ proxy trong vài giây (không quay vô hạn); Console có `[api] network error POST /query/... requestId=web-...`. Sau khi bật lại, lần bấm tiếp theo thành công mà không cần F5.

---
## RES-08 Một người dùng gửi dồn dập (spam) (P1)
**Mục tiêu:** bị chặn đúng mức 30 lượt/phút, không ảnh hưởng người khác.
**Chuẩn bị:** hai tài khoản đăng nhập: `pwtest` và `tester_a` (có quyền `SA_SEARCH_GET`, ca ROLE-01). Lấy token: `TOKEN=$(login pwtest 'xZfMt6jrzaAWADDmEJEG')`, `TA=$(login tester_a 'TesterA-Matkhau-2026')`.
**Các bước (spam bằng dòng lệnh, người thường dùng giao diện):**
```bash
# 1) pwtest gửi 60 lượt liên tiếp, đếm mã trả về
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/v1/query/SA_SEARCH_GET -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"params":{"count":1}}'; done | sort | uniq -c
```
Ngay sau lệnh đó (trong 60 giây), ở cửa sổ ẩn danh đăng nhập `tester_a` và tra cứu `SimpleAPI GET /search` `count=2` bằng giao diện.
**Kết quả mong đợi:** lệnh 1 in `30 200` và `30 429` (đúng 30 lượt được xử lý, 30 lượt bị chặn); `tester_a` tra cứu **bình thường** (kết quả hiện, không bị chặn theo `pwtest`). Với `pwtest` trên giao diện lúc này bấm **Tra cứu** thì hiện **Bạn đã tra cứu quá nhiều lần trong thời gian ngắn, vui lòng thử lại sau.** Network `query` = **429**, `error.code = "RATE_LIMITED"`; chờ hết 60 giây thì tra cứu lại được.
**Đối chiếu:** lượt bị 429 phản hồi **rất nhanh** (vài chục mili giây), không gọi upstream: `grep -c "upstream -->" /tmp/dev2.log` chỉ tăng thêm khoảng 30 sau lệnh trên (không phải 60).

---
## RES-09 Người dùng bình thường không bao giờ chạm giới hạn (P1)
**Các bước:** tra cứu `SimpleAPI GET /search` bằng giao diện 15 lần trong 1 phút (mỗi lần cách 3-4 giây).
**Kết quả mong đợi:** cả 15 lần thành công, không có 429. (Giới hạn 30 lượt/phút chỉ chạm khi tra cứu nhanh hơn khoảng một lần mỗi 2 giây liên tục.)

---
## RES-10 Hai nguồn: một nguồn hỏng không kéo theo nguồn khác (P1)
**Các bước:** để `echo-flaky` ở chế độ chậm 15 giây (RES-04); ở tab 1 tra cứu **T_FLAKY** (đang chờ); **ngay lập tức** ở tab 2 tra cứu `SA_SEARCH_GET` `count=2`.
**Kết quả mong đợi:** tab 2 có kết quả tức thì (dưới 1 giây) trong khi tab 1 vẫn đang chờ; `curl -s localhost:3000/api/v1/health` luôn trả nhanh.

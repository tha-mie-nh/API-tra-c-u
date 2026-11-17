# Phase 05: Danh mục ca kiểm thử và kịch bản test tay

## Context Links
- [plan.md](plan.md), [phase 01](phase-01-test-environment-and-fake-upstreams.md) (môi trường), [phase 04](phase-04-browser-e2e-playwright.md) (tự động hóa)
- Có sẵn: `docs/huong-dan-test-tay-2026-11-16.md` (sẽ được thay bằng bộ này)

## Overview
- Ưu tiên: cao. Trạng thái: chưa làm. Đây là **danh mục gốc**: mỗi ca có ID cố định, dùng chung cho test tay, test tự động và báo cáo lỗi. Ca nào tự động được thì ghi cột "Tự động" (U = unit, A = e2e API, B = trình duyệt Playwright); ca chỉ làm tay ghi `Tay`.

## Quy ước
- **Mức ưu tiên**: P1 = phải pass mới phát hành; P2 = quan trọng; P3 = nên có.
- **Môi trường chuẩn**: stack e2e (phase 01); tài khoản `admin`, `operator_a`, `operator_b`, `auditor`, `no_perm`.
- **Mẫu biên bản** mỗi lần chạy tay: ID ca, phiên bản image (digest), người chạy, ngày giờ, kết quả (Đạt/Không đạt/Chặn), bằng chứng (ảnh chụp, `requestId`, đoạn log), ghi chú. Lỗi tìm ra ghi theo mẫu: bước tái hiện, kết quả thực tế, kết quả mong đợi, `requestId`.
- Mỗi ca ghi ngắn "Bước" và "Mong đợi"; bước chi tiết từng click nằm trong kịch bản của test tự động tương ứng hoặc trong biên bản.

## A. Xác thực và phiên (AUTH)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| AUTH-01 | Đăng nhập đúng | Nhập tài khoản, mật khẩu đúng | Vào trang chủ, tên người dùng ở góc phải | A,B | P1 |
| AUTH-02 | Đăng nhập sai mật khẩu | Nhập sai | Thông báo chung "sai tên đăng nhập hoặc mật khẩu", không tiết lộ tài khoản có tồn tại | A,B | P1 |
| AUTH-03 | Khóa sau N lần sai | Sai liên tiếp quá ngưỡng | Tài khoản bị khóa tạm; đúng mật khẩu vẫn bị chặn đến hết thời gian khóa | A | P1 |
| AUTH-04 | Bắt buộc đổi mật khẩu lần đầu | Đăng nhập tài khoản mới | Chuyển sang trang đổi mật khẩu, không vào được trang khác | A,B | P1 |
| AUTH-05 | Đổi mật khẩu | Nhập mật khẩu cũ và mới hợp lệ | Thành công; đăng nhập lại bằng mật khẩu mới; phiên cũ bị thu hồi | A,B | P1 |
| AUTH-06 | Mật khẩu mới yếu/trùng cũ | Nhập mật khẩu không đạt | Bị từ chối kèm lý do | U,A | P2 |
| AUTH-07 | Tải lại trang giữ phiên | F5 khi đã đăng nhập | Vẫn đăng nhập; mạng chỉ có `refresh` rồi `me` (không có 401 thừa) | B | P1 |
| AUTH-08 | Token hết hạn giữa chừng | Để token hết hạn rồi bấm tra cứu | Tự làm mới và có kết quả ngay, không phải bấm lại | B | P1 |
| AUTH-09 | Refresh token bị thu hồi | Đăng xuất ở tab khác, thao tác ở tab này | Bị đưa về trang đăng nhập, không treo | B | P2 |
| AUTH-10 | Đăng xuất | Bấm đăng xuất | Về trang đăng nhập; nút Back không vào lại được | B | P1 |
| AUTH-11 | Giới hạn đăng nhập theo IP | Nhiều người đăng nhập cùng lúc sau nginx | Không bị chặn chung bởi giới hạn tra cứu; đặt `TRUST_PROXY` thì tính theo IP thật | A,Tay | P1 |
| AUTH-12 | Quên mật khẩu | Gửi yêu cầu | Luôn trả thành công (không lộ tài khoản); admin thấy yêu cầu | A | P2 |

## B. Người dùng, vai trò, quyền, nhật ký quản trị
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| USER-01 | Tạo người dùng | Admin tạo, chọn vai trò | Hiện mật khẩu tạm một lần; người dùng đăng nhập được | A,B | P1 |
| USER-02 | Trùng tên đăng nhập | Tạo trùng | Báo lỗi trùng | A | P2 |
| USER-03 | Khóa/mở người dùng | Khóa rồi đăng nhập | Bị từ chối; mở lại thì vào được | A,B | P1 |
| USER-04 | Đặt lại mật khẩu | Admin đặt lại | Mật khẩu tạm mới, buộc đổi khi đăng nhập | A,B | P1 |
| USER-05 | Không xóa/hạ quyền admin cuối cùng | Thử | Bị chặn | U,A | P1 |
| ROLE-01 | Tạo vai trò, gán quyền theo nguồn dữ liệu | Tạo `operator_x` với 2 quyền `api:*` | Người dùng chỉ thấy 2 nguồn trong menu và tra cứu được | A,B | P1 |
| ROLE-02 | Đổi quyền có hiệu lực | Gỡ một quyền khi người dùng đang đăng nhập | Lần gọi sau bị 403, giao diện báo không có quyền | A,B | P1 |
| ROLE-03 | Truy cập trái quyền | Mở trực tiếp URL nguồn không có quyền | Trang không có quyền (403), không lộ cấu hình | A,B | P1 |
| ROLE-04 | Không xóa vai trò đang gán | Xóa | Bị chặn kèm lý do | A | P2 |
| ROLE-05 | Quyền mới của nguồn dữ liệu mới | Tạo nguồn mới | ADMIN tự có quyền; vai trò khác phải tick thủ công | A | P1 |
| AUD-01 | Nhật ký thao tác quản trị | Thực hiện tạo/sửa/xóa | Có dòng nhật ký đủ người, hành động, đối tượng, trước/sau | A,B | P2 |
| AUD-02 | Không ghi dữ liệu nhạy cảm | Xem nhật ký của lượt xem payload | Không chứa nội dung phản hồi, chỉ bộ lọc | A | P1 |

## C. Quản trị nguồn dữ liệu (DS)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| DS-01 | Tạo nguồn GET | Điền URL, `/search`, GET, input `param1`, `count` | Lưu thành công, xuất hiện trong menu tra cứu, `config.json` có mục mới | A,B | P1 |
| DS-02 | Tạo nguồn POST query + body | Input `param1`,`count` chọn Query param, thêm trường Body | Upstream nhận query và body đúng chỗ (xem `/__log`) | A,B | P1 |
| DS-03 | POST chỉ bằng param | Mọi trường chọn Query param | Không gửi body | A | P1 |
| DS-04 | `in: body` với GET | Chọn Body cho GET rồi lưu | Bị từ chối, thông báo nêu rõ | A,B | P1 |
| DS-05 | Query param tĩnh | Thêm `tab=1` | Mọi lần gọi upstream có `?tab=1` | A,B | P1 |
| DS-06 | Header tĩnh, xác thực | Thêm header; xác thực apiKeyHeader chọn biến môi trường | Upstream nhận header; giá trị khóa không bao giờ hiện trên giao diện | A,B | P1 |
| DS-07 | URL lấy từ biến môi trường | Chọn biến trong danh sách | Hiện đúng tên biến, `config.json` lưu `${TEN_BIEN}` | B | P1 |
| DS-08 | Chọn URL env rồi tự viết | Chọn "Tự viết URL khác" | Ô nhập hiện ra giữ giá trị cũ; gõ URL mới lưu được | B | P1 |
| DS-09 | Xóa cache rồi mở form | Ngữ cảnh trình duyệt mới, danh sách biến tải chậm | URL và biến API key đúng, không có `${}` hay ô trống | B | P1 |
| DS-10 | Lưu không đổi gì | Mở form sửa rồi Lưu | Cấu hình không đổi (trừ rút gọn `required:false`); không mất `labelField` hay khóa lạ | U,B | P1 |
| DS-11 | Trường làm tiêu đề | Chọn `labelField` | Mỗi nhóm kết quả lấy tiêu đề từ trường đó | A,B | P1 |
| DS-12 | Mọi khóa mới lưu được | Lưu trường có `labelField`, `displayFormat`, múi giờ, `optionsRef`, `in` | Lưu thành công (schema trong image thắng schema cũ trong thư mục mount) | A,B | P1 |
| DS-13 | Lưu bị từ chối thì báo rõ | Gây lỗi cấu hình (ví dụ múi giờ sai) | Thông báo nổi nêu lỗi đầu tiên + số lỗi còn lại; lỗi inline cạnh trường | B | P1 |
| DS-14 | Bật/tắt nguồn | Tắt rồi tra cứu | Biến mất khỏi menu, gọi trực tiếp bị từ chối | A,B | P1 |
| DS-15 | Xóa nguồn | Xóa | Mất khỏi menu và cấu hình; lịch sử cũ vẫn xem được | A,B | P2 |
| DS-16 | Tải lại cấu hình từ đĩa | Sửa tay `config.json` rồi bấm tải lại | Có hiệu lực không cần restart; cấu hình sai bị từ chối, bản cũ vẫn chạy | A | P1 |
| DS-17 | Cấu hình sai không làm sập | `config.json` sai lúc khởi động | API không lên kèm thông báo lỗi rõ; sửa xong lên lại | A | P2 |
| DS-18 | Biến môi trường thiếu | Nguồn tham chiếu biến chưa đặt | Cảnh báo đỏ ở form; nguồn không gọi được kèm lỗi rõ | B | P2 |
| DS-19 | Tên biến sai quy tắc | Gõ biến không đúng `*_API_KEY`/`*_BASE_URL` | Bị từ chối | A | P2 |
| DS-20 | Trùng mã, mã sai định dạng | Tạo trùng/viết thường | Báo lỗi | A,B | P2 |
| DS-21 | Sao chép từ nguồn khác | Dùng "sao chép từ" | Điền sẵn mọi trường, mã trống | B | P3 |
| DS-22 | Thứ tự trường, thêm/xóa trường | Di chuyển, xóa | Thứ tự hiển thị đổi theo | B | P3 |

## D. Danh mục (DICT)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| DICT-01 | Tạo danh mục | Tên `GIOI_TINH`, thêm `M`=Nam, `F`=Nữ | Lưu được, hiện số dòng, nằm trong `config.json` | A,B | P1 |
| DICT-02 | Tên/khóa không hợp lệ | Tên chữ thường, khóa trùng, dòng trống | Bị từ chối, nút Lưu khóa | U,B | P1 |
| DICT-03 | Dùng cho trường enum đầu vào | Chọn "Danh mục" ở trường | Danh sách chọn ở form tra cứu lấy từ danh mục | A,B | P1 |
| DICT-04 | Dùng cho giá trị đầu ra | `valueMapRef` | Mã `M`/`F` hiển thị Nam/Nữ | A,B | P1 |
| DICT-05 | Sửa danh mục có hiệu lực ngay | Đổi nhãn, tải lại trang tra cứu | Hiện nhãn mới, không restart | A,B | P1 |
| DICT-06 | Xóa danh mục đang dùng | Xóa | Bị chặn, nêu nguồn đang dùng | A,B | P1 |
| DICT-07 | Tham chiếu danh mục không tồn tại | Sửa tay `config.json` | Cấu hình bị từ chối khi nạp | A | P1 |
| DICT-08 | Mẫu định dạng ngày tĩnh | Mở ô chọn định dạng | Có sẵn các mẫu (và "Tùy chỉnh…") | B | P2 |

## E. Tra cứu: thông tin (Q)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| Q-01 | GET search, response mảng gốc | `param1=val1`, `count=2` | 2 bản ghi, tiêu đề nhóm theo `labelField` | A,B | P1 |
| Q-02 | POST search | Query + body | Mô tả bản ghi phản ánh đúng body gửi đi | A,B | P1 |
| Q-03 | Trường bắt buộc, kiểu, min/max, độ dài, regex | Bỏ trống/nhập sai | Lỗi từng ô, tiếng Việt, không gửi lên upstream | U,B | P1 |
| Q-04 | Yêu cầu "một trong"/"nhóm" (`atLeastOneOf`, `requireGroups`) | Điền thiếu | Thông báo nhóm điều kiện | U,B | P1 |
| Q-05 | Ô theo kiểu (chuỗi, số, ngày, ngày giờ, enum, boolean) | Nhập từng loại | Ô nhập phù hợp, định dạng đúng | U,B | P2 |
| Q-06 | Không có kết quả | Tra không khớp | Trạng thái rỗng thân thiện, không lỗi | A,B | P1 |
| Q-07 | Nhiều bản ghi/nhóm, phân trang | `count` lớn hơn cỡ trang | Chuyển trang giữ điều kiện; thông báo khi bị cắt `maxResults` | A,B | P1 |
| Q-08 | Giữ kết quả khi chuyển trang | Rời trang rồi quay lại | Còn kết quả và điều kiện đã nhập | B | P3 |
| Q-09 | Giá trị null/thiếu trường | Upstream thiếu trường | Hiện `—`, không lỗi | A,B | P1 |
| Q-10 | Response không phải JSON, JSON hỏng | Upstream trả lỗi định dạng | Lỗi upstream rõ ràng, không lộ nội dung/stack | A | P1 |
| Q-11 | Phản hồi rất lớn | Trên 2 MB | Hệ thống không sập; payload lịch sử bị cắt và đánh dấu | A | P2 |
| Q-12 | Ký tự đặc biệt/XSS trong dữ liệu | Upstream trả `<script>` | Hiển thị dạng chữ, không chạy | B | P1 |
| Q-13 | Chuyển giữa các nguồn | Bấm lần lượt | Form và kết quả đúng của từng nguồn | B | P2 |

## F. Tra cứu: ảnh (IMG)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| IMG-01 | Ảnh base64 trong response, id kiểu số | `GET /images?count=2` | Hiện 2 thumbnail, **không** báo "Không có ảnh nào khớp" | A,B | P1 |
| IMG-02 | id kiểu chuỗi | Upstream đổi id sang chuỗi | Hiện bình thường | U,A | P1 |
| IMG-03 | Base64 có/không tiền tố `data:` | Hai biến thể | Cả hai hiện đúng | U | P1 |
| IMG-04 | Bấm ảnh phóng to | Click thumbnail | Ảnh chiếm khoảng 80% chiều cao (và tối đa 80% chiều rộng) cửa sổ ở 1440x900, 1280x720, 1024x768 | B,Tay | P1 |
| IMG-05 | Điều hướng ảnh | Phím mũi tên, Esc, nút đóng | Chuyển ảnh, đóng đúng | B | P2 |
| IMG-06 | Thông tin kèm ảnh | Xem phần mô tả dưới ảnh | Đủ trường, ngày đã định dạng, không hiện base64 thô | B | P2 |
| IMG-07 | Không có ảnh | Upstream trả `data: []` hoặc ảnh rỗng | Thông báo "Không có ảnh nào khớp" đúng chỗ | U,B | P1 |
| IMG-08 | Sai khóa truy cập | Dùng khóa sai | "API key sai hoặc hết hạn"; lịch sử ghi `UPSTREAM_UNAUTHORIZED` | A,B | P1 |
| IMG-09 | Ảnh trong bảng thông tin (`type: info` có cột ảnh) | Xem và bấm ảnh | Thumbnail, bấm phóng 80% | U,B | P2 |
| IMG-10 | Proxy ảnh (minio-pg) | Tra cứu nguồn dùng MinIO | Ảnh tải qua proxy có xác thực, không lộ URL MinIO | A | P1 |
| IMG-11 | Lặp lại nhiều lần | Tra cứu ảnh 20 lần liên tiếp | Lần nào cũng hiện (kiểm tra "lúc được lúc không") | B | P1 |

## G. Ngày giờ, định dạng, múi giờ (DT)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| DT-01 | Sắp xếp theo ngày dạng `DD/MM/YYYY HH:mm:ss` | Dữ liệu nhiều ngày | Mới nhất lên trước (hoặc theo cấu hình) | U,A,B | P1 |
| DT-02 | Sắp xếp khi trường khai báo Chuỗi | Đổi kiểu thành Chuỗi | Vẫn sắp đúng | U,A | P1 |
| DT-03 | Nhiều dạng ngày lẫn lộn trong một trường | `format` có `|` | Mọi dòng đều parse đúng | U,A | P1 |
| DT-04 | Giá trị không parse được | Dữ liệu lạ | Hiện nguyên văn, không `-`, không đoán ngày | U,B | P1 |
| DT-05 | Định dạng nguồn (đọc) | Chọn mẫu hoặc tùy chỉnh | Chuyển chuỗi sang ngày đúng | U,A,B | P1 |
| DT-06 | Định dạng hiển thị | Chọn mẫu hoặc tùy chỉnh (`HH:mm DD.MM.YYYY`) | Hiển thị đúng; lưu được; có ví dụ xem trước | U,B | P1 |
| DT-07 | Định dạng ngày của input | Chọn `DD/MM/YYYY`, `YYYYMMDD` | Upstream nhận đúng dạng (xem `/__log`) | U,A,B | P1 |
| DT-08 | Tùy chỉnh định dạng input/output lưu được | Gõ tùy chỉnh, Lưu | Lưu thành công, mở lại thấy đúng | B | P1 |
| DT-09 | Múi giờ nguồn | `Asia/Ho_Chi_Minh` với giờ không kèm múi | Hiển thị đúng giờ gốc, không lệch 7 giờ | U,A,B | P1 |
| DT-10 | Múi giờ hiển thị | Đổi sang UTC/khác | Giờ hiển thị đổi tương ứng | U,B | P2 |
| DT-11 | Múi giờ sai | `Mars/Base` | Bị từ chối khi lưu | A,B | P2 |
| DT-12 | Ngày không tồn tại | `31/02/2026` | Không đoán; hiện nguyên văn | U | P2 |
| DT-13 | Giờ mùa hè (DST) | Múi giờ có DST | Không lệch giờ | U | P3 |

## H. Độ bền và lỗi upstream (RES)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| RES-01 | Upstream đứt kết nối lần đầu | `echo` lỗi N lần đầu | Có kết quả ngay lần bấm đầu nhờ thử lại; log có `retrying` | A,B | P1 |
| RES-02 | 503 chập chờn 30% | Tải nhiều lượt | Lỗi đến người dùng khoảng 2-3% (0,3 mũ 3) | A | P2 |
| RES-03 | 4xx không thử lại | Upstream trả 400/404 | Một lần gọi, báo lỗi đúng | A | P1 |
| RES-04 | Timeout | Upstream chậm hơn `timeoutMs` | 504 đúng hạn (không nhân với số lần thử) | A,B | P1 |
| RES-05 | Upstream treo | Nhận rồi im | Hết timeout thì báo 504, các nguồn khác không ảnh hưởng | A | P1 |
| RES-06 | 429 từ upstream | Có `Retry-After` | Báo rõ, hành vi thử lại theo cấu hình | A | P2 |
| RES-07 | 401/403 từ upstream | Sai khóa | `UPSTREAM_UNAUTHORIZED`, trình duyệt nhận 502 (không bị đăng xuất) | A,B | P1 |
| RES-08 | Kết nối chết khi nhàn rỗi (trình duyệt -> nginx) | Qua `blackhole-web`, nghỉ 12 giây rồi bấm 1 lần | Có kết quả dưới 5 giây; console cảnh báo kết nối chết | B | P1 |
| RES-09 | Kết nối chết (api -> upstream) | Qua `blackhole-upstream` | Socket nhàn rỗi không bị dùng lại, không treo | A | P1 |
| RES-10 | Backend tắt/bật lại | Tắt API rồi bật | Thông báo lỗi rõ khi tắt, tự phục hồi, không phải F5 | B | P2 |
| RES-11 | DB tắt | Tắt Postgres | Health báo lỗi rõ; phục hồi khi bật | A | P2 |
| RES-12 | Spam một người | 200 lượt dồn dập | Chỉ 30 lượt được xử lý, còn lại 429 nhanh; người khác không ảnh hưởng | A,B | P1 |
| RES-13 | Dồn cùng lúc 60 người | Đồng thời | 100% thành công, tối đa dưới 1 giây | A | P2 |
| RES-14 | Nhiều người dùng chung IP | Đăng nhập đồng loạt | Xem AUTH-11 | A | P1 |

## I. Lịch sử tra cứu (HIS)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| HIS-01 | Mỗi lượt có một bản ghi | Tra cứu thành công và thất bại | Có bản ghi: người dùng, nguồn, trạng thái, mã HTTP, thời gian, số bản ghi | A,B | P1 |
| HIS-02 | Lỗi upstream ghi đúng mã | Sai khóa/timeout/503 | Mã lỗi và HTTP đúng (`UPSTREAM_UNAUTHORIZED`, `UPSTREAM_TIMEOUT`...), chi tiết nêu mã của upstream | A,B | P1 |
| HIS-03 | Phạm vi xem | Người thường chỉ thấy của mình; có quyền xem tất cả thì thấy mọi người | Đúng phạm vi | A,B | P1 |
| HIS-04 | Bộ lọc và URL | Lọc theo thời gian, nguồn, người, kết quả, mã lỗi, IP, thời lượng | Kết quả đúng, mở lại URL ra cùng kết quả | A,B | P1 |
| HIS-05 | Khoảng thời gian nửa mở theo giờ VN | `[from, to)` | Không lệch 7 giờ | A | P1 |
| HIS-06 | Chi tiết và payload | Mở chi tiết, tab Đầu vào/Đầu ra | Admin xem được; người khác không; có ghi audit | A,B | P1 |
| HIS-07 | Không lưu khóa xác thực | Xem payload gọi upstream | Header khóa hiện `[redacted]` | A | P1 |
| HIS-08 | Xuất CSV | Xuất | Có BOM/UTF-8, tối đa 50.000 dòng, ô bắt đầu bằng `=`,`+`,`-`,`@` được chống chèn công thức | A | P1 |
| HIS-09 | Lịch sử cũ trước khi có cột mới | Bản ghi cũ | Hiện `—` ở trường thiếu, không lỗi | A | P3 |

## J. Thống kê và phân tích (STAT/INS)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| STAT-01 | Tổng quan theo khoảng thời gian | Chọn 24h/7/30/90 ngày | Số liệu khớp lịch sử (đối soát) | A,B | P1 |
| STAT-02 | Drill-down | Bấm thẻ/cột/dòng/mã lỗi | Mở lịch sử với đúng bộ lọc | A,B | P1 |
| STAT-03 | So sánh kỳ trước | Bật | Phần trăm tăng/giảm đúng | A | P2 |
| STAT-04 | Gom theo ngày/tháng | Khoảng > 90 ngày | Tự gom tháng | A | P3 |
| INS-01 | Top người dùng/lỗi/độ trễ theo nguồn | Mở phân tích | Số liệu khớp dữ liệu | A,B | P2 |
| INS-02 | Bất thường (tăng đột biến, ngoài giờ, CCCD dùng chung, IP dùng chung) | Tạo dữ liệu mẫu | Phát hiện đúng | A | P2 |
| INS-03 | Xuất CSV phân tích | Xuất | Giới hạn 100 dòng/bảng, chống chèn công thức | A | P2 |

## K. Cấu hình, nâng cấp, triển khai (CFG/DEP)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| CFG-01 | Schema trong image thắng schema cũ | Mount thư mục config có `config.schema.json` cũ | Lưu khóa mới thành công; không có "must NOT have additional properties" | A,B | P1 |
| CFG-02 | Cấu hình cũ (`mapTo`/`from`) | Chạy với config cũ | Vẫn tra cứu bình thường | A | P1 |
| CFG-03 | Script chuyển đổi một-khóa | Chạy `migrate-config-single-key.js` | Config mới hợp lệ, idempotent | U | P2 |
| CFG-04 | Mặc định áp dụng | Nguồn không khai báo `retry` | Dùng `defaults.retry` | U,A | P1 |
| DEP-01 | Image khởi động | `docker compose up` bằng image phát hành | Mọi dịch vụ healthy | Tay | P1 |
| DEP-02 | Nâng cấp từ v12/v15 | Pull image mới, giữ DB cũ | Migration chạy, dữ liệu cũ còn nguyên | Tay | P1 |
| DEP-03 | Quyền thư mục config/log | Thư mục thuộc root | Entrypoint tự chỉnh; ghi lưu được | Tay | P2 |
| DEP-04 | Log ra file | `LOG_FILE` đặt | File có đúng định dạng `giờ - MỨC - context - nội dung` | A | P2 |
| DEP-05 | Quét an ninh image | Trivy/ClamAV | Không có lỗ hổng mức cao chưa xử lý | Tay,CI | P2 |
| DEP-06 | Cổng và địa chỉ | Truy cập qua nginx | Giao diện và `/api/v1/*` cùng origin; không lộ cổng API | Tay | P1 |

## L. Log và truy vết (LOG)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| LOG-01 | Định dạng log | Tra cứu một lần | Dòng vào/ra, bắt đầu/kết thúc tra cứu, gọi upstream, cùng `requestId` | A | P1 |
| LOG-02 | Không lộ dữ liệu nhạy cảm | Tra cứu CCCD | Log không có body, CCCD, khóa | A | P1 |
| LOG-03 | Khớp log giao diện và backend | Lấy `requestId` trong console | Tìm thấy chuỗi dòng tương ứng ở backend | B | P1 |
| LOG-04 | Giao diện chỉ log cảnh báo/lỗi | Thao tác bình thường | Console không có log thường | B | P2 |
| LOG-05 | `X-Request-Id` sang upstream | Tra cứu | Upstream nhận cùng `requestId` | A | P1 |
| LOG-06 | Id đầu vào độc hại | Gửi `X-Request-Id` có xuống dòng | Bị thay bằng id mới, không chèn dòng log | U,A | P1 |

## M. Giao diện chung (UI)
| ID | Ca | Bước chính | Mong đợi | Tự động | Ưu tiên |
|---|---|---|---|---|---|
| UI-01 | Menu theo quyền | Đăng nhập từng vai trò | Chỉ thấy mục được phép | B | P1 |
| UI-02 | Phản hồi theo kích thước | 1280, 1024, 768 | Không vỡ bố cục, không cuộn ngang | B,Tay | P2 |
| UI-03 | Màu sắc | Xem các trang chính | Bảng màu trung tính ban đầu, tương phản đủ đọc | Tay | P2 |
| UI-04 | Thông báo lỗi/thành công | Thao tác lưu | Thông báo nổi rõ ràng, tiếng Việt đủ dấu | B | P2 |
| UI-05 | Trình duyệt | Chrome, Edge, Firefox, Safari | Chức năng chính hoạt động | B,Tay | P2 |
| UI-06 | Khả năng truy cập | Dùng bàn phím, đọc nhãn | Đi qua được form chính bằng Tab | Tay | P3 |

## Bộ hồi quy REG (lỗi đã gặp, bắt buộc chạy mỗi lần phát hành)
| REG | Lỗi | Ca bao phủ |
|---|---|---|
| REG-01 | Date không sort | DT-01, DT-02 |
| REG-02 | Datetime hiện `-`, sai định dạng | DT-03, DT-04 |
| REG-03 | Lưu form làm mất `format` hoặc khóa lạ | DS-10 |
| REG-04 | Không chọn được định dạng hiển thị/múi giờ | DT-06, DT-09, DT-10 |
| REG-05 | Log thiếu, không truy vết | LOG-01..LOG-05 |
| REG-06 | Mất URL/API key khi xóa cache | DS-09 |
| REG-07 | Chọn URL env không tự viết được | DS-08 |
| REG-08 | Lần đầu tra cứu lỗi (`defaults.retry` không áp dụng) | RES-01 |
| REG-09 | Treo đến hết timeout khi kết nối chết | RES-08, RES-09 |
| REG-10 | Danh mục, map một lần, `labelField` | DICT-01..07, DS-11 |
| REG-11 | Schema cũ làm lưu bị từ chối | CFG-01, DS-12, DS-13 |
| REG-12 | Định dạng ngày input không dùng | DT-07, DT-08 |
| REG-13 | GET không gửi tham số, POST chỉ param | DS-02, DS-03, DS-04 |
| REG-14 | Response mảng gốc ra 0 kết quả | Q-01 |
| REG-15 | "Không có ảnh nào khớp" với id số | IMG-01, IMG-11 |
| REG-16 | Ảnh bấm vào nhỏ | IMG-04 |
| REG-17 | 401 từ upstream hiển thị chung chung | RES-07, HIS-02, IMG-08 |
| REG-18 | `/auth/me` 401 và refresh thừa khi tải trang | AUTH-07 |
| REG-19 | Đăng nhập đồng loạt bị chặn | AUTH-11, RES-14 |
| REG-20 | Ngày không phải ISO bị đọc kiểu Mỹ | DT-04 |

## Todo List
- [ ] Rà soát danh mục với người sở hữu từng chức năng, bổ sung ca còn thiếu
- [ ] Chuyển mỗi ca thành kịch bản chi tiết (bước click) cho các ca `Tay`
- [ ] Gắn mỗi ca tự động vào test cụ thể (cột "Tự động") trong phase 02/03/04
- [ ] Mẫu biên bản và bảng theo dõi kết quả mỗi bản phát hành

## Success Criteria
- Mỗi ca có ID duy nhất, bước và kết quả mong đợi rõ, dùng được cả khi không có người viết ca.
- 100% ca P1 chạy được; ca P1 tự động hóa được thì phải tự động hóa.
- Mọi lỗi mới phát hiện được thêm một ca `REG` trước khi sửa.

## Risks
- Danh mục dài khó bảo trì: giữ mỗi ca một dòng, kịch bản chi tiết đặt cạnh test tự động.
- Số ca "Tay" tăng làm chậm phát hành: ưu tiên chuyển ca lặp nhiều lần sang tự động.

## Security Considerations
- Ca `LOG-02`, `HIS-07`, `AUD-02`, `DS-06` kiểm tra rò rỉ dữ liệu nhạy cảm; là điều kiện chặn phát hành.

## Next Steps
Phase 04 ưu tiên tự động hóa các ca `B` thuộc bộ REG.

# Giai đoạn 10 — Tính năng demo timeline (4 datasource config-driven mới)

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-config-schema.md](reference-config-schema.md) — dùng đúng DSL contract, không sửa 1 dòng code lõi
- `config/config.json`, `config/mock-data/*.json` — nơi thay đổi thực sự
- `/home/thanh/Project_app_API/sample_ES.txt` — sample doc ES thật `fs.entity.Citizen`, dùng để lấy cảm hứng đặt tên field/nhãn (`Residential`, `Father`/`Mother`/`Couple`/`Child`)
- Phụ thuộc vào Giai đoạn 04 (datasource engine), 05 (query/RBAC), 07 (dynamic UI), 08 (role permission UI)

## Tổng quan
- **Priority:** P1 — yêu cầu demo từ leader (Egor), thêm các tính năng timeline hướng nghiệp vụ trên nền
  kiến trúc config-driven đã hoàn thiện (Giai đoạn 01–09).
- **Status:** completed
- **Effort:** ~4h
- Egor (mô tả bằng lời, qua ảnh chụp màn hình) yêu cầu 3 tính năng demo lấy CCCD làm input, mỗi tính năng
  hiển thị timeline của người đó theo 1 nguồn dữ liệu khác nhau, kèm quyền tự do sáng tạo thêm và cải
  thiện UX. Đã triển khai 4 datasource mock mới kiểu `type: "info"` hoàn toàn qua `config/config.json` +
  `config/mock-data/*.json` — **không sửa bất kỳ dòng code Frontend/Backend lõi nào** để chúng hiện ra.

## Nhận định chính
- Kiến trúc config-driven xây ở Giai đoạn 04/07 hoạt động đúng như thiết kế: thêm 1 datasource mới chỉ
  là **thay đổi nội dung config**. Đã verify trực tiếp — sau khi cấp quyền `api:*` và restart backend,
  cả 4 tính năng tự hiện ra trên sidebar, trang chủ, form tra cứu động và kết quả timeline mà
  **không sửa 1 dòng nào** trong `apps/web/src/features/query/**` hay `apps/api/src/query/**`.
- Tiêu đề card timeline theo từng người (`response-mapper.service.ts#deriveLabel`) là **quy ước config**,
  không hardcode danh sách field: nó tìm field output có tên đúng là `fullName`. Điều này được phát hiện
  lúc verify trực tiếp — `VEHICLE_OWNERSHIP` ban đầu dùng tên field `ownerName` khiến card timeline hiển
  thị CCCD thô thay vì tên người. Đã fix bằng cách đổi tên field output thành `fullName` (nhãn hiển thị
  `label` vẫn giữ "Chủ sở hữu") — chỉ sửa config, không sửa code, càng khẳng định đây là quy ước chứ
  không phải lỗi kiến trúc.
- `MockInfoAdapter.matches()` chỉ hỗ trợ **khớp chính xác** (với kiểu không phải string) hoặc **khớp
  chuỗi con không phân biệt hoa thường** (với kiểu string) — không có toán tử range/so sánh. Nếu làm
  filter "khoảng thời gian" theo nghĩa đen (gợi ý ban đầu của Egor cho xuất/nhập cảnh) sẽ âm thầm
  không bao giờ khớp được gì (input `date` "2020-05-01" gần như không bao giờ bằng đúng giá trị lưu dạng
  `datetime` như `"2020-05-01T08:00:00Z"`). Cố tình dùng filter phụ dạng `enum` (`direction`/
  `documentType`/`vehicleType`/`eventType`) thay thế — từng filter tùy chọn trong 4 datasource mới đều
  thực sự hoạt động khi test trên trình duyệt (đã verify).
- Các mốc tuổi ví dụ của Egor cho lịch sử CCCD ("20/40/50 tuổi") không khớp với nhân vật demo sẵn có
  (Nguyễn Văn A, sinh 1999 theo `citizen-basic.json`/`citizen-extended.json`, nên năm 2026 mới 27 tuổi).
  Đã thay bằng các mốc pháp lý thật của CMND/CCCD Việt Nam (14 tuổi làm CMND 2013 → 2016 CCCD mã vạch →
  2021 CCCD gắn chip → 2024 Thẻ căn cước theo Luật Căn cước 2023) — vẫn giữ đúng tinh thần "nhiều lần
  cấp giấy tờ tùy thân qua các giai đoạn cuộc đời", nhưng mốc thời gian thực tế hơn.
- `FAMILY_EVENTS` (tính năng thứ 4 tự sáng tạo) liên kết chéo 2 nhân vật demo có sẵn: Nguyễn Văn A
  (`001099001234`) và Trần Thị B (`001099009999`, đã là "nhân vật phụ" từ test Giai đoạn 07) được ghi
  nhận là kết hôn năm 2023 và sinh con năm 2025 — tra cứu theo CCCD của bên nào cũng ra 1 câu chuyện
  liền mạch, đọc thuyết phục hơn nhiều so với các dòng dữ liệu rời rạc khi demo trực tiếp.

## Yêu cầu
**Chức năng**
- 4 entry `datasources[]` mới, `type: "info"`, `transport.kind: "mock"`, mỗi cái có file
  `mock-data/*.json` riêng, khớp đúng 3 tính năng Egor yêu cầu + 1 tính năng tự thêm:
  1. `XUAT_NHAP_CANH` — timeline xuất/nhập cảnh (cửa khẩu, quốc gia, mục đích, chiều)
  2. `CCCD_HISTORY` — lịch sử làm CMND/CCCD/Thẻ căn cước (loại giấy tờ, đặc điểm nhận dạng, chiều cao, tuổi lúc cấp)
  3. `VEHICLE_OWNERSHIP` — lịch sử sở hữu phương tiện (hãng xe, biển số, giá trị, nơi đăng ký)
  4. `FAMILY_EVENTS` — sự kiện hộ tịch & quan hệ gia đình (khai sinh/kết hôn/khai sinh con/ly hôn, người liên quan)
- Mỗi datasource: input bắt buộc `citizenId` (`^[0-9]{12}$`), 1 filter phụ tùy chọn kiểu `enum`,
  7–9 field output, nhãn tiếng Việt, `timestampField` sắp xếp `desc`, `identityField: citizenId`.
- Nhân vật demo `001099001234` có 3–6 bản ghi mỗi tính năng trải dài nhiều năm; nhân vật phụ
  `001099009999` có 1–3 bản ghi — đủ để ra timeline thật, không phải data đắp cho có.
- Quyền `api:*` mới được cấp cho role ADMIN qua đúng endpoint `PUT /admin/roles/:id/permissions`
  (không sửa thẳng SQL).
- Sidebar/trang chủ có icon riêng (chỉ ở lớp trình bày) cho mỗi mã datasource mới (có icon mặc định
  cho mã nào không nằm trong map).

**Phi chức năng**
- Không sửa gì trong `apps/web/src/features/query/**` hay `apps/api/src/query|datasources/**` (logic lõi).
- Schema AJV + validate chéo field phải pass lúc backend boot (hợp đồng fail-fast từ Giai đoạn 04).
- Không regression với 101 test hiện có (api unit 26 + api e2e 36 + web 39) hay lint/typecheck/build.

## Kiến trúc
Không có thay đổi kiến trúc — giai đoạn này thuần túy là minh chứng cho thiết kế đã có. Luồng dữ liệu
giống hệt `CITIZEN_BASIC`/`CITIZEN_EXTENDED`/`CITIZEN_RESIDENCE`: entry trong `config.json` →
`DatasourceConfigLoaderService` (validate AJV + cross-field lúc boot) → `PermissionSyncService` tự tạo/cập
nhật permission row `api:*` → `MockInfoAdapter` đọc `mock-data/*.json`, lọc theo `input.fields[].mapTo` →
`ResponseMapperService` gom nhóm theo `identityField`, lấy nhãn timeline từ `fullName`, sắp xếp theo
`timestampField` → `QueryEnvelope` thống nhất → `QueryPage`/`DynamicSearchForm`/`InfoTimeline` generic ở
Frontend hiển thị.

Chỗ duy nhất đụng đến Frontend là lớp trình bày: `datasource-icon.tsx` (mới, ~20 dòng) map `code → icon
lucide`, có icon `Search` mặc định. File này không ảnh hưởng tới việc hiện/ẩn hay hành vi —
`no-hardcoded-datasource-code.test.ts` (chỉ phạm vi `features/query`) không bị đụng tới và vẫn pass; icon
map cố tình đặt ngoài `features/query`.

## File code liên quan
**Đã sửa**
- `config/config.json` — thêm 4 entry `datasources[]` mới, nối sau `CITIZEN_PHOTO`
- `apps/web/src/components/layout/sidebar-nav.tsx` — dùng `DatasourceIcon` thay vì icon `Search` cố định
- `apps/web/src/routes/home-page.tsx` — tương tự, ở các card trên dashboard

**Đã tạo**
- `config/mock-data/xuat-nhap-canh.json` (8 bản ghi)
- `config/mock-data/cccd-history.json` (7 bản ghi)
- `config/mock-data/vehicle-ownership.json` (4 bản ghi)
- `config/mock-data/family-events.json` (6 bản ghi)
- `apps/web/src/components/layout/datasource-icon.tsx` — map code→icon (chỉ trình bày)

## Các bước triển khai
1. Đọc `sample_ES.txt`, `reference-config-schema.md`, `config.json`/mock-data hiện có để nắm quy ước đặt
   tên field (`mapTo` dạng `snake_case`, nhãn tiếng Việt, cờ sensitive cho field CCCD).
2. Đọc `mock-info.adapter.ts` để xác nhận ngữ nghĩa filter chỉ hỗ trợ exact/substring trước khi thiết kế
   field input phụ — loại bỏ filter khoảng thời gian, chọn filter `enum` thay thế.
3. Đọc `config.schema.json` + `config-cross-field-validator.ts` để xác nhận mọi ràng buộc
   (`identityField`/`timestampField` phải tồn tại trong `output.fields`, pattern của `code`,
   pattern của `permissionCode`) trước khi viết entry.
4. Thêm 4 entry datasource vào `config/config.json`; viết 4 file mock-data JSON tương ứng với câu
   chuyện nhiều năm liên kết nhau cho `001099001234`/`001099009999`.
5. Validate config JSON + typecheck + lint.
6. Khởi động backend (xem Đánh giá rủi ro — `dist/` không ổn định trong sandbox này; dùng
   `ts-node --files -r tsconfig-paths/register src/main.ts` làm runtime dev ổn định thay thế), xác nhận
   `PermissionSyncService` log ra "Synced 8 api:* permission(s)".
7. Đăng nhập `admin` qua `POST /auth/login`, `GET /admin/roles` → lấy id role Administrator, `PUT
   /admin/roles/:id/permissions` với 7 mã cũ + 4 mã mới (semantics full-replace).
8. Xác nhận `GET /datasources` (client projection) liệt kê đủ cả 4; `POST /query/:code` trả đúng bản ghi
   đã gom nhóm/sắp xếp cho `001099001234`.
9. Thêm `datasource-icon.tsx`, gắn vào sidebar/trang chủ.
10. Verify trên trình duyệt (agent-browser): đăng nhập, vào từng trang trong 4 trang mới, nhập CCCD
    `001099001234`, chụp màn hình timeline. Đúng lúc này phát hiện và fix bug đặt tên field `fullName`
    của `VEHICLE_OWNERSHIP`.
11. Chạy lại typecheck/lint/build/toàn bộ test suite sau khi fix.
12. Viết file phase này, cập nhật `plan.md`.

## Danh sách việc cần làm
- [x] Thiết kế 4 config datasource (3 tính năng của Egor + 1 tự sáng tạo) đúng DSL contract
- [x] Viết 4 file mock-data với timeline nhiều năm, liên kết chéo nhau
- [x] Validate AJV/cross-field pass lúc boot
- [x] Cấp quyền `api:*` cho role ADMIN qua API thật (không dùng SQL)
- [x] Xác nhận không cần sửa code Frontend/Backend lõi nào để tính năng hiện ra
- [x] Fix bug nhãn timeline của `VEHICLE_OWNERSHIP` (`ownerName` → `fullName`)
- [x] Polish icon (chỉ trình bày, có fallback mặc định)
- [x] typecheck / lint / build / toàn bộ test suite pass
- [x] Verify trên trình duyệt kèm ảnh chụp cho cả 4 tính năng
- [x] File phase này + dòng trong `plan.md`

## Tiêu chí hoàn thành
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` đều pass, 0 lỗi — đạt.
- `apps/api` unit (26/26), e2e (36/36), `apps/web` (39/39) đều pass, không regression — đạt.
- `GET /datasources` cho user có quyền ADMIN liệt kê đủ 4 mã mới — đạt (verify qua curl + trình duyệt).
- Trình duyệt: đăng nhập → sidebar/trang chủ tự hiện đủ 4 link mới → tra `001099001234` trên từng trang →
  timeline nhiều bản ghi hiện đúng, nhãn tiếng Việt đúng, thứ tự sắp xếp đúng — đạt, có ảnh chụp lưu ở
  `visuals/`.
- Không có mã datasource literal nào trong `features/query/**` — `no-hardcoded-datasource-code.test.ts`
  vẫn pass không cần sửa.

## Đánh giá rủi ro
- **`dist/` không ổn định trong sandbox**: trong môi trường này, `nest build`/`node dist/main` thỉnh
  thoảng ra `dist/` rỗng hoặc thiếu giữa lúc build và lúc chạy (quan sát thấy dù không đổi code, và tự
  hết ở lần `pnpm run build` sau đó) — nhiều khả năng do đụng độ với agent Phase 09 chạy song song cũng
  đang động vào build/docker artifact trên cùng working tree. Đã giảm thiểu cho việc verify của phase
  này bằng cách chạy API qua `ts-node --files` trực tiếp từ `src/`, cách này ổn định và không phụ thuộc
  `dist/` đã persist hay chưa. Không phải lỗi code; `pnpm run build` đã chạy sạch ít nhất 1 lần trong
  phiên này với đầy đủ output cả `apps/api`+`apps/web`.
- **Mock matcher chỉ hỗ trợ filter exact/substring** (xem Nhận định chính) — đã thiết kế mọi filter phụ
  dạng `enum` để né vấn đề này, đã verify từng cái thực sự dùng được trên trình duyệt (không phải field
  trang trí không bao giờ khớp).
- **Permission catalog trôi dữ liệu**: `PermissionSyncService` chỉ thêm/cập nhật row `api:*`, không bao
  giờ xóa — an toàn theo thiết kế, đã xác nhận qua log lúc boot ("Synced 8 api:* permission(s)").

## Cân nhắc bảo mật
- Không có secret nào trong các entry này — `transport.kind: "mock"`, không biến env, không credential
  upstream, cùng tư thế bảo mật như 3 datasource mock hiện có.
- `citizenId`/`relatedPersonId` đánh dấu `sensitive: true` ở đâu mang giá trị CCCD, đúng quy ước hiện có
  (được mask trong audit log).
- Các datasource mock vẫn chịu ràng buộc `enforceNoMockInProduction()` (Giai đoạn 04) — sẽ từ chối boot
  khi `NODE_ENV=production` trừ khi `ALLOW_MOCK_DATASOURCES=true`, giống 3 datasource còn lại.
- Quyền chỉ cấp cho role Administrator (theo đúng yêu cầu); role Operator/Auditor không đổi.

## Bước tiếp theo
- Khi có API thật cho các domain này, thay đổi cần làm vẫn chỉ là sửa config: đổi `transport.kind`
  thành `http`, điền `baseUrl`/`path`/`auth`, xong (theo `reference-config-schema.md` mục "Vì sao thiết
  kế này vẫn đứng vững khi có API thật").
- Cân nhắc (chưa làm, YAGNI cho bản demo) cấp thêm mã `api:*` mới cho role Operator/Auditor nếu Egor
  muốn user không phải admin cũng thấy được các tính năng này.

## Câu hỏi chưa giải quyết
- `CITIZEN_EXTENDED` (hiện đang `enabled: false` trong `config.json`, do phiên Phase 09 chạy song song
  đổi) có nên tiếp tục để tắt hay bật lại? Giữ nguyên theo đúng chỉ dẫn (thay đổi từ bên ngoài, không
  phải việc của giai đoạn này để revert) — cần người merge cả 2 phase quyết định.
- Egor chưa đưa ra spec thật cho 3 tính năng này (chỉ mô tả bằng lời/ảnh chụp màn hình theo brief công
  việc) — tên field/nhãn ở đây là diễn giải tốt nhất có thể dựa trên `sample_ES.txt` + mô tả trong ảnh;
  dự kiến sẽ có vòng chỉnh sửa tiếp theo sau khi Egor xem demo trực tiếp.

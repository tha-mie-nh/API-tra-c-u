# Giai đoạn 07 — Dynamic Query UI + Timeline Result Views

## Liên kết ngữ cảnh
- [plan.md](plan.md) · **[reference-screens-and-ux.md](reference-screens-and-ux.md)** (S2, S3) · [reference-config-schema.md](reference-config-schema.md)
- [research/researcher-02-config-driven-ui-and-minio-images.md](research/researcher-02-config-driven-ui-and-minio-images.md) (§A forms/tables, §B timeline)
- Phụ thuộc vào Giai đoạn 05, 06

## Tổng quan
- **Priority:** P1 — tính năng mà người dùng thực sự vào app để dùng
- **Status:** completed
- **Effort:** 14h
- Render form tìm kiếm và view kết quả **hoàn toàn từ config server cung cấp**. Một page component
  phục vụ cho mỗi datasource; chỉ khác nhau ở results renderer theo `type`. Đáp ứng yêu cầu spec (d) và
  spec (a) về sắp xếp và hiển thị tất cả ảnh khớp kèm mốc thời gian.

## Nhận định chính
- **Tự viết dynamic form renderer** (~150-200 dòng field registry qua react-hook-form + zod), không
  dùng rjsf/uniforms/formily (research §A). Config của chúng tôi là danh sách field phẳng ~5 kiểu, không
  có điều kiện phụ thuộc; rjsf nặng 175-244 KB và xung đột styling với shadcn, renderer tự viết chỉ
  ~25-30 KB và nằm trực tiếp trên các primitive `Form` dựa RHF sẵn có của shadcn. Đây là quyết định theo
  KISS/YAGNI.
- **TanStack Table v8 headless** với `ColumnDef[]` build lúc runtime từ `output.fields` — đây đã là lựa
  chọn thân thiện với config-driven; không cần phương án khác.
- **Không có code riêng cho từng API.** Nếu reviewer tìm thấy component nào rẽ nhánh theo mã datasource
  cụ thể (VD `if (code === 'CITIZEN_BASIC')`), coi như giai đoạn này thất bại mục đích của nó.
- Ảnh: `yet-another-react-lightbox` (+ `react-photo-album` cho grid) là lựa chọn chuẩn 2026 vẫn được
  maintain. Bỏ qua virtualization cho đến khi 1 người có >~30 ảnh (research §B).

## Yêu cầu
**Chức năng**
- Bộ chọn datasource chỉ liệt kê datasource được cấp quyền (từ `GET /datasources`).
- Form tìm kiếm sinh ra từ `input.fields`, validate client-side theo đúng rule của config.
- `type: "info"` → timeline các bản ghi gom theo người, cột/nhãn lấy từ `output.fields`, sắp xếp theo
  field timestamp đã cấu hình.
- `type: "image"` → timeline ảnh gom theo người, mỗi ảnh có caption mốc thời gian cập nhật, bấm vào →
  lightbox kèm metadata.
- Phân trang; thông báo rõ ràng khi kết quả bị cắt bớt bởi `maxResults`.
- Các trạng thái rỗng / đang tải / lỗi validation / lỗi upstream tách biệt rõ ràng.

**Phi chức năng:** ảnh chỉ tải qua URL của backend; định dạng `vi-VN`; form và lightbox điều hướng được
bằng bàn phím.

## Kiến trúc
```
apps/web/src/features/query/
├── QueryPage.tsx                  # MỘT page cho mỗi datasource; chọn renderer theo `type`
├── DatasourcePicker.tsx
├── dynamic-form/
│   ├── DynamicSearchForm.tsx      # build form RHF + zod resolver từ input.fields
│   ├── build-zod-schema.ts        # mirror đúng rule InputSchemaBuilder của backend
│   └── field-registry.tsx         # type → component: string|number|date|enum|boolean
├── results/
│   ├── InfoTimeline.tsx           # card theo từng người → danh sách bản ghi theo thời gian
│   ├── InfoRecordTable.tsx        # TanStack Table, ColumnDef runtime từ output.fields
│   ├── PhotoTimeline.tsx          # grid ảnh theo từng người, sắp xếp theo capturedAt
│   ├── PhotoLightbox.tsx
│   ├── TruncationNotice.tsx
│   └── ResultStates.tsx           # rỗng / loading skeleton / lỗi upstream
└── use-query-datasource.ts        # TanStack mutation → POST /query/:code
```

## File code liên quan
**Tạo mới:** tất cả file trên; mở rộng `apps/web/src/lib/format.ts`.
**Sửa:** route tree (Giai đoạn 06), `apps/web/src/components/layout/Sidebar.tsx`.
**Dùng lại (không viết trùng):** `packages/shared/src/datasource-config.types.ts`, `query-envelope.types.ts`.

## Các bước triển khai
1. Cài `@tanstack/react-table`, `yet-another-react-lightbox`, `react-photo-album`.
2. `build-zod-schema.ts`: `ClientDatasource['input']['fields']` → `ZodObject`, mirror đúng rule backend
   (required, min/max, pattern, enum, `atLeastOneOf`). **Validate ở client chỉ để UX** — backend luôn
   validate lại — giữ 2 bộ rule ở 1 nơi có tài liệu rõ để dễ phát hiện lệch nhau.
3. `field-registry.tsx`: map `type` → control shadcn (`Input`, `Input[type=number]`, `DatePicker`,
   `Select` từ `options`, `Checkbox`). Type không nhận diện được → render input text **và log
   warning**, không bao giờ crash trang.
4. `DynamicSearchForm.tsx`: `useForm` với resolver sinh ra, render field theo đúng thứ tự config kèm
   `label` tiếng Việt, hiện dấu `required`, submit → `onSearch(params)`. Có nút reset. Disable nút submit
   khi đang chờ.
5. `use-query-datasource.ts`: TanStack **mutation** (không phải query) gọi `POST /query/:code` — 1 lần
   tra cứu là hành động tường minh, có audit, không được tự động refetch âm thầm.
6. `QueryPage.tsx`: đọc `:code` từ route → gọi `GET /datasources/:code` → render picker +
   `DynamicSearchForm` → khi có kết quả, rẽ nhánh theo `datasource.type` sang `InfoTimeline` hoặc
   `PhotoTimeline`. **Đây là rẽ nhánh theo type DUY NHẤT trong toàn bộ feature.**
7. `InfoRecordTable.tsx`: build `ColumnDef[]` lúc runtime từ `envelope.columns` (label làm header,
   format cell theo type: date/datetime qua `vi-VN`, enum đã được backend map sẵn label).
8. `InfoTimeline.tsx`: gom card theo `groups[]`; header = `group.label`; thân là các bản ghi mới nhất
   trước, field `timestampField` đã cấu hình hiển thị nổi bật ở mỗi dòng (spec a). Tự viết timeline
   bằng CSS border-line, không dùng thư viện timeline (research §B).
9. `PhotoTimeline.tsx`: theo từng người, 1 grid `react-photo-album` sắp xếp theo `capturedAt` giảm dần;
   hiển thị **mọi** ảnh khớp (spec a) kèm caption mốc thời gian; `<img loading="lazy">`; `src` = URL
   thumb của backend, không bao giờ là URL MinIO.
10. `PhotoLightbox.tsx`: ảnh đầy đủ + toàn bộ field metadata không nội bộ; điều hướng bàn phím; đóng
    bằng Esc.
11. `TruncationNotice.tsx`: hiện khi `page.truncated` — *"Kết quả đã được giới hạn ở N bản ghi. Hãy thu
    hẹp điều kiện tra cứu."* (spec g).
12. `ResultStates.tsx`: skeleton khi đang chờ; trạng thái rỗng tách biệt với trạng thái lỗi; 502/504 →
    *"Nguồn dữ liệu tạm thời không phản hồi"*; 422 → lỗi từng field map ngược lại vào form.
13. Điều khiển phân trang gắn với `page`/`pageSize`, tôn trọng giới hạn `pageSize` trong config.
14. Test: form render đúng cho 2 datasource mock có cấu trúc **khác nhau**; validate chặn input sai;
    kết quả info render đúng nhóm và đúng thứ tự; timeline ảnh render đủ ảnh kèm timestamp; thông báo
    truncation hiện đúng; các trạng thái lỗi render đúng. Thêm 1 test xác nhận **không có datasource
    code literal nào** xuất hiện trong source của feature (bảo vệ invariant "không code riêng cho từng
    API").

## Danh sách việc cần làm
- [x] Cài dep table/lightbox (`@tanstack/react-table` pin ở 8.21.3 — bản `latest` resolve ra
      v9.2.4 là bản viết lại dựa trên reactive API không tương thích; `react-photo-album` cài
      rồi gỡ — xem phần Deviations)
- [x] `build-zod-schema.ts` mirror đúng rule backend
- [x] `field-registry.tsx` (5 kiểu + fallback an toàn cho kiểu không nhận diện)
- [x] `DynamicSearchForm.tsx` (đặt tên `dynamic-search-form.tsx`, kebab-case theo quy ước dự án)
- [x] `use-query-datasource.ts` (mutation, không tự refetch)
- [x] `QueryPage.tsx` với rẽ nhánh `type` duy nhất (đặt tên `query-page.tsx`)
- [x] `InfoRecordTable.tsx` (ColumnDef runtime, render dạng danh sách timeline CSS, không phải `<table>`)
- [x] `InfoTimeline.tsx` (gom nhóm, timestamp cấu hình nổi bật)
- [x] `PhotoTimeline.tsx` (đủ ảnh + timestamp, lazy load qua IntersectionObserver)
- [x] `PhotoLightbox.tsx` + metadata
- [x] `TruncationNotice` + `ResultStates` (rỗng/loading/422/502/504/429)
- [x] Phân trang gắn với giới hạn config (`query-pagination.tsx`)
- [x] Test gồm 2 datasource khác cấu trúc + assertion không hardcode code (33 test, đều pass)

## Tiêu chí hoàn thành
- 2 datasource thông tin có cấu trúc khác nhau render ra 2 form và bảng đúng mà **không** khác gì ở code.
- Thêm datasource thứ 4 vào `config.json` (Phase 04) làm hiện ra 1 trang tìm kiếm hoạt động đầy đủ sau
  khi restart — minh chứng end-to-end cho kiến trúc config-driven.
- Tra cứu ảnh theo CCCD hiển thị **mọi** ảnh khớp kèm mốc thời gian cập nhật, theo đúng thứ tự thời gian
  (spec a).
- Sắp xếp theo `timestampField`/`sortOrder` lấy từ config — đổi config, thứ tự đổi theo, không cần rebuild.
- Không có URL MinIO hay credential upstream nào lộ ra trong response mạng (kiểm tra devtools).
- Grep `features/query/` không tìm thấy mã datasource hardcode nào.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| **Field API thật cần loại widget chưa có** (object lồng nhau, multi-select, range) | Field registry được thiết kế mở rộng được; type chưa biết degrade an toàn thay vì crash. Thêm type mới khi có doc thật — không đoán trước. |
| Rule validate client/server lệch nhau | Cả 2 cùng bắt nguồn từ 1 config; rule ghi chú song song; backend là nguồn quyết định, lỗi 422 của nó map ngược vào field trên form. |
| Renderer tự viết phình to thành 1 bản rjsf làm lại dở | Có giới hạn cứng: nếu config cần điều kiện/phụ thuộc, xem lại quyết định dùng thư viện thay vì phình renderer tự viết. Đây là điều kiện kích hoạt đã ghi rõ, không phải ý định mơ hồ. |
| Nhiều ảnh/người → trang chậm | Hiện tại lazy loading; virtualization (`@tanstack/react-virtual`) chỉ khi đo đạc thấy cần (research §B). |
| Gom nhóm timeline sai khi dữ liệu thật thiếu `identityField` | Mapper fallback về 1 nhóm/bản ghi; UI phải render hợp lý trường hợp này (có test). |

## Cân nhắc bảo mật
- `src` của ảnh luôn trỏ về backend của mình; FE không bao giờ biết hostname của MinIO.
- Dữ liệu kết quả không lưu phía client (không cache bản ghi công dân vào localStorage); cache của
  TanStack Query chỉ ở bộ nhớ và bị xóa khi đăng xuất.
- Không dùng `dangerouslySetInnerHTML` ở đâu cả — dữ liệu từ upstream không tin cậy, chỉ render dạng text.
- Tắt autofill trình duyệt cho field CCCD; tránh đặt tham số tra cứu trên URL (sẽ lưu vào history trình
  duyệt và log truy cập server) — chỉ dùng POST body.
- Lỗi 403 từ backend với 1 tính năng đang ẩn là điều dự kiến, cần xử lý mượt mà, không coi là bug.

## Bước tiếp theo
Mở khóa Giai đoạn 09 (hardening end-to-end). Song song với Giai đoạn 08.

## Câu hỏi chưa giải quyết
- "Vài trường cơ bản" của 1 bản ghi công dân — chưa biết cụ thể, bộ cột bảng hiện lấy theo mock (giống
  câu hỏi treo ở Phase 04).
- User có được export kết quả tra cứu không (CSV/in)? Không có trong spec — **hỏi Egor**, vì có ảnh
  hưởng thật đến quản trị dữ liệu.
- Số ảnh kỳ vọng mỗi người (quyết định có cần virtualization hay không).
- Có yêu cầu watermark hay hạn chế tải ảnh xuống không? Không có trong spec; nên hỏi vì làm bây giờ rẻ,
  làm sau đắt hơn.
- **`ClientDatasource` chưa có marker chính thức cho "field nào là record id của từng ảnh".** Image
  proxy cần 1 id ổn định cho từng ảnh (`GET /query/:code/image/:recordId`), tín hiệu duy nhất phía
  client hiện nay chỉ là quy ước đặt tên — config `CITIZEN_PHOTO` hiện tại tình cờ đặt tên field đó là
  `recordId`. `PhotoTimeline`/`PhotoLightbox` đọc `record.recordId` theo đúng quy ước này (đã ghi chú
  trong `photo-timeline.tsx`), không rẽ nhánh theo từng mã datasource, nhưng đây VẪN LÀ 1 hợp đồng ngầm:
  1 datasource `type: "image"` tương lai mà người viết config đặt tên field khác (VD `photoId`) sẽ âm
  thầm không hiện ảnh nào. Sửa đúng cách cần thay đổi ở backend/shared-types (VD
  `ClientDatasource.output.imageRecordIdField`) — nằm ngoài phạm vi file sở hữu của Phase 07
  (`apps/api`, `packages/shared` `DatasourceRegistryService`) — cần người phụ trách Phase 04/05 hoặc 1
  phase tiếp theo xử lý.

## Sai khác so với kế hoạch ban đầu (Giai đoạn 07)
- **`@tanstack/react-table`**: bản `latest` trên npm resolve ra `9.2.4`, một bản viết lại dựa trên
  reactive-signals với API khác hẳn (`useReactTable`/`getCoreRowModel` đổi tên/vị trí). Đã pin về
  `8.21.3` (bản stable cuối của v8, khớp đúng API headless `ColumnDef`/`useReactTable` mà research doc
  và plan này giả định) thay vì vật lộn với 1 API thử nghiệm lạ dưới áp lực thời gian.
- **`react-photo-album` cài rồi gỡ.** Thuật toán layout row/column của thư viện này cần `width`/`height`
  thật của ảnh để canh dòng; cả mock lẫn dữ liệu ảnh upstream thật đều không có kích thước ảnh, nên mỗi
  ảnh sẽ phải đoán tỉ lệ khung hình giả — làm mất hết giá trị thực sự của thư viện trong khi vẫn phải
  tích hợp custom-render lạ (vốn dĩ vẫn cần, để đáp ứng yêu cầu fetch có xác thực). Thay bằng 1 CSS grid
  responsive đơn giản (Tailwind `grid-cols-*`) chứa thumbnail `LazyAuthorizedImage` — vẫn lazy-load qua
  `IntersectionObserver`, vẫn không lộ URL MinIO/URL trực tiếp. Vẫn giữ `yet-another-react-lightbox`
  (modal điều hướng bàn phím/a11y của nó thực sự không đáng tự viết lại).
- **`InfoRecordTable.tsx`** dùng bộ máy headless `ColumnDef[]`/`useReactTable` của TanStack Table để
  truy cập cell có kiểu, theo config, nhưng render các dòng dạng danh sách dọc CSS border-line (không
  phải `<table>` theo nghĩa đen) nên nó kiêm luôn vai trò "timeline tự viết" mà plan cũng yêu cầu
  (research §B) — 1 component đáp ứng cả 2 việc thay vì phải viết 2 cái.
- `apps/web/src/lib/api-client.ts` (file của Giai đoạn 06) có 2 thay đổi nhỏ dạng **bổ sung** cần cho
  Giai đoạn 07: `ApiError.details` (lỗi 422 theo từng field) và `apiFetchImageBlob` (fetch ảnh có xác
  thực cho `<img>`, vì `<img src>` thường không mang được Bearer token đang giữ trong bộ nhớ). Không đổi
  hành vi export nào đã có.
- `apps/web/src/i18n/vi.ts` (file Giai đoạn 06) có thêm 1 mục `query: {...}` dạng bổ sung; không đụng
  key nào đã có.

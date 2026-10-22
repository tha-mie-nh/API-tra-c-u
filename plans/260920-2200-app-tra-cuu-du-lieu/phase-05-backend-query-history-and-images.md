# Giai đoạn 05 — Query, History & Image-Serving Endpoints

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-api-specification.md](reference-api-specification.md) · [reference-config-schema.md](reference-config-schema.md)
- [research/researcher-02-config-driven-ui-and-minio-images.md](research/researcher-02-config-driven-ui-and-minio-images.md) (§C image serving)
- Phụ thuộc vào Giai đoạn 03 (guard) + Giai đoạn 04 (registry)

## Tổng quan
- **Priority:** P1
- **Status:** completed
- **Effort:** 12h
- Kết nối datasource engine tới HTTP: generic query endpoint, image proxy, và lookup-history
  API. Covers spec (d) tra cứu, (e) lưu lịch sử, (f) xem lịch sử, và (g) result-limit rule.

## Nhận định chính
- **Ảnh được proxy, không dùng presigned URL** (research §C). Presigned URL là bearer token có thể chia
  sẻ được, không revoke được giữa TTL, và bypass RBAC + audit theo từng request. Proxy re-check quyền ở
  mỗi lần fetch ảnh và vẫn cache tốt qua `ETag`/`Cache-Control: private`.
- **History được ghi cho mọi outcome** — thành công, upstream thất bại, *và* bị từ chối quyền. Trường
  hợp bị từ chối chính là sự kiện mà reviewer bảo mật sẽ hỏi đến.
- **`view_own` được ép ở server bằng filter ghi đè**, không tin `userId` client gửi lên. Đây là chỗ dễ
  xảy ra lỗ hổng leo thang quyền theo chiều ngang nhất.
- Query endpoint là **một handler generic duy nhất** cho mọi datasource; quyền nó yêu cầu *suy ra từ
  path param `:code`*. Datasource mới thêm vào config được bảo vệ tự động — không ai có thể quên gắn
  guard cho nó.

## Yêu cầu
**Chức năng**
- `POST /query/:code`: validate params theo Zod schema build từ config → chạy adapter → map sang
  envelope → ghi log → trả kết quả.
- Ép giới hạn `limits.pageSize` / `limits.maxResults`; đánh dấu `page.truncated` (spec g).
- `GET /datasources` trả về chỉ những datasource được cấp quyền theo client projection (là cơ sở để FE
  ẩn tính năng, spec c).
- `GET /query/:code/image/:recordId` (+ `/thumb`) stream ảnh, quyền được re-check.
- `GET /history` + `/history/:id` với filter user/API/thời gian/trạng thái (spec f), giới hạn theo quyền.

**Phi chức năng:** giới hạn tốc độ theo từng user cho query; tôn trọng timeout upstream; `X-Request-Id`
ở mọi response và mọi dòng log.

## Kiến trúc
```
apps/api/src/
├── datasources/datasources.controller.ts   # GET /datasources, GET /datasources/:code
├── query/
│   ├── query.controller.ts                 # POST /query/:code, GET image, GET thumb
│   ├── query.service.ts                    # điều phối: validate → adapter → map → log
│   ├── image-proxy.service.ts              # stream getObject từ MinIO + ETag/range
│   └── datasource-permission.guard.ts      # suy ra api:<code> từ param :code
└── history/
    ├── history.controller.ts               # GET /history, /history/:id
    ├── history.service.ts                  # filter theo phạm vi quyền
    └── query-log.service.ts                # nơi ghi duy nhất cho query_logs
```
Luồng: `JwtAuthGuard` → `DatasourcePermissionGuard(:code)` → `QueryService` → adapter → mapper →
`QueryLogService.record()` → trả envelope. Việc ghi log xảy ra trong `finally`, nên cả trường hợp lỗi
cũng được ghi lại.

## File code liên quan
**Tạo mới:** tất cả file trên + dto/zod schema; `packages/shared/src/history-types.ts`;
test `apps/api/test/query.e2e-spec.ts`, `apps/api/test/history-scoping.e2e-spec.ts`, `apps/api/test/image-proxy.e2e-spec.ts`.
**Sửa:** `apps/api/src/app.module.ts`, `packages/shared/src/query-envelope.types.ts` (từ Giai đoạn 04).

## Các bước triển khai
1. `DatasourcePermissionGuard`: đọc `:code` → tra datasource trong registry (404 nếu không tồn tại/bị
   tắt) → yêu cầu `api:<code>` trong tập quyền của người gọi → nếu bị từ chối, **ghi 1 dòng `query_logs`
   với `status='denied'`** trước khi throw lỗi 403.
2. `DatasourcesController`: `GET /datasources` → `registry.getForUser(perms).map(toClientProjection)`.
   `GET /datasources/:code` dùng cùng guard.
3. `QueryService.execute(user, code, params, paging)`:
   a. ép `pageSize` về đúng `limits.pageSize`, `page` ≥ 1;
   b. validate `params` bằng Zod schema đã cache → lỗi 422 `VALIDATION_ERROR` kèm thông báo từng field;
   c. `adapter.execute(...)` bên trong 1 bộ đếm thời gian;
   d. `ResponseMapper` → envelope (gom nhóm/sắp xếp/giới hạn);
   e. luôn ghi lại dòng log (thành công/thất bại) kèm thời lượng, số bản ghi, request id upstream;
   f. dịch lỗi adapter → `UPSTREAM_ERROR` 502 / `UPSTREAM_TIMEOUT` 504, không lộ chi tiết nội bộ.
4. `QueryLogService.record()` — nơi **duy nhất** ghi vào `query_logs`. Dựng `query_summary` (dễ đọc
   cho người, VD `"Họ tên=Nguyễn Văn A; Ngày sinh=1990-01-01"`) và mask giá trị các field đánh dấu
   `sensitive` trong config. Lỗi khi ghi log không bao giờ được làm fail request của user (ghi lỗi, rồi
   tiếp tục).
5. Giới hạn tốc độ query theo từng user qua `@nestjs/throttler` dùng key là user-id (bảo vệ API upstream
   khỏi 1 client chạy quá đà).
6. `ImageProxyService`: với `code` + `recordId`, chạy lại bước tra metadata của image adapter để resolve
   `{bucket, objectKey, mimeType}` — **không bao giờ nhận bucket/objectKey từ client** (sẽ là lỗ hổng
   object-traversal). Sau đó `minioClient.getObject()` và pipe về response kèm `Content-Type`,
   `Cache-Control: private, max-age=300`, và `ETag` lấy từ etag của object; tôn trọng `If-None-Match` →
   304.
7. Route thumbnail: ban đầu trả nguyên bytes gốc (research §C: không xây thumbnail khi chưa cần). Chừa
   1 điểm nối duy nhất trong `ImageProxyService` để sau này thêm resize+cache theo nhu cầu nếu đo đạc
   thấy cần thiết.
8. `HistoryService.list(user, filters)`: nếu người gọi không có `history:view_all`, **ép
   `userId = caller.id`**, bỏ qua mọi `userId` client gửi lên. Nếu không thì cần `history:view_own`,
   không thì 403. Filter: `datasourceCode`, `from`/`to`, `status`. Phân trang kiểu keyset hoặc offset
   (offset là đủ ở quy mô này), mới nhất trước.
9. `HistoryService.get(id)`: cùng nguyên tắc giới hạn quyền — người chỉ có `view_own` mà lấy log id của
   người khác sẽ nhận **404, không phải 403** (không xác nhận sự tồn tại).
10. Middleware `X-Request-Id`: nhận id đầu vào hoặc tự sinh; gắn vào log và vào envelope lỗi.
11. Test e2e (Postgres + MinIO thật, **không mock hạ tầng**):
    - luồng query bình thường trả về timeline đã gom nhóm; cờ `truncated` bật khi vượt `maxResults`;
    - lỗi validate theo từng field;
    - user không có `api:x` nhận 403 **và** có 1 dòng `denied` xuất hiện trong `query_logs`;
    - upstream timeout (qua chế độ chậm của mock adapter) → 504 + dòng log `failed`;
    - user `view_own` không thể xem lịch sử của người khác kể cả khi truyền `?userId=`;
    - route ảnh trả 403 khi không có quyền; trả 304 khi `If-None-Match`; không bao giờ lộ URL MinIO.

## Danh sách việc cần làm
- [x] `DatasourcePermissionGuard` (quyền suy từ code + ghi log khi bị từ chối)
- [x] `GET /datasources` + `/datasources/:code` (client projection) — đã có sẵn từ Giai đoạn 04, dùng lại nguyên trạng
- [x] Điều phối `QueryService` (ép giới hạn → validate → chạy → map → log)
- [x] Dịch lỗi (422 / 502 / 504) không lộ thông tin nội bộ
- [x] `QueryLogService` ghi duy nhất + mask field nhạy cảm + tóm tắt
- [x] Giới hạn tốc độ query theo từng user
- [x] `ImageProxyService` (object key resolve ở server, stream, ETag/304)
- [x] Route thumbnail (tạm thời passthrough, đã chừa điểm nối)
- [x] `HistoryService` list/detail ép giới hạn theo phạm vi của chính mình
- [x] Middleware `X-Request-Id`
- [x] Test e2e gồm cả case leo thang quyền theo chiều ngang

## Tiêu chí hoàn thành
- Một handler generic phục vụ mọi datasource; thêm datasource trong config không cần **đổi route**.
- Kết quả trả về gom theo người và sắp xếp theo field timestamp **đã cấu hình** (spec a) — chứng minh
  bằng cách đổi `timestampField` trong config và quan sát thứ tự đổi theo.
- `maxResults` được ép và `truncated` được hiển thị (spec g).
- Mỗi lần tra cứu — thành công, thất bại, bị từ chối — đều tạo đúng 1 dòng `query_logs` với đủ field
  theo spec (e).
- Chứng minh được user `view_own` không thể đọc lịch sử của người khác (có test).
- Bytes ảnh đến trình duyệt mà không có hostname hay credential MinIO nào lộ ra trong response.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| **Leo thang quyền theo chiều ngang trong history** | Ép filter phía server + test e2e riêng. Không bao giờ suy phạm vi từ param của request. |
| Object key client tự gửi → đọc tùy ý object MinIO | Object key luôn được resolve lại ở server từ `recordId`; client không bao giờ tự đặt tên bucket/key. |
| Upstream chậm làm cạn event loop Node / connection pool | Timeout theo từng datasource, retry có giới hạn, rate limit theo user, giới hạn pool của `undici`. |
| Lỗi khi ghi log làm hỏng tra cứu | Ghi log là best-effort trong `finally`, bọc trong try/catch. |
| Tập kết quả lớn làm tràn bộ nhớ | Ép `maxResults` áp dụng **trước** khi mapping, không phải sau. |
| Độ ổn định của `recordId` cho ảnh | Mock data phải sinh id xác định; cần xác nhận image DB thật có row id ổn định (câu hỏi còn treo). |

## Cân nhắc bảo mật
- Quyền được re-check ở **mỗi** request ảnh, không chỉ lúc search tạo URL.
- Response ảnh: `Cache-Control: private` (không bao giờ `public`) để proxy dùng chung không cache nhầm
  ảnh của user khác.
- `query_logs.query_params` lưu giá trị đã mask cho field `sensitive`; CCCD đầy đủ không bị tích lũy
  trong DB.
- Credential upstream không bao giờ xuất hiện trong log, lỗi, hay response — có test khẳng định điều
  này bằng cách grep payload lỗi.
- Rate limiting bảo vệ cả service của mình lẫn nhà cung cấp upstream.
- Sự kiện bị từ chối được ghi lại phục vụ review bảo mật (spec e/g).

## Bước tiếp theo
Mở khóa Giai đoạn 07 (FE query + timeline) và Giai đoạn 08 (FE history).

## Câu hỏi chưa giải quyết
- ~~Image DB thật có expose id ổn định cho từng ảnh để dùng làm `recordId` không?~~ **Đã giải quyết lúc
  triển khai:** bảng `citizen_photos` mock đã có sẵn PK `id` dạng UUID. Đã thêm `transport.recordQuery`
  (trong config.json, field bổ sung/tùy chọn, tương thích ngược) để image proxy resolve lại
  `{bucket, objectKey, mimeType}` qua 1 truy vấn tham số hóa theo `recordId` — không bao giờ nhận
  bucket/key từ client. Entry `CITIZEN_PHOTO` trong config.json giờ expose thêm field output không nội
  bộ tên `recordId` (lấy từ `id`) để client địa chỉ hóa được 1 ảnh cụ thể. Khi gắn image DB thật vào,
  chỉ cần DB đó có cột id ổn định riêng + 1 `recordQuery`.
- Số ảnh kỳ vọng mỗi người (quyết định có cần virtualization/thumbnail hay không) — research §B nói bỏ
  qua cho đến khi >~30.
- History có cần export CSV không? Không có trong spec; chỉ làm khi được yêu cầu.
- Chính sách retention/purge cho `query_logs` (cũng đang treo ở Phase 02).
- ~~**Bug validate sai do `@UsePipes()` ở method-level cộng với `@Param()`/`@CurrentUser()`**~~ **Đã fix
  (2026-09-21):** đổi `users.controller.ts` (`create`, `update`, `setRoles`), `roles.controller.ts`
  (`update`, `setPermissions`), và `auth.controller.ts` (`changePassword`, `login`) sang pipe gắn theo
  tham số (`@Body(new ZodValidationPipe(schema)) body: Dto`), khớp với cách `QueryController`/
  `HistoryController` đã làm. Đồng thời xóa 1 file build artifact bị commit nhầm
  (`apps/api/prisma/seed.js`) khiến `pnpm run lint` ở root fail. Đã verify bằng 1 e2e spec tạm gọi cả 6
  endpoint từng bị lỗi qua HTTP thật (đều trả 200/201, đã xóa file test sau khi chạy) + chạy đầy đủ
  `pnpm run test:e2e` (vẫn 36/36 pass) + `pnpm run lint`/`typecheck`/`build` sạch.

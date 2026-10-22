# Giai đoạn 04 — Config-Driven Datasource Engine + Mock Upstream APIs

## Liên kết ngữ cảnh
- [plan.md](plan.md) · **[reference-config-schema.md](reference-config-schema.md)** (hợp đồng mà giai đoạn này hiện thực)
- [research/researcher-01-backend-stack-and-rbac.md](research/researcher-01-backend-stack-and-rbac.md) (§1 validate động, §5 http client, §6 minio SDK)

## Tổng quan
- **Priority:** P1 — **đây là trái tim kiến trúc của dự án**
- **Status:** completed
- **Effort:** 14h
- Xây dựng config loader + validator, lớp validate input động, adapter registry, và
  mock implementation cho 3 API thông tin + 1 nguồn ảnh. Hiện thực spec (g) *"Các trường đầu vào,
  đầu ra của API được cấu hình riêng trong file config.json độc lập"* và (h) *"Cách tích hợp các API,
  có khả năng scale lên khi bổ sung API config"*.

## Nhận định chính
- **Doc API thật chưa tồn tại.** Mọi thứ ở đây được xây trên mock mô phỏng hình dạng dữ liệu mà
  Egor mô tả bằng lời. Đó không phải là giải pháp tạm — đó chính là mục đích: nếu abstraction đúng, đổi
  từ mock sang thật chỉ là sửa config.
- `config.json` là một **DSL phẳng tự định nghĩa**, không phải JSON Schema thô (giải đáp câu hỏi còn mở
  của researcher-01): nó phải mang được metadata UI (`label`, `options`) và mapping output (`from`,
  `valueMap`, `timestampField`) mà JSON Schema không diễn đạt được. Vì vậy: **AJV validate chính hình
  dạng của file config** (theo `config/config.schema.json`), và 1 builder nhỏ **build `input.fields` của
  mỗi datasource thành Zod schema lúc load** để validate query của user. Build 1 lần lúc boot, không
  phải mỗi request.
- **2 trục adapter tách biệt, không lẫn lộn:** `type` (`info`|`image`) quyết định *hình dạng response và
  renderer UI*; `transport.kind` (`http`|`mock`|`minio-pg`) quyết định *cách lấy dữ liệu*. API thông tin
  thật là `type:info, kind:http`; bản tạm hiện tại là `type:info, kind:mock`.
- **Sync permission lúc boot**: khi khởi động, mỗi `datasource.permissionCode` được upsert vào bảng
  `permissions` (kind `API`). Datasource bị tắt/xóa chỉ được đánh dấu, không bao giờ xóa cứng (sẽ làm
  mồ côi `role_permissions` và mất ý nghĩa audit).
- Fail fast: `config.json` sai ⇒ **tiến trình từ chối khởi động**. Lỗi gõ nhầm trong config không được
  phép trở thành lỗi 500 mà user phát hiện ra giữa lúc tra cứu.

## Yêu cầu
**Chức năng**
- Load + validate `config.json` từ `APP_CONFIG_PATH` lúc boot; expose ra 1 registry có kiểu, truy vấn được.
- Resolve tham chiếu `${ENV_VAR}` và field credential `*Env` từ `process.env` — không bao giờ lưu secret trong file.
- Build Zod validator cho từng datasource từ `input.fields` (kiểu, required, min/max, pattern, enum options, `atLeastOneOf`).
- Map response upstream → envelope thống nhất: `recordsPath` → mảng, `from` → đổi tên field, `valueMap` → nhãn, gom nhóm theo `identityField`, sắp xếp theo `timestampField`/`sortOrder`, giới hạn ở `limits.maxResults`.
- Adapter mock trả về **dữ liệu dạng timeline** (1 người → nhiều bản ghi/ảnh ở nhiều mốc thời gian khác nhau).
- Client projection: loại bỏ field `transport` và `internal`.

**Phi chức năng:** timeout + retry giới hạn theo từng datasource; lỗi upstream hiện ra dạng
`UPSTREAM_ERROR`/`UPSTREAM_TIMEOUT`, không bao giờ lộ stack trace thô.

## Kiến trúc
```
apps/api/src/datasources/
├── datasource-config.loader.ts      # đọc file, validate AJV, resolve tham chiếu env, freeze
├── datasource-registry.service.ts   # code → {config, inputSchema(Zod), adapter}
├── input-schema.builder.ts          # input.fields[] → ZodObject (+ refine atLeastOneOf)
├── response-mapper.service.ts       # JSON upstream → envelope thống nhất (map/group/sort/cap)
├── permission-sync.service.ts       # lúc boot: upsert quyền api:*
└── adapters/
    ├── datasource-adapter.interface.ts   # execute(params, paging) → RawRecord[]
    ├── http-info.adapter.ts              # kind: http   (cho API THẬT, sau này)
    ├── mock-info.adapter.ts              # kind: mock   (hiện tại)
    ├── minio-pg-image.adapter.ts         # kind: minio-pg
    └── adapter.factory.ts                # transport.kind → instance adapter
config/
├── config.json          # 3 datasource thông tin (mock) + 1 datasource ảnh
├── config.schema.json   # schema AJV cho file trên
└── mock-data/           # công dân giả + metadata ảnh đã seed
```

## File code liên quan
**Tạo mới:** tất cả file trên; `packages/shared/src/datasource-config.types.ts` (type DSL, dùng chung với FE),
`packages/shared/src/query-envelope.types.ts`; `scripts/seed-minio-mock-images.ts`;
test `apps/api/test/datasource-engine.spec.ts`, `apps/api/test/response-mapper.spec.ts`.
**Sửa:** `apps/api/src/app.module.ts`, `config/config.schema.json` (placeholder từ Giai đoạn 01), `.env.example`.

## Các bước triển khai
1. Cài `ajv`, `ajv-formats`, `zod`, `undici`, `minio`, `pg`.
2. Viết `config/config.schema.json` — JSON Schema cho DSL đã mô tả ở `reference-config-schema.md`. Ép buộc: `code` không trùng nhau, enum `type`, enum `transport.kind`, bắt buộc `output.timestampField`, bắt buộc `identityField`, và mọi tên field mà `timestampField`/`identityField` tham chiếu phải thực sự tồn tại trong `output.fields[].name`.
3. `DatasourceConfigLoader`: đọc `APP_CONFIG_PATH` → parse → validate AJV → **nếu lỗi, log từng lỗi AJV rồi throw để app thoát** → resolve placeholder `${ENV}` và tên `*Env`, báo lỗi to nếu biến env được tham chiếu mà không tồn tại → deep-freeze.
4. `packages/shared/src/datasource-config.types.ts`: type TS cho DSL, cộng thêm type `ClientDatasource` = phiên bản đã lược bỏ. Frontend import trực tiếp các type này (đây là lợi ích của monorepo).
5. `InputSchemaBuilder`: `field.type` → kiểu Zod cơ bản (`string`/`number`/`date`(coerce)/`enum(options)`/`boolean`), áp `required`/`minLength`/`maxLength`/`min`/`max`/`pattern`, rồi `.superRefine` cho `atLeastOneOf`. Trả về `ZodObject` **build 1 lần lúc boot**, cache trong registry.
6. `DatasourceRegistryService`: `getAll()`, `get(code)`, `getForUser(permissionSet)` (dùng bởi `GET /datasources`), `toClientProjection(ds)` (bỏ field `transport` + `internal`).
7. Interface `DatasourceAdapter`: `execute(params: Record<string,unknown>, paging): Promise<{records: unknown[]; total?: number; requestId?: string}>`. Cố tình mỏng và đơn giản.
8. `HttpInfoAdapter`: dựng request từ `transport` (`method`, `path`, header auth từ env đã resolve), body/query key theo `mapTo` của từng field. Dùng `undici` với `AbortSignal.timeout(timeoutMs)`; retry `attempts` lần khi lỗi mạng/5xx/429 kèm backoff; **không bao giờ retry lỗi 4xx**. Trích `recordsPath`/`totalPath`/`requestIdPath`.
9. `MockInfoAdapter`: đọc `config/mock-data/*.json`, lọc theo tham số truyền vào, trả về **nhiều bản ghi mỗi người ở nhiều mốc thời gian khác nhau** để luồng timeline thực sự được kiểm chứng. Có chế độ inject lỗi/chậm (VD 1 giá trị input đặc biệt) để phát triển và test được trạng thái UI lỗi/timeout.
10. `MinioPgImageAdapter`: kết nối tới `pgUrlEnv` bằng `pg`, chạy `transport.query` có tham số hóa (**tham số hóa — không bao giờ nối chuỗi**), map các row qua `output.imageRef` thành `{bucket, objectKey, mimeType, capturedAt}`. **Không** tải bytes — endpoint của Phase 05 mới stream chúng.
11. `scripts/seed-minio-mock-images.ts`: tạo bucket, upload ảnh mẫu, chèn row tương ứng vào bảng mock `citizen_photos` để luồng ảnh chạy được end-to-end ở local.
12. `ResponseMapperService`: đổi tên qua `from`, áp `valueMap`, ép kiểu, **gom nhóm theo `identityField`**, sắp xếp bản ghi từng nhóm theo `timestampField` theo `sortOrder`, áp `limits.maxResults` và set `page.truncated`, loại field `internal` khỏi payload trả về client.
13. `PermissionSyncService` (`OnModuleInit`): upsert quyền `api:*` từ config; log cảnh báo cho quyền nào trong DB mà datasource tương ứng đã biến mất khỏi config.
14. Unit test: config loader từ chối config sai (thiếu `timestampField`, trùng code, tham chiếu env không tồn tại); input builder chấp nhận/từ chối đúng theo rule; mapper gom nhóm + sắp xếp + giới hạn đúng; adapter tôn trọng timeout/retry. Cộng thêm 1 test **"thêm datasource thứ 4 chỉ bằng config"** đăng ký 1 datasource mock mới và khẳng định query được ngay mà không sửa code — đây là acceptance test thật sự của giai đoạn này.

## Danh sách việc cần làm
- [x] Cài ajv/zod/undici/minio/pg
- [x] Viết `config/config.schema.json` (đầy đủ DSL + ràng buộc chéo field)
- [x] `DatasourceConfigLoader` kèm fail-fast + resolve env
- [x] Type DSL + envelope dùng chung trong `packages/shared`
- [x] `InputSchemaBuilder` (fields → Zod, cache lúc boot)
- [x] `DatasourceRegistryService` + client projection
- [x] Interface adapter + factory
- [x] `HttpInfoAdapter` (timeout, retry giới hạn, trích path) — chỉ scaffold, chưa datasource nào bật dùng đến (chưa có doc API thật, theo plan)
- [x] `MockInfoAdapter` kèm dữ liệu timeline + inject lỗi/chậm
- [x] `MinioPgImageAdapter` (SQL tham số hóa, chỉ metadata) — implement thật với MinIO + Postgres local (kho ảnh của chính mình, không phải mock bên thứ 3)
- [x] Script seed MinIO + image-DB mock (`scripts/seed-minio-mock-images.ts`, script `apps/api` là `seed:mock-images`)
- [x] `ResponseMapperService` (map / group / sort / cap / redact)
- [x] `PermissionSyncService` lúc boot
- [x] `config/config.json` với 3 datasource thông tin mock + 1 datasource ảnh
- [x] Unit test gồm "datasource mới chỉ qua config" (`apps/api/test/datasource-engine.e2e-spec.ts`)
- [x] Controller `GET /datasources` + `GET /datasources/:code` (client projection, lọc theo quyền) — đã verify thật qua curl

## Tiêu chí hoàn thành
- App từ chối boot khi `config.json` sai, in ra lỗi AJV có thể hành động được.
- Thêm datasource thứ 4 vào `config.json` + restart làm nó query được và gán quyền được — **không sửa
  code, không migration**. Chứng minh bằng test tự động.
- Query thông tin mock trả về timeline đã gom nhóm, sắp xếp theo timestamp với nhiều bản ghi mỗi người.
- Adapter ảnh trả về metadata ảnh; object đã seed tồn tại trong MinIO.
- Không có giá trị secret nào xuất hiện ở bất kỳ đâu trong `config.json`; xóa biến env bắt buộc làm fail
  lúc boot, không phải lúc query.
- Unit test xanh hết; `pnpm typecheck` sạch.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| **Response API thật không khớp mapping `recordsPath` + `from` phẳng** (object lồng nhau, field tính toán) | Đã ghi rõ lối thoát: module `transform` tùy chọn theo từng datasource, resolve theo `code`. **Chưa build ngay bây giờ** (YAGNI) — nhưng giữ điểm nối của mapper sạch để có thể lắp vào sau. |
| 3 API thông tin thật khác nhau nhiều hơn giả định ("mỗi API 1 input/output khác nhau") | Chính vì vậy input/output là config theo từng datasource, không phải 1 hình dạng chung toàn cục. Build 3 mock với bộ field **cố tình khác nhau** để chứng minh tính generic thay vì vô tình hardcode theo 1 hình dạng. |
| Schema image DB thật khác với `citizen_photos` giả định | `transport.query` là config, nên bản thân câu SQL thay được mà không cần sửa code. |
| DSL phình to thành 1 ngôn ngữ lập trình | Quy tắc cứng: không điều kiện, không biểu thức, không scripting trong config. Nếu mapping cần logic, nó thuộc về module `transform`. |
| Độ phức tạp khi reload config | Chỉ load lúc boot; restart để áp dụng. Không hot reload (YAGNI) — restart container chỉ mất vài giây. |

## Cân nhắc bảo mật
- Secret **chỉ** đi qua tên biến env `*Env`; `config.json` an toàn để commit và mount như ConfigMap.
- Client projection là **whitelist**, không phải blacklist — dựng object trả về client từ danh sách
  field được đặt tên rõ ràng nên sub-key `transport` tương lai không thể vô tình bị lộ.
- `transport.query` chỉ được thực thi với tham số ràng buộc. Text câu query đến từ file do ops kiểm
  soát, nhưng input của user không bao giờ chạm vào nó dưới dạng chuỗi.
- Lỗi upstream được map thành mã lỗi generic; URL, credential và body upstream không bao giờ tới client.
- SSRF: giá trị `baseUrl` đến từ config/env (do ops kiểm soát), không bao giờ từ input của user.
- Adapter mock phải không thể bật được ở production: từ chối khởi động nếu `NODE_ENV=production` và có
  bất kỳ datasource đang bật nào có `transport.kind === 'mock'`, trừ khi `ALLOW_MOCK_DATASOURCES=true`
  được set tường minh.

## Bước tiếp theo
Mở khóa Giai đoạn 05 (endpoint query dùng registry) và Giai đoạn 07 (FE render từ client projection).
Chạy song song với Giai đoạn 03.

## Câu hỏi chưa giải quyết
- **Khi nào Egor gửi doc 3 API thật?** Hạng mục còn treo ảnh hưởng lớn nhất dự án.
- Với mỗi API thông tin thật: tên/kiểu field input chính xác và envelope response chính xác + field nào là timestamp cho timeline.
- "Vài trường cơ bản" của bản ghi công dân là gì? (Cần để làm mock thực tế hơn và thiết kế bảng kết quả.)
- API thông tin có tự phân trang không, hay backend phải tự cắt? Đang giả định backend tự cắt; nếu API tự phân trang thì DSL cần thêm khối `paging`.
- Image DB thật: connection string, tên bảng/cột, 1 CCCD có map tới nhiều ảnh không (đang giả định có).

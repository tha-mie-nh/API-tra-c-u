# Giai đoạn Research: Frontend Config-Driven UI + MinIO Image Serving + Auth Storage

Context: internal data-lookup app, React+TS, ~50 users, backend serves `config.json` per upstream API describing input fields; results include timeline của records/photos từ MinIO.

---

## A. Form động + bảng kết quả theo config-driven

### Libraries được đánh giá (2026 state)

| Lib | Version (2026) | Bundle (gzip, min) | Notes |
|---|---|---|---|
| `@rjsf/core` + `@rjsf/validator-ajv8` | v6.x (rjsf 6.8.0 cho `@rjsf/shadcn` theme) | ~175KB alone; ~232KB nếu MUI đã có trong app | JSON Schema driven, mature, có `@rjsf/shadcn` theme (new, kể từ 2026) và `@rjsf/mui`. Escape hatch thông qua custom `widgets`/`fields`. [npmjs.com/package/@rjsf/shadcn](https://www.npmjs.com/package/@rjsf/shadcn), [rjsf-team.github.io](https://rjsf-team.github.io/react-jsonschema-form/docs/) |
| Uniforms | active | mid | Bridge pattern (JSON Schema/Zod/GraphQL → form). Tốt nếu schema reused across layers. [dev.to comparison](https://asoasis.tech/articles/2026-03-28-1453-react-form-libraries-comparison-2026/) |
| Formily | active | heaviest | Targets enterprise interdependent fields (conditional show/hide chains). Overkill ở đây — không field interdependency trong described config (flat list: label/type/required/regex). |
| FormEngine | v-, comparable to rjsf | 244KB alone / 188KB w/ MUI đã present | Newer rjsf alternative, bundle comparable hoặc better chỉ nếu MUI đã dep. [dev.to bundle comparison](https://dev.to/optimajet/formengine-vs-rjsf-an-honest-bundle-size-comparison-of-two-json-schema-form-libraries-133n) |
| Hand-rolled: react-hook-form (v7) + zod + small field-registry | n/a | react-hook-form 9.6KB gzip + zod (~13KB) ≈ 25-30KB total | Full control, không schema-translation layer, styles natively với shadcn/ui (shadcn's own `<Form>` primitives ARE built trên RHF). [dev.to RHF+Zod 2026](https://dev.to/marufrahmanlive/react-hook-form-with-zod-complete-guide-for-2026-1em1) |

### Khuyến nghị: hand-rolled renderer trên react-hook-form + zod. KHÔNG sử dụng rjsf/uniforms/formily.

Lý do (YAGNI/KISS):
- Described config là **flat field list** (name/label/type/required/regex) với ~5 field types (text, date, enum, 12-digit regex string, có thể number/checkbox). Đây không phải deeply nested JSON Schema với conditionals/oneOf/allOf — chính xác case nơi rjsf's complexity pays off. Ở đây không.
- rjsf forces JSON-Schema-shaped config hoặc schema-translation step; backend config ở đây NOT JSON Schema — bạn'd write config→JSON-Schema mapper anyway, cái nào là throwaway complexity.
- Bundle cost: rjsf/FormEngine 175-244KB vs hand-rolled ~25-30KB (RHF+zod, đã likely dep cho other forms e.g. login). Cho 50 internal users, bundle size không primary driver, nhưng maintenance burden là: rjsf có own theming DSL, widget registration API, ajv version churn (v6 migration năm 2026 broke themes) — extra thing để learn/maintain cho small team vs plain React components.
- Escape hatches: hand-rolled = không escape hatch cần, nó đã custom code.
- Vietnamese labels: config.label đã Vietnamese text từ backend — render directly (`<Label>{field.label}</Label>`), zero i18n-lib cần nếu multi-locale toggle không real requirement (không stated). rjsf's `translateString` i18n layer là unneeded complexity ở đây.
- shadcn/ui integration: shadcn's `Form` component (`components/ui/form.tsx`) là literally thin wrapper around RHF's `FormProvider`/`Controller` — hand-rolled renderer sits naturally trên top, zero adapter cần. rjsf có `@rjsf/shadcn` theme too nhưng nó "relatively new" (per its own docs) — more risk cho maintenance-first internal tool.

**Concrete pattern (~150-200 lines, split per rule):**
```
types: FieldConfig { name, label, type: 'text'|'date'|'enum'|'regex'|'number', required, pattern?, options?[] }
1. buildZodSchema(fields: FieldConfig[]): z.ZodObject — map type→zod validator, regex→z.string().regex(new RegExp(pattern))
2. <DynamicField field={f} /> — switch(f.type) → shadcn <Input>/<DatePicker>/<Select>, registered thông qua RHF's `register`/`Controller`
3. <DynamicForm config={apiConfig} onSubmit={...} /> — useForm({resolver: zodResolver(buildZodSchema(config.fields))}) + maps fields tới <DynamicField>
```
Giữ `buildZodSchema` và `DynamicField` trong separate files per project's 200-line/file rule.

### Bảng kết quả động

Sử dụng **TanStack Table v8** (`@tanstack/react-table`), headless, ~15KB. Nó explicitly designed cho runtime-generated `ColumnDef[]` (không hardcoded) — đây không phải "vs hand-rolled", TanStack Table's headless design đã IS minimal-hand-rolled-friendly option: pass `columnHelper.accessor(field.name, {header: field.label})` built từ output-field config array tại render time. [TanStack column-defs guide](https://tanstack.com/table/latest/docs/guide/column-defs), [dynamic columns discussion](https://github.com/TanStack/table/discussions/5189). Không alternative library cần — không add ag-grid/MUI DataGrid (heavier, licensing complexity cho ag-grid enterprise features bạn không sử dụng).

---

## B. UI Timeline (bản ghi + ảnh theo thời gian)

Requirement: 1 person → many records/photos, chronological, thumbnails, "updated at" timestamps.

- **Timeline layout**: `react-chrono` (npm, latest v3.3.3) — vertical/horizontal timeline, actively maintained, handles date+content+media out of box. Alternative: `react-vertical-timeline-component` (simpler, more DOM-based, 34+ dependents) nếu bạn muốn less abstraction / chỉ styled `<ul>` với connecting line — cho ~50 users và modest record counts per person, một **hand-rolled vertical list với CSS `border-left` connector** là arguably simplest (KISS) — tránh adding timeline lib cả nếu visual polish (icons per event, alternating layout) không explicitly required. Khuyến nghị: start hand-rolled (flex column + Tailwind border-line), reach cho `react-chrono` chỉ nếu design requires animated/icon-rich timeline.
- **Many photos / virtualization**: chỉ cần nếu single person có thể có dozens+ photos. Sử dụng `@tanstack/react-virtual` (v3, same family như react-table, ~5KB, headless) cho virtualized grid — xem grid-virtualization pattern tại [tanstack-virtual-grid.vercel.app](https://tanstack-virtual-grid.vercel.app/) và [TanStack Virtual docs](https://tanstack.com/virtual/latest/docs/introduction). Nếu photo counts per person là small (<30, realistic cho citizen-record lookup app), skip virtualization hoàn toàn — native `loading="lazy"` trên `<img>` là enough (YAGNI).
- **Lightbox/gallery**: `yet-another-react-lightbox` (actively maintained 2026, works React 16.8-19, responsive image resolution switching, zoom/video plugins optional) — pair với `react-photo-album` cho masonry/grid layout nếu cần. [yet-another-react-lightbox.com](https://yet-another-react-lightbox.com/), [gallery example](https://yet-another-react-lightbox.com/examples/gallery). Đây là de-facto standard, small footprint, không cần hand-roll lightbox (không như forms/tables, a11y-correct modal/keyboard-nav lightbox không trivial để hand-roll tốt).

**Khuyến nghị**: hand-rolled timeline list (không timeline lib) + `yet-another-react-lightbox` cho photo viewing + lazy-load images (skip virtualization nếu photo counts không prove large trong practice).

---

## C. Serving images từ MinIO securely

### Phương án 1: Presigned GET URL (backend tự sinh, TTL ngắn)
- Pros: backend không proxy bytes → less backend load/connections; MinIO SDK (`minio-py`/`aws-sdk`) supports `presigned_get_object(bucket, key, expires=timedelta(minutes=5))` natively.
- Cons / risks:
  - URL là bearer-token-like: bất kỳ ai có link có thể access trong TTL bất kể subsequent RBAC changes — "presigned URLs...có thể still accessed bởi anyone sở hữu link trong specified time window" [github.com/minio/minio discussion #17546](https://github.com/minio/minio/discussions/17546).
  - Có thể shared/leaked thông qua browser history, logs, referrer headers, screen-share.
  - Không per-request audit trail tại app layer của bạn (MinIO access logs exist nhưng separate từ app's audit log, harder để correlate tới RBAC/user identity của bạn).
  - Reverse-proxy interactions có thể break presigned signature validation nếu headers/host rewritten incorrectly — extra ops risk [github.com/minio/minio issue #7857](https://github.com/minio/minio/issues/7857).
  - Mitigation options (short 60-300s TTL, one-time-use token wrapping) thêm complexity converges lại toward option 2 anyway.

### Phương án 2: Proxy/stream qua Backend (endpoint có xác thực, VD `GET /api/records/:id/photo/:photoId`)
- Backend checks session/JWT + RBAC trên mỗi request, sau đó streams bytes từ MinIO (`get_object` → pipe tới response) mà không bao giờ expose MinIO credentials hoặc bucket structure tới client.
- Pros: full audit-logging (mỗi image view là normal API-logged request), instant RBAC enforcement (không window nơi revoked user vẫn có valid link), simpler mental model (một auth mechanism cho everything, không hai: app auth + presigned-URL possession).
- Cons: backend holds connection trong transfer — cho ~50 users và typical photo sizes (KB-few MB), đây là trivial load, không real perf concern. "Backend proxying...increased costs, longer response times...under heavy load" [dev.to](https://dev.to/ashrafamer/the-smart-way-to-achieve-fast-and-secure-file-uploads-to-s3-without-a-server-3mbb) — heavy load không phải app's profile này (50 internal users).
- Caching: proxy endpoint vẫn có thể return `Cache-Control: private, max-age=3600` + `ETag`/`Last-Modified` headers (pass through từ MinIO's object metadata hoặc compute) → browser caches normally per URL+cookie, standard HTTP caching semantics apply. Không presigned-URL-churn problem (URLs là stable, e.g. `/api/photo/{id}`, không query-string-signed).

### Khuyến nghị: Option 2 — backend authenticated proxy/stream.

Lý do: tại 50 users, performance difference là negligible; simplicity + auditability + instant-revocation-on-RBAC-change dominate. Tránh "presigned URL leaked → không thể revoke mid-TTL" problem hoàn toàn, vì mỗi access re-checks auth. Matches KISS: một auth boundary, không hai.

### Ảnh thu nhỏ (Thumbnail)
- On-demand generation + cache (không on-upload): generate resized JPEG trên first request (e.g., thông qua `sharp`/`Pillow`), cache result (MinIO second bucket, hoặc local disk/Redis với content-hash key), serve subsequent requests từ cache. Tránh wasted compute cho photos không bao giờ viewed, tránh upload-time latency spike.
- Given likely small photo volume per person và 50-user scale: **thumbnails có thể không needed cả initially** — serve moderate-size images directly với `loading="lazy"` + CSS `object-fit: cover` sized boxes; add on-demand thumbnail generation chỉ nếu profiling shows real photo-list load time issues (YAGNI — không pre-build thumbnail pipeline speculatively).

---

## D. Lưu trữ auth token trong SPA

### Khuyến nghị: in-memory access token (JS variable/React context, short TTL 10-15min) + httpOnly, Secure, SameSite=Strict refresh cookie scoped tới `/api/auth/refresh`.

Đây là 2026 "gold standard" pattern sử dụng bởi Auth0/Clerk/Supabase-style setups: "access token lives trong JavaScript variable...refresh token sits trong HttpOnly, Secure, SameSite cookie" [medium.com/@sahin.ilyd](https://medium.com/@sahin.ilyd/where-should-you-store-jwt-tokens-localstorage-vs-httponly-cookie-vs-in-memory-83f9ede59cd1). Rejected alternatives:
- **localStorage JWT**: XSS reads nó directly, OWASP/RFC 9700 discourage cho long-lived tokens. Reject.
- **httpOnly cookie cho access token + CSRF**: works nhưng cần CSRF-token plumbing trên mỗi mutating request; in-memory access token tránh CSRF concern cho API calls chính nó (chỉ refresh/login endpoints cần CSRF/SameSite protection).
- **Full BFF (browser không có gì, server proxies all API calls)**: strongest per RFC 9700 nhưng adds session-store + proxy layer — overkill infra cho 50-user internal tool (YAGNI). Skip nếu compliance không mandate.

### Thu hồi nhanh ("admin khóa user → session chết nhanh")

Mechanism: **short access-token TTL + server-side check trên refresh**, không full request-level denylist (tránh Redis infra cho 50 users — YAGNI nếu không truly cần sub-second revocation):
1. Access token TTL = 10-15 min, carries `sessionVersion` (hoặc `tokenVersion`) claim.
2. User row trong DB có `session_version` int + `locked` bool.
3. `/api/auth/refresh` (called thông qua httpOnly cookie) checks DB: nếu `locked=true` hoặc `session_version` mismatch → refuse, force re-login.
4. Admin "lock user" action sets `locked=true` (and/or bumps `session_version`) — takes effect trên next refresh cycle, i.e. **worst-case delay = access token TTL (≤15 min)**.
5. Nếu near-instant revocation là hard requirement (không stated, nhưng flag nó): add lightweight in-memory/Redis "locked user IDs" set checked per-request trong auth middleware — chỉ add cái này nếu 15-min window là explicitly unacceptable (YAGNI — không build nó speculatively).

CSRF cho refresh cookie: `SameSite=Strict` là sufficient vì đây là same-origin internal app (không cross-site requests cần) — skip separate CSRF-token library.

---

## Summary của recommendations

| Area | Recommendation | Reject |
|---|---|---|
| Dynamic forms | Hand-rolled renderer: react-hook-form v7 + zod + small field-registry (~150-200 LOC) | rjsf, uniforms, formily — quá heavy/complex cho flat field-list config |
| Dynamic tables | TanStack Table v8 (`@tanstack/react-table`), headless, config-driven `ColumnDef[]` | ag-grid, MUI DataGrid — unneeded weight/licensing |
| Timeline | Hand-rolled vertical list (CSS border-line) | timeline libs, nếu không design cần icons/animation (sau đó `react-chrono`) |
| Photo gallery | `yet-another-react-lightbox` (+ `react-photo-album` nếu grid cần); skip virtualization nếu không proven necessary | hand-rolled lightbox (a11y/keyboard-nav non-trivial) |
| Image serving | Backend authenticated proxy/stream endpoint | Presigned URLs (leak/revocation risk, không unified audit) |
| Thumbnails | Skip initially; on-demand + cache nếu profiling shows need | On-upload generation (speculative work) |
| Auth storage | In-memory access token (10-15min TTL) + httpOnly/Secure/SameSite=Strict refresh cookie; DB `locked`/`session_version` check trên refresh | localStorage JWT; full BFF (overkill cho 50 users) |

## Câu hỏi chưa giải quyết
1. Exact set của field `type` values trong config.json beyond 4 examples given (text/date/enum/12-digit regex) — affects size của field-registry switch statement.
2. Expected photo count per person (tens vs hundreds) — determines nếu virtualization thực sự cần.
3. Any hard compliance/regulatory requirement forcing near-instant (sub-minute) revocation, which sẽ justify adding Redis denylist mặc dù YAGNI concerns.
4. Multi-locale (non-Vietnamese) UI bao giờ required? Affects nếu i18n lib cần cho form labels.
5. Backend framework/language (Node/Python/Go?) — determines exact proxy-streaming implementation (affects nếu MinIO SDK stream-to-response là straightforward).

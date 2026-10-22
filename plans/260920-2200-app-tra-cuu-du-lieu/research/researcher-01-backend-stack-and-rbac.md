# Giai đoạn Research: NestJS vs FastAPI for internal data-lookup BFF (RBAC + config-driven adapters)

Phạm vi: ~50 internal users, small dev team, Vietnamese company. Backend = auth+RBAC+audit + BFF/proxy tới 3 upstream lookup APIs + 1 image store (MinIO+PG). Core requirement: thêm new upstream API = config.json change chỉ.

## 1. Xác thực schema runtime-driven (cốt lõi)

Cả hai ecosystems đều có con đường "static/decorator" gốc (kém phù hợp) và "raw JSON Schema" escape hatch (phù hợp tốt). Escape hatch chính là cái bạn thực sự muốn ở đây — bỏ qua DTO story gốc của framework cho tính năng cụ thể này.

**NestJS native (class-validator + ValidationPipe):** decorator classes trên `class`, generated trước. Không phù hợp với dynamic/runtime schemas chút nào — sẽ yêu cầu `class-transformer`'s `createClass`/reflect-metadata hacks. Tránh cho tính năng này. [docs.nestjs.com/techniques/validation](https://docs.nestjs.com/techniques/validation)

**NestJS + AJV (đường dẫn được khuyến nghị):** AJV consumes plain JSON Schema objects và `ajv.compile(schema)` tại runtime — điều này ánh xạ 1:1 vào "load config.json, get a validator function." Không cần classes. Được sử dụng rộng rãi cho chính xác mô hình dynamic-form này. Custom pipe wrapping `ajv.compile()` là ~20 LOC. [medium.com/@tulasirampalavalasa/custom-validation-pipe-with-ajv](https://medium.com/@tulasirampalavalasa/custom-validation-pipe-with-ajv-mini-mongo-in-nest-js-84be0fee9bb6)

**NestJS + Zod (đường dẫn thay thế):** Zod schemas chỉ là giá trị JS — build động qua `fields.reduce((acc,f)=>({...acc,[f]: z.string()}),{})`, không cần decorators/classes cũng không. NestJS v11 đã ship `StandardSchemaValidationPipe` cho Zod/Valibot/ArkType ở mức pipe; v12 (nhắm Q3 2026) mở rộng điều này sang `@Body({schema})` decorator option trực tiếp. Hơi idiomatic hơn AJV nếu định dạng config.json ánh xạ sạch sang từ vựng type của Zod (string/number/date/enum) hơn là full JSON Schema. [infoq.com/news/2026/04/nestjs-12-roadmap-esm](https://www.infoq.com/news/2026/04/nestjs-12-roadmap-esm) · [github.com/colinhacks/zod/discussions/3111](https://github.com/colinhacks/zod/discussions/3111)

**FastAPI native (Pydantic v2 type hints):** được thiết kế cho các models compile-time-known. Dynamic schemas cần `pydantic.create_model(name, **{field: (type, default)})`. Friction points được xác nhận bởi Pydantic maintainers: (a) v1's trick của làm `create_model` trên `model_json_schema()` output không còn hoạt động trong v2 (fields mất type annotations trên schema dump), (b) bạn phải hand-map JSON-Schema-style type strings → Python types chính mình, (c) validators/constraints cần `Annotated[...]` wrapping per field, nhiều boilerplate hơn AJV/Zod. Workable nhưng rõ ràng secondary use case cho library. [github.com/pydantic/pydantic/discussions/7982](https://github.com/pydantic/pydantic/discussions/7982) · [getorchestra.io/guides/fast-api-dynamic-model-creation](https://www.getorchestra.io/guides/fast-api-dynamic-model-creation-creating-models-dynamically-at-runtime)

**FastAPI + jsonschema/fastjsonschema (đường dẫn thay thế, = Python's AJV equivalent):** validate plain dict chống lại JSON Schema dict trực tiếp, sidestep Pydantic hoàn toàn cho route này, dùng như plain function bên trong `Depends()`. `fastjsonschema` compiles schema→Python code (như AJV compiles→JS) để tốc độ. Đây là so sánh công bằng với AJV — ergonomics xấp xỉ bằng NestJS+AJV.

**Kết luận về #1:** nếu bạn đi schema-first raw-JSON-Schema route (AJV / jsonschema-python), cả hai frameworks xấp xỉ tương đương — đây thực sự là "config.json của bạn có giống JSON Schema không." Nếu bạn thích giữ validation code gần hơn với các idioms còn lại của app, NestJS+Zod tự nhiên hơn FastAPI+Pydantic's `create_model`, vì Zod schemas là ordinary values bạn có thể compose/build trong loop; Pydantic models là classes với thực gymnastics yêu cầu để synthesize tại runtime. Net: NestJS có slight edge ở đây, không phải vì "TS beats Python" generically, mà vì Zod's dynamic-schema story measurably ít awkward hơn Pydantic v2's cho yêu cầu specific này.

Một extra win either way: vì config cũng declares output field mapping (không chỉ input validation), bạn sẽ write small mapper của riêng bạn bất kể framework — phần này identical effort trong cả hai.

## 2. Sự tiện dụng của RBAC / kiểm tra quyền theo từng request

**NestJS Guards:** `@Permission('api:citizen-lookup-1')` decorator + `Reflector.get()` + một `PermissionGuard implements CanActivate` checking `request.user.permissions`. Chạy trước handler, clean separation, well-documented pattern (guard pipeline: AuthGuard → RolesGuard/PermissionGuard). Đây là literally cái Guards được designed cho. [nestbolt.io/blog/rbac-permissions-nestjs](https://nestbolt.io/blog/rbac-permissions-nestjs) · [oneuptime.com/blog/post/2026-01-25-rbac-custom-guards-nestjs](https://oneuptime.com/blog/post/2026-01-25-rbac-custom-guards-nestjs/view)

**FastAPI Depends:** `Depends(require_permission("api:citizen-lookup-1"))` factory pattern, per-route thông qua `dependencies=[Depends(...)]` hoặc param injection. Equally clean, equally declarative, equally testable (dependency overrides trong tests là FastAPI strength). [propelauth.com/post/fastapi-auth-with-dependency-injection](https://www.propelauth.com/post/fastapi-auth-with-dependency-injection)

**Kết luận:** tie. Cả hai là first-class, idiomatic, declarative per-route. Chọn cái nào phù hợp với framework bạn chọn cho các lý do khác.

## 3. Thư viện Auth

**NestJS:** `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` + `argon2` (npm). Standard, stable, huge adoption; bạn write login/logout/reset/lock chính mình (thin — không cần full user-management framework với chỉ 50 internal users). [encore.dev/articles/nestjs-authentication-guide](https://encore.dev/articles/nestjs-authentication-guide)

**FastAPI:** hiện tại (2026) recommended stack shifted away từ `python-jose` (stale/CVE concerns) → **PyJWT**; away từ `passlib` (unmaintained) → **pwdlib** (wraps argon2id/bcrypt with sane defaults). `fastapi-users` là full user-management framework (registration, OAuth, email verify) — overkill cho internal 50-user app với admin-managed accounts; skip it, roll own thin login/reset/lock endpoints same như NestJS side. [workos.com/blog/top-authentication-solutions-fastapi-2026](https://workos.com/blog/top-authentication-solutions-fastapi-2026)

**Kết luận:** tie, cả hai thin/DIY cho small scope. Sử dụng: NestJS→`@nestjs/jwt`+`argon2`; FastAPI→`PyJWT`+`pwdlib[argon2]`.

## 4. ORM + migration

**Prisma:** best migration DX (`.prisma` schema, auto-generated reviewable SQL migrations), nhưng 2-4x query overhead vs raw SQL (irrelevant tại 50-user scale) và separate codegen step.
**Drizzle:** SQL-first, TS-native schema-as-code, `drizzle-kit` generates reviewable migrations, không codegen step, near-raw-SQL perf. 2026 community consensus leans Drizzle cho new TS backends.
**TypeORM:** decorator/class-based, development pace đã slow vs hai cái khác — không recommended cho greenfield trong 2026.
[encore.dev/articles/prisma-vs-drizzle-vs-typeorm](https://encore.dev/articles/prisma-vs-drizzle-vs-typeorm) · [tomodahinata.com/.../prisma-vs-drizzle-vs-typeorm-kysely](https://tomodahinata.com/en/blog/prisma-vs-drizzle-vs-typeorm-kysely-orm-comparison-guide)

**SQLAlchemy 2.x + Alembic:** async-capable (`asyncpg` dialect), `alembic revision --autogenerate` inspects models → migration script, mature và battle-tested. Standard modern FastAPI setup. [testdriven.io/blog/fastapi-sqlmodel](https://testdriven.io/blog/fastapi-sqlmodel/)

**Kết luận:** cả hai clean cho greenfield Postgres. Prisma edges out trên raw migration-review polish; Drizzle edges out trên perf/simplicity; SQLAlchemy+Alembic là mature, single obvious choice trên Python side (không "which ORM" debate cần). Given app scale (50 users, low QPS), perf differences là moot — pick Prisma (best DX/least footguns cho small team) nếu NestJS, hoặc SQLAlchemy 2.x+Alembic (only sane option) nếu FastAPI.

## 5. HTTP client (gọi upstream, retry+timeout)

**Node:** `undici` (cái native `fetch` runs on) — explicit per-phase timeouts, owns connection pool, `AbortSignal.timeout(ms)` cho total deadline; recommended default cho service-to-service calls năm 2026. `axios` viable too (`axios-retry` cho backoff) nhưng undici là "native" 2026 choice hơn. [sph.sh/en/posts/server-side-http-clients-comparison](https://sph.sh/en/posts/server-side-http-clients-comparison/)

**Python:** `httpx` — async-first, `httpx.Timeout(...)` explicit; built-in `retries=` trên `HTTPTransport` chỉ covers connection errors, cần `httpx-retries` (PyPI) hoặc `tenacity` cho retry-on-5xx/429/read-errors với backoff. [pypi.org/project/httpx-retries](https://pypi.org/project/httpx-retries/)

**Kết luận:** tie, cả hai cần một small extra retry package (`axios-retry`/undici-manual vs `httpx-retries`). Given 3 upstream APIs với heterogeneous auth/config, wrap trong small adapter layer regardless — retry/timeout logic sống ở đó once.

## 6. Độ trưởng thành của SDK MinIO + presigned URL

**Python:** `minio-py` (official MinIO SDK) — presigned URL generation just works. `boto3` cũng works với MinIO (S3-compatible) nhưng cần explicit `Config(signature_version='s3v4')` + region + virtual-hosted addressing tuning.
**Node:** `minio-js` (official) — presigned URLs just work, matches minio-py maturity. `@aws-sdk/s3-request-presigner` (AWS SDK v3) có **known reported `SignatureDoesNotMatch` issues chống lại MinIO** (open GitHub issues), largely do newer SDK v3 default checksum middleware không MinIO-compatible — needs workarounds. [github.com/minio/minio/issues/19067](https://github.com/minio/minio/issues/19067)

**Kết luận:** sử dụng **official minio SDK** trên bất kỳ side nào bạn pick (`minio-py` hoặc `minio-js`), không phải AWS SDK — tránh checksum/signature friction hoàn toàn trên Node side. Cả hai official SDKs equally mature cho use case này.

## 7. Sharing types với React/TS frontend

**NestJS:** same language như frontend → optional monorepo (npm/pnpm workspaces) với shared `types` package, HOẶC generate OpenAPI (`@nestjs/swagger`) và codegen client thông qua `@hey-api/openapi-ts` / `openapi-typescript-codegen`. Monorepo path tránh codegen step hoàn toàn cho shared DTOs/enums — strongest DX cho small team sở hữu cả hai ends.
**FastAPI:** auto-generates OpenAPI spec natively (best-in-class OpenAPI story) → frontend codegens thông qua `@hey-api/openapi-ts` hoặc `openapi-typescript`. Không shared-language monorepo option; codegen step là mandatory glue, chạy trên mọi schema change (CI step hoặc pre-commit).
[vintasoftware.com/blog/nextjs-fastapi-monorepo](https://www.vintasoftware.com/blog/nextjs-fastapi-monorepo) · [evilmartians.com/chronicles/openapi-nestjs-type-safe-controllers](https://evilmartians.com/chronicles/openapi-nestjs-type-safe-controllers-from-the-contract)

**Kết luận:** NestJS wins rõ ràng — same-language monorepo với real shared types (zero codegen drift risk) beats OpenAPI-codegen-as-glue, cái này là extra CI step + version-skew risk. Cho frontend explicitly trong React/TS, điều này matters cho small team không có dedicated DevEx bandwidth.

## 8. Kích thước image Docker / thời gian khởi động / bộ nhớ (50 user = tải trọng nhỏ ở cả 2 phương án)

**NestJS (Node):** multi-stage build + `node:alpine` → 150-200MB production image, ~0.87s startup, ~82MB idle memory. [oneuptime.com/.../optimize-docker-image-size-nestjs](https://oneuptime.com/blog/post/2026-02-17-how-to-optimize-docker-image-size-for-a-nestjs-application-using-multi-stage-builds-and-alpine-base-images-for-gke/view)
**FastAPI (Python):** `python:3.11-slim` → ~300-450MB image (alpine possible ~50-320MB nhưng musl libc breaks một số compiled deps — tránh alpine cho Python ở đây, không đáng giá fragility cho app này). Startup là fast (uvicorn), memory idle trong 60-100MB range typical cho small FastAPI app.

**Kết luận:** NestJS produces smaller, simpler production image out of box (alpine-node là well-trodden, stable path; alpine-python không, cho compiled deps). Irrelevant tại 50-user scale either way — không deciding factor, chỉ noting NestJS là marginally easier để keep lean.

## 9. Khả năng bảo trì dài hạn cho team nhỏ

- Nếu frontend đã/sẽ React+TS, một language across stack (NestJS) reduces context-switching cho small team — same debugger, same package manager, same linter, same hiring pool skill overlap với frontend devs.
- FastAPI's strength (best-in-class *static* typed request/response models + auto OpenAPI docs) đúng là phần của app này NOT static (config-driven upstream schemas) — bạn'd be fighting framework's best feature cho core requirement.
- NestJS's structure (modules/controllers/services/guards/pipes) maps trực tiếp onto app's shape: AuthModule, RbacGuard, ProxyModule (adapter pattern lives naturally như `UpstreamAdapterService` registry keyed by config), AuditInterceptor (NestJS Interceptors là clean fit cho "log every request" cross-cutting concern — arguably better native fit hơn FastAPI middleware cho cái này).
- Downside của NestJS: steeper initial learning curve (DI, decorators, modules) nếu team không TS-heavy rồi; FastAPI simpler để onboard Python-only dev vào.

## Khuyến nghị: NestJS (Node/TypeScript)

Lý do chính đáng:
- Frontend là React/TS → monorepo + shared types eliminates whole class của drift bugs 50-user internal tool không có budget để chase (#7).
- Config-driven dynamic validation là wash technically (AJV ≈ jsonschema-python), nhưng Zod's dynamic-schema story less awkward hơn Pydantic v2's `create_model` gymnastics nếu bạn muốn idiomatic code, không chỉ workaround (#1).
- Guards/Interceptors map cleanly vào RBAC-guard + audit-log-interceptor without extra plumbing (#2, #9).
- Official `minio-js` tránh AWS-SDK-v3/MinIO signature friction một số teams hit (#6).
- Smaller, more mature Docker story out of box (#8) — minor nhưng free.

Concrete library list:
- Framework: `@nestjs/core` (v11 stable now; v12 w/ StandardSchema trong `@Body` targeted Q3 2026 — start trên v11, nó đã supports Zod thông qua `StandardSchemaValidationPipe`)
- Dynamic validation: `ajv` (config.json = JSON Schema) HOẶC `zod` + dynamic `.reduce()`-built schemas — pick AJV nếu config.json format should literally JSON Schema (portable, language-agnostic config); pick Zod nếu bạn muốn TS-side reuse của schema-building helpers.
- Auth: `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2`
- ORM/migrations: `prisma` (best migration DX cho small team) — Drizzle acceptable alt nếu team prefers SQL-first
- HTTP client: `undici` (hoặc `axios` + `axios-retry` nếu team prefers axios ergonomics)
- MinIO: `minio` (SDK minio-js chính thức) cho object storage + presigned URL; `pg`/Prisma cho metadata Postgres
- OpenAPI/type sharing: `@nestjs/swagger` cho docs + pnpm/npm workspace monorepo cho actual shared DTO/type package với frontend (skip codegen — same language)
- Docker: multi-stage `node:20-alpine` build

Nếu team là Python-only hôm nay với zero TS experience, FastAPI là defensible second choice (SQLAlchemy 2.x+Alembic, PyJWT, pwdlib[argon2], httpx+httpx-retries, minio-py, jsonschema/fastjsonschema cho dynamic validation) — yêu cầu duy nhất nó handles measurably worse là #1 (dynamic schema ergonomics) và #7 (không monorepo shared types, mandatory OpenAPI-codegen glue step).

## Câu hỏi chưa giải quyết
- config.json có meant literally JSON Schema, hay simpler custom DSL (field name/type/required list)? Affects AJV-vs-Zod choice trong NestJS path.
- Team's current language proficiency (TS vs Python) không stated — recommendation trên assumes React/TS frontend là given và treats nó như decisive cho #7; nếu team có zero TS backend experience, weigh onboarding cost chống lại monorepo benefit.
- Expected upstream API response volume/size (affects nếu Prisma's overhead hoặc Python's GIL matters chút nào — tại 50 users almost certainly không).
- Any existing company infra/ops standard (K8s, existing Node hoặc Python services already chạy trong prod) không found trong repo — would strongly bias decision nếu present.

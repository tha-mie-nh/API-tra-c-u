# Visual Explanation: Kiến trúc hệ thống & cách hoạt động

## Overview

APP Tra cứu dữ liệu là cổng tra cứu công dân nội bộ (~50 người dùng). Tư tưởng thiết kế xuyên
suốt: **config-driven** — `config/config.json` là "bộ não" quyết định mọi nguồn tra cứu (input
cần gì, output trả gì, gọi API thật hay mock), code xử lý hoàn toàn generic, không hardcode tên
field nào. Thêm 1 API tra cứu mới = sửa JSON, không sửa code.

Stack: NestJS (api) + React (web) + Postgres (dữ liệu quản trị) + MinIO (ảnh) + Caddy (cổng
vào duy nhất, tự mã hóa HTTPS nội bộ) — đóng gói hoàn toàn bằng Docker Compose.

## Quick View (ASCII)

```
                    ┌─────────────────────────────────────────┐
                    │         Trình duyệt (LAN/VPN nội bộ)      │
                    └───────────────────┬───────────────────────┘
                                        │ HTTPS (tự ký nội bộ, không ra internet)
                    ╔═══════════════════▼═══════════════════════╗
                    ║  proxy (Caddy) — CỔNG VÀO DUY NHẤT          ║
                    ║  network: frontend                          ║
                    ╚═══════════╦═══════════════════╦═════════════╝
                /api/v1/* │                          │ mọi path khác
                          ▼                          ▼
              ┌──────────────────┐         ┌──────────────────┐
              │  api (NestJS)     │         │  web (nginx)      │
              │  network:         │         │  network:frontend │
              │  frontend+backend │         │  (file tĩnh React)│
              └─────────┬─────────┘         └──────────────────┘
                        │ network: backend (không lộ ra ngoài)
            ┌───────────┼────────────┐
            ▼                        ▼
  ┌──────────────────┐    ┌──────────────────┐
  │ postgres :5432     │    │ minio :9000       │
  │ (users/roles/      │    │ (ảnh công dân,    │
  │  query_logs/...)   │    │  object storage)  │
  └──────────────────┘    └──────────────────┘
```

**2 network tách biệt = ranh giới bảo mật:** `backend` (postgres, minio, api — không IP nào lộ
ra host) và `frontend` (proxy, web, api). `api` có mặt ở cả 2 — là cầu nối DUY NHẤT giữa vùng
công khai và vùng dữ liệu nhạy cảm.

## Detailed Flow

### 1. Một lượt tra cứu đầy đủ (đăng nhập → tra cứu → ghi lịch sử)

```mermaid
sequenceDiagram
    participant FE as Web (React)
    participant Caddy
    participant API as api (NestJS)
    participant Guard as PermissionGuard
    participant Registry as DatasourceRegistry
    participant Adapter as Adapter (mock/http/minio-pg)
    participant DB as Postgres
    participant Log as QueryLogService

    FE->>Caddy: POST /api/v1/auth/login {username, password}
    Caddy->>API: reverse_proxy api:3000
    API->>DB: kiểm tra passwordHash (argon2)
    API-->>FE: accessToken (15', giữ in-memory) + refreshToken (httpOnly cookie)

    FE->>Caddy: POST /api/v1/query/IMMIGRATION_HISTORY {passportNumber}
    Caddy->>API: reverse_proxy api:3000
    API->>Guard: JwtAuthGuard xác thực token
    Guard->>Guard: PermissionGuard so quyền user vs api:immigration_history
    Guard-->>API: OK (hoặc 403 + ghi log "denied")
    API->>Registry: lấy config datasource theo code
    Registry-->>API: input schema (Zod) + transport config
    API->>API: validate params theo input.fields + requireGroups
    API->>Adapter: execute(params)
    Note over Adapter: mock → đọc JSON tĩnh<br/>http → gọi API thật<br/>minio-pg → query Postgres + lấy bytes MinIO
    Adapter-->>API: raw records
    API->>API: ResponseMapper: map theo output.fields,<br/>áp valueMap, nhóm theo identityField, sort theo timestampField
    API->>Log: ghi 1 dòng query_logs (giá trị THẬT, mask lúc đọc)
    API-->>FE: envelope chuẩn {columns, groups, timestampField}
    FE->>FE: InfoRecordTable render generic theo columns
```

### 2. RBAC — một điểm chốt quyền duy nhất

```mermaid
flowchart LR
    A["Request vào bất kỳ route nào"] --> B{"@Public()?"}
    B -- "Có" --> Z["Cho qua, không cần token"]
    B -- "Không" --> C["JwtAuthGuard: verify access token"]
    C -- "Token sai/hết hạn" --> D["401"]
    C -- "OK" --> E["PermissionResolverService:<br/>gom quyền từ MỌI role của user"]
    E --> F{"PermissionGuard:<br/>route cần quyền gì?"}
    F -- "Route tĩnh (vd admin:users)" --> G{"User có quyền này?"}
    F -- "Route động (/query/:code)" --> H["suy ra quyền = api:&lt;code&gt;<br/>từ chính URL, không hardcode"]
    H --> G
    G -- "Có" --> I["Cho qua"]
    G -- "Không" --> J["403 + ghi query_logs status=denied"]
```

Thêm 1 datasource mới trong `config.json` → quyền `api:<code>` **tự động** được bảo vệ, không
sửa route nào — vì route `/query/:code` tự suy quyền từ `:code`.

### 3. Vòng đời permission `api:*` — đồng bộ tự động lúc boot

```mermaid
flowchart TD
    A["api container khởi động"] --> B["DatasourceConfigLoaderService:<br/>đọc + validate config.json (AJV schema)"]
    B -- "Sai schema" --> C["Crash ngay (fail fast)"]
    B -- "Hợp lệ" --> D["PermissionSyncService.onModuleInit()"]
    D --> E["Với MỖI datasource (kể cả enabled:false):<br/>upsert permission 'api:&lt;code&gt;' vào DB"]
    E --> F["KHÔNG xóa permission của datasource<br/>đã biến mất khỏi config (tránh orphan role_permissions)"]
    F --> G["RolesService.listPermissions() lọc UI:<br/>chỉ hiện datasource đang enabled"]
```

### 4. Auth — access token vs refresh token

```mermaid
flowchart LR
    subgraph Browser["Trình duyệt"]
        A["accessToken<br/>(JS variable, KHÔNG localStorage)"]
        B["refreshToken<br/>(cookie httpOnly/Secure/SameSite)"]
    end
    A -- "mỗi API call,<br/>Authorization: Bearer" --> API1["api"]
    A -- "hết hạn sau 15 phút" --> C["Tự động gọi /auth/refresh"]
    C -- "cookie tự gửi kèm,<br/>JS không đọc được" --> API2["api cấp accessToken mới"]
    B -- "reload trang" --> D["useAuthBootstrap:<br/>refresh → /auth/me → hydrate store"]
```

Tại sao tách 2 loại: access token sống ngắn (15') để nếu lộ thì thiệt hại giới hạn thời gian;
refresh token sống dài (7 ngày) nhưng không bao giờ chạm tới JavaScript (httpOnly) nên XSS không
lấy được nó.

### 5. Database — các bảng chính và quan hệ

```mermaid
erDiagram
    users ||--o{ user_roles : có
    roles ||--o{ user_roles : gán
    roles ||--o{ role_permissions : có
    permissions ||--o{ role_permissions : thuộc
    users ||--o{ query_logs : "thực hiện"
    users ||--o{ refresh_tokens : "sở hữu"
    users ||--o{ audit_logs : "actor"
    users ||--o{ password_reset_requests : "yêu cầu"

    users {
        uuid id PK
        string username
        string passwordHash
        enum status "ACTIVE/LOCKED"
        int failedLoginCount
    }
    permissions {
        uuid id PK
        string code "feature hoặc api:*"
        enum kind "FEATURE/API"
    }
    query_logs {
        uuid id PK
        uuid userId FK
        string datasourceCode
        json queryParams "giá trị THẬT, mask lúc đọc"
        enum status "SUCCESS/FAILED/DENIED"
    }
```

`citizen_photos` (metadata ảnh MinIO) là DB **ngoài** schema `app`, chỉ đọc.

### 6. Docker Compose — thứ tự khởi động 7 container

```mermaid
flowchart TD
    A["postgres healthy"] --> B["migrate (one-shot):<br/>prisma migrate deploy"]
    B -->|"exit 0"| C["seed (one-shot):<br/>tạo role/permission/admin user<br/>(idempotent, upsert)"]
    C -->|"exit 0"| D["api (restart: unless-stopped)"]
    A --> D
    E["minio healthy"] --> D
    D -->|"healthcheck /health OK"| F["web (nginx static)"]
    D --> G["proxy (Caddy)"]
    F --> G
    G --> H["Sẵn sàng — CHỈ proxy mở port 80/443"]
```

## Key Concepts

1. **Config-driven = 1 nguồn sự thật.** `config/config.json` định nghĩa `input.fields` (form
   nhập), `output.fields` (bảng kết quả, kèm `valueMap`/`sensitive`/`emphasize`/`iconMap`),
   `transport` (mock/http/minio-pg). Code (`buildInputSchema`, `ResponseMapperService`,
   `InfoRecordTable`) đọc field list tại runtime — **không có `citizenId` hardcode ở đâu**.

2. **1 điểm chốt quyền (`PermissionGuard`), không rải rác.** Dù có 50 route, chỉ 1 nơi quyết
   định "được phép hay không". Route động tự suy quyền từ `:code` nên không bao giờ quên bảo vệ
   datasource mới.

3. **Mask dữ liệu nhạy cảm ở READ-TIME, không phải WRITE-TIME** (mới sửa gần đây). `query_logs`
   lưu giá trị thật — `HistoryService` mới là nơi quyết định hiện full hay `***` tùy quyền
   `history:view_sensitive` của người đang xem.

4. **"Never hard-delete" cho permission.** Tắt 1 datasource (`enabled:false`) không xóa
   permission trong DB — tránh mất ý nghĩa audit log cũ và orphan `role_permissions`. UI chỉ lọc
   hiển thị, dữ liệu gốc vẫn còn.

5. **TLS nội bộ, không phụ thuộc internet.** `docker/Caddyfile` dùng `tls internal` — Caddy tự
   làm CA, tự ký, không bao giờ gọi Let's Encrypt. App chạy được hoàn toàn trong mạng cô lập.

6. **Image Docker không chứa `config.json`.** Nó được bind-mount từ host (`./config:/repo/config:ro`)
   — đây là lý do "thêm datasource = sửa file + restart, không rebuild image" là có thật, không
   chỉ là lời hứa trên giấy.

## Code Example

`config/config.json` — 1 datasource định nghĩa đủ mọi thứ code cần, không gì khác:

```json
{
  "code": "IMMIGRATION_HISTORY",
  "permissionCode": "api:immigration_history",
  "transport": { "kind": "mock", "dataFile": "mock-data/immigration-history.json" },
  "input": {
    "fields": [{ "name": "passportNumber", "label": "Số hộ chiếu", "type": "string" }],
    "requireGroups": [["passportNumber"], ["fullName", "dob", "gender"]]
  },
  "output": {
    "identityField": "passportNumber",
    "timestampField": "eventAt",
    "fields": [
      { "name": "direction", "from": "xuatNhap", "type": "enum",
        "valueMap": { "X": "Xuất cảnh", "N": "Nhập cảnh" },
        "emphasize": true, "iconMap": { "Xuất cảnh": "arrow-up-right" } }
    ]
  }
}
```

`PermissionGuard` suy quyền động từ route — không có `if (code === 'IMMIGRATION_HISTORY')` nào:

```ts
// apps/api/src/datasources/datasources.controller.ts
@RequirePermission()                 // rỗng = chỉ cần đăng nhập, quyền thật tính runtime
@Get(':code')
async getOne(@CurrentUser() user, @Param('code') code: string) {
  const permissions = await this.permissionResolver.getEffectivePermissions(user.id);
  if (!permissions.has(apiPermissionCode(code))) throw new ForbiddenException(...);
}
```

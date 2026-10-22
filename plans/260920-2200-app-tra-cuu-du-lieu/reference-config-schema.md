# Tham khảo: `config.json` Datasource Schema (Hợp đồng kiến trúc cốt lõi)

> File này là **single source of truth** cho config-driven adapter design.
> Spec requirement (g): *"Các trường đầu vào, đầu ra của API được cấu hình riêng trong file config.json độc lập"*.
> Phases 04, 05, 07 all depend trên contract này. Change ở đây = change everywhere.

## Nguyên tắc thiết kế

1. **config.json chứa NO secrets.** Credentials referenced bởi env var NAME chỉ (`valueEnv`). Satisfies spec (g): *API key chỉ lưu ở Backend*.
2. **Adding new upstream API = adding một entry ở đây + một env var.** Zero core code change. Chỉ genuinely new `transport.kind` hoặc `type` cần code.
3. **Config được split thành hai projections:**
   - *Server projection* (full): includes `transport` — bao giờ không leaves backend.
   - *Client projection* (redacted + permission-filtered): `code`, `name`, `type`, `input.fields`, `output.fields` (label/type only), `limits`. Served bởi `GET /api/v1/datasources`.
     Đây là cách *"user không có quyền API thì chức năng ẩn trên Frontend"* được implemented — FE renders chính xác những gì nó receives, không client-side permission logic.
4. **Config validated tại boot** chống lại JSON Schema. Invalid config = process refuses để start (fail fast, không fail silently tại query time).
5. `code` là immutable và là join key cho `permissions.code` và `query_logs.datasource_code`. Bao giờ không rename code sau go-live.

## Schema đầy đủ

```jsonc
{
  "version": 1,
  "defaults": {
    "maxResults": 100,          // spec (g): giới hạn số lượng dữ liệu trả về
    "pageSize": 20,
    "timeoutMs": 10000,
    "retry": { "attempts": 2, "backoffMs": 300 }
  },
  "datasources": [
    {
      "code": "CITIZEN_BASIC",              // STABLE KEY: permission + audit join key
      "name": "Tra cứu thông tin công dân",
      "description": "Tra theo họ tên / ngày sinh / giới tính",
      "type": "info",                        // "info" | "image"  → drives UI renderer + adapter
      "enabled": true,
      "permissionCode": "api:citizen_basic", // granted via Role

      "transport": {                         // SERVER-ONLY. Never sent to FE.
        "kind": "http",                      // "http" | "mock" | "minio-pg"
        "baseUrl": "${CITIZEN_BASIC_BASE_URL}",
        "path": "/v1/citizens/search",
        "method": "POST",
        "auth": {
          "kind": "apiKeyHeader",            // "apiKeyHeader" | "bearer" | "basic" | "none"
          "header": "X-API-Key",
          "valueEnv": "CITIZEN_BASIC_API_KEY"  // env var NAME, not the value
        },
        "timeoutMs": 10000
      },

      "input": {
        "fields": [
          { "name": "fullName", "label": "Họ và tên", "type": "string",
            "required": true, "minLength": 2, "maxLength": 100, "mapTo": "ho_ten" },
          { "name": "dob", "label": "Ngày sinh", "type": "date",
            "required": false, "mapTo": "ngay_sinh", "format": "YYYY-MM-DD" },
          { "name": "gender", "label": "Giới tính", "type": "enum", "required": false,
            "options": [ {"value":"M","label":"Nam"}, {"value":"F","label":"Nữ"} ],
            "mapTo": "gioi_tinh" }
        ],
        "atLeastOneOf": ["fullName", "dob", "gender"]   // blocks empty/scraping queries
      },

      "output": {
        "recordsPath": "data.items",      // path to the ARRAY in upstream response
        "totalPath": "data.total",
        "requestIdPath": "meta.requestId", // → query_logs.upstream_request_id
        "timestampField": "recordedAt",    // ← spec (a): configurable sort field
        "sortOrder": "desc",
        "identityField": "citizenId",      // groups records into a per-person TIMELINE
        "fields": [
          { "name":"citizenId","label":"Số CCCD","from":"cccd","type":"string","sensitive":true },
          { "name":"fullName","label":"Họ và tên","from":"ho_ten","type":"string" },
          { "name":"dob","label":"Ngày sinh","from":"ngay_sinh","type":"date" },
          { "name":"gender","label":"Giới tính","from":"gioi_tinh","type":"enum",
            "valueMap": { "1":"Nam", "2":"Nữ" } },
          { "name":"address","label":"Địa chỉ","from":"dia_chi","type":"string" },
          { "name":"recordedAt","label":"Thời điểm ghi nhận","from":"thoi_diem","type":"datetime" }
        ]
      },

      "limits": { "maxResults": 100, "pageSize": 20 }   // overrides defaults
    },

    {
      "code": "CITIZEN_PHOTO",
      "name": "Tra cứu ảnh công dân",
      "type": "image",
      "permissionCode": "api:citizen_photo",
      "transport": {
        "kind": "minio-pg",
        "pgUrlEnv": "IMAGE_DB_URL",
        "minio": { "endpointEnv":"MINIO_ENDPOINT", "accessKeyEnv":"MINIO_ACCESS_KEY",
                   "secretKeyEnv":"MINIO_SECRET_KEY", "bucketEnv":"MINIO_BUCKET" },
        "query": "SELECT ... FROM citizen_photos WHERE cccd = $1 ORDER BY captured_at DESC LIMIT $2"
      },
      "input": {
        "fields": [
          { "name":"citizenId","label":"Số CCCD","type":"string",
            "required":true, "pattern":"^[0-9]{12}$", "mapTo":"cccd" }
        ]
      },
      "output": {
        "timestampField": "capturedAt",
        "sortOrder": "desc",
        "identityField": "citizenId",
        "imageRef": { "bucketField":"bucket", "objectKeyField":"objectKey", "mimeField":"mimeType" },
        "fields": [
          { "name":"citizenId","label":"Số CCCD","from":"cccd","type":"string" },
          { "name":"capturedAt","label":"Thời điểm cập nhật","from":"captured_at","type":"datetime" },
          { "name":"source","label":"Nguồn","from":"source","type":"string" },
          { "name":"bucket","from":"bucket","type":"string","internal":true },
          { "name":"objectKey","from":"object_key","type":"string","internal":true },
          { "name":"mimeType","from":"mime_type","type":"string","internal":true }
        ]
      },
      "limits": { "maxResults": 50, "pageSize": 24 }
    }
  ]
}
```

## Từ vựng kiểu field

`string` | `number` | `date` | `datetime` | `enum` | `boolean`

Input validators supported: `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `options`, `format`.
Output modifiers: `valueMap` (code→label), `sensitive` (mask trong logs), `internal` (bao giờ không sent tới FE; used để build image URLs server-side).

## Response envelope thống nhất (những gì `POST /api/v1/query/:code` trả về)

Identical shape cho mỗi datasource — đây là cái makes FE generic.

```jsonc
{
  "datasource": "CITIZEN_BASIC",
  "type": "info",
  "requestId": "q_01J...",
  "columns": [ { "name":"fullName", "label":"Họ và tên", "type":"string" } ],
  "timestampField": "recordedAt",
  "groups": [                              // spec: timeline, 1 person → N records
    {
      "identity": "001099001234",
      "label": "Nguyễn Văn A",
      "records": [                         // sorted by timestampField, sortOrder
        { "fullName":"Nguyễn Văn A", "recordedAt":"2026-03-01T10:00:00Z", "...": "..." }
      ]
    }
  ],
  "page": { "page":1, "pageSize":20, "total":37, "returned":20,
            "limit":100, "truncated":false },
  "tookMs": 240
}
```

Cho `type:"image"`, mỗi record additionally carries backend-issued `imageUrl` + `thumbUrl`
(bao giờ không raw MinIO URL, bao giờ không credentials) — xem Phase 05.

## Vì sao thiết kế này vẫn đứng vững khi có API thật

Biggest project risk = 3 real APIs có unknown schemas (doc chưa delivered bởi Egor).
Khi docs arrive change set là: (1) new `datasources[]` entry per real API với correct
`transport`/`mapTo`/`from` paths, (2) flip `transport.kind` từ `mock` sang `http`, (3) env vars.
Core code (auth, RBAC, query engine, history, UI) untouched.
Nếu real API's response không thể được expressed bởi `recordsPath` + flat `from` mapping (e.g. deeply
nested / needs computation), escape hatch là per-datasource optional `transform` module
registered bởi `code` — add chỉ khi actually needed (YAGNI).

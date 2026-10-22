# Tham khảo: Screen Inventory & UX

> Spec (h): *"Giao diện các màn hình (nên có 2 dạng: tra thông tin và tra ảnh)"*.
> Phases 06-08 implement những cái này. Vietnamese UI copy throughout.

## Mô hình điều hướng

Sidebar được built từ `GET /auth/me` permissions + `GET /datasources`.
**Không hardcoded menu.** Một user không `api:*` permission simply sees không "Tra cứu" section —
điều này satisfies spec (c) *"chức năng ẩn trên Frontend"* mà không any client-side permission table.

```
├── Tra cứu
│   └── <một entry per permitted datasource, từ GET /datasources>
├── Lịch sử tra cứu        [history:view_own | history:view_all]
└── Quản trị                [admin:*]
    ├── Người dùng
    ├── Vai trò & quyền
    └── Nhật ký quản trị
```

## S1 — Đăng nhập

Username + password, error states (sai mật khẩu / tài khoản bị khóa / phải đổi mật khẩu).
Redirect tới forced change-password screen khi `must_change_password`.
Không "self-service register" và không "forgot password" — spec nói admin resets passwords. (YAGNI)

## S2 — Tra cứu thông tin (`type: "info"`)

Layout: form panel (top / left) + results (below / right).

- **Form được rendered dynamically** từ `datasource.input.fields`. Cho sample info API cái
  yields: Họ và tên (text, required), Ngày sinh (date), Giới tính (select Nam/Nữ).
  Một different API với different fields renders different form với **zero code change**.
- Client-side validation mirrors config rules; **server re-validates** (client validation là UX only).
- Results = **timeline grouped bởi `identityField`**: một card per person, bên trong nó một
  chronological list của person's records (newest first per `sortOrder`).
  Columns/labels come từ `output.fields` — again, không hardcoded table.
- Mỗi record row shows configured `timestampField` prominently (spec a).
- Pagination control; visible banner khi `page.truncated` — *"Kết quả đã bị giới hạn ở N bản ghi"* (spec g).
- Empty state, loading skeleton, upstream-error state (timeout / 502) distinguishable từ "no results".

## S3 — Tra cứu ảnh (`type: "image"`)

- Form: Số CCCD (12 digits, pattern-validated từ config).
- Results = **photo timeline**: grouped bởi person, photos ordered bởi `capturedAt` desc,
  mỗi thumbnail captioned với update timestamp của nó (spec a: *hiển thị tất cả ảnh khớp và mốc thời gian cập nhật*).
- Click → lightbox với full image + tất cả metadata fields từ `output.fields`.
- Images loaded thông qua backend-issued URLs chỉ. Frontend bao giờ không sees MinIO host hoặc credentials.

S2 và S3 share **same page component**; chỉ results renderer khác, switched trên
`datasource.type`. Đây là DRY payoff của config-driven design.

## S4 — Lịch sử tra cứu

- Table: thời gian, user, API, tóm tắt điều kiện, trạng thái (thành công/thất bại/bị từ chối), số bản ghi.
- Filters: user / API / khoảng thời gian / trạng thái (spec f).
- **user filter chỉ visible tới `history:view_all` holders**; others implicitly see chỉ của họ
  (enforced server-side regardless).
- Row → detail drawer: full (masked) params, upstream request id, duration, error message.

## S5 — Quản trị người dùng

List + search + status chips. Actions: Tạo, Sửa, Khóa/Mở khóa, Gán Role, Reset mật khẩu (spec b).
Reset shows temp password **once** trong copy-to-clipboard modal với explicit warning.
Destructive actions cần confirm dialog.

## S6 — Quản trị vai trò & quyền

Role list → permission matrix (checkbox grid: rows = permissions incl. mỗi `api:*` từ config,
columns = nothing, nó là per-role checklist). New datasource trong config.json appears ở đây
automatically sau restart.

## S7 — Nhật ký quản trị

Read-only audit_logs table với before/after diff viewer.

## Quy tắc UX xuyên suốt

- Vietnamese labels come từ config (`label` field) cho data, và từ i18n file cho chrome.
  Không **hardcode** Vietnamese strings bên trong components.
- Session expiry → silent refresh; trên refresh failure → redirect tới login với toast.
  Nếu admin locked account mid-session, refresh fails và user được ejected.
- Date/number formatting: `vi-VN` locale, timezone `Asia/Ho_Chi_Minh` cho display; **UTC trong API**.
- Responsive down tới tablet. Mobile không requirement (internal desktop tool) — không over-invest.
- Accessibility: keyboard-navigable forms và dialogs, visible focus rings. Basic, không WCAG-audited.

# Giai đoạn 06 — Frontend Foundation & Auth Flow

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-screens-and-ux.md](reference-screens-and-ux.md) · [reference-api-specification.md](reference-api-specification.md)
- [research/researcher-02-config-driven-ui-and-minio-images.md](research/researcher-02-config-driven-ui-and-minio-images.md) (§D token storage)
- Phụ thuộc vào Giai đoạn 03

## Tổng quan
- **Priority:** P1
- **Status:** completed
- **Effort:** 10h
- App shell, routing, API client kèm silent refresh, đăng nhập + bắt buộc đổi mật khẩu, và
  **navigation theo quyền** hiện thực spec (c) *"chức năng ẩn trên Frontend"*.

## Nhận định chính
- **Access token nằm trong biến scoped theo module, không bao giờ trong localStorage/sessionStorage**
  (research §D). Khi reload trang → gọi `/auth/refresh` một lần lúc boot để lấy lại từ cookie httpOnly.
- **FE không có bảng permission riêng.** Nó render menu từ quyền lấy ở `GET /auth/me` và
  `GET /datasources`. Việc ẩn ở FE chỉ là tiện ích UX; backend mới là chốt chặn thật (spec g). Không bao
  giờ viết `if (user.role === 'ADMIN')` — luôn check mã quyền import từ `packages/shared`.
- Type dùng chung từ `packages/shared` được import trực tiếp — không có bước codegen OpenAPI. Đây chính
  là lý do quyết định chọn NestJS (research-01 §7); tận dụng nó.

## Yêu cầu
**Chức năng:** đăng nhập, đăng xuất, silent refresh, bắt buộc đổi mật khẩu, route được bảo vệ, sidebar
theo quyền, UI tiếng Việt, xử lý lỗi/toast toàn cục, 401 → chuyển hướng về trang login.
**Phi chức năng:** build bằng Vite; code splitting theo route; định dạng `vi-VN`, hiển thị theo múi giờ
`Asia/Ho_Chi_Minh`.

## Kiến trúc
```
apps/web/src/
├── lib/
│   ├── api-client.ts        # fetch wrapper: header bearer, credentials:'include',
│   │                        # 401 → refresh single-flight → thử lại 1 lần → không thì logout
│   ├── auth-store.ts        # access token trong bộ nhớ + user/permissions (Zustand hoặc Context)
│   └── format.ts            # helper định dạng ngày/số vi-VN
├── features/auth/           # LoginPage, ChangePasswordPage, useAuth, RequireAuth, RequirePermission
├── components/layout/       # AppShell, Sidebar (dựng từ permissions), Header, UserMenu
├── routes/                  # route tree react-router v7, lazy-loaded
└── i18n/vi.ts               # toàn bộ chuỗi giao diện (nhãn dữ liệu lấy từ config)
```

## File code liên quan
**Tạo mới:** các file trên, `apps/web/src/main.tsx`, `App.tsx`, `apps/web/index.html`,
`apps/web/src/components/ui/*` (shadcn generate), `apps/web/vite.config.ts` (dev proxy → api),
test `apps/web/src/features/auth/*.test.tsx`.
**Sửa:** `packages/shared` (dùng `auth-types.ts`, `permission-codes.ts`).

## Các bước triển khai
1. Cài `react-router`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns` (+ `date-fns/locale/vi`), `sonner` (toast). Khởi tạo shadcn/ui + Tailwind.
2. `auth-store.ts`: `accessToken` scoped theo module (không persist) + state `user`/`permissions` + helper `hasPermission(code)`.
3. `api-client.ts`: wrapper có kiểu trên `fetch`; tự gắn `Authorization`; `credentials: 'include'` cho cookie refresh; khi 401 thực hiện refresh **single-flight** (nhiều 401 cùng lúc dùng chung 1 promise refresh) rồi thử lại request gốc 1 lần; nếu refresh fail thì xóa state và chuyển về `/login`. Parse error envelope chuẩn thành `ApiError` có kiểu.
4. Boot: khi app mount, thử `/auth/refresh` → nếu thành công gọi `/auth/me`; hiển thị màn hình chờ cho tới khi ổn định. Nhờ vậy reload sau khi đăng nhập vẫn hoạt động dù không lưu token.
5. `LoginPage`: react-hook-form + zod; thông báo riêng cho sai thông tin đăng nhập / tài khoản bị khóa; khi `must_change_password` thì chuyển hướng sang `ChangePasswordPage` và chặn mọi route khác.
6. Wrapper route `RequireAuth` và `RequirePermission`; điều hướng không có quyền → trang 403, không phải màn hình trắng.
7. `AppShell` + `Sidebar`: menu dựng từ `hasPermission()` + danh sách `GET /datasources` (TanStack Query, có cache). User không có `api:*` nào sẽ không thấy mục "Tra cứu" nào cả.
8. Cấu hình mặc định TanStack Query: `retry: 1`, không refetch-on-focus cho kết quả query (1 lần tra cứu là hành động tường minh của user và có audit — **không** được tự bắn lại âm thầm làm nhiễu log lịch sử). Vì lý do này, tra cứu dùng mutation, không dùng query.
9. `i18n/vi.ts` cho toàn bộ chuỗi giao diện; không hardcode chuỗi tiếng Việt trong component.
10. Error boundary toàn cục + hiển thị toast cho `ApiError`.
11. Test: đăng nhập thành công/thất bại, chuyển hướng khi bắt buộc đổi mật khẩu, 401 chỉ kích hoạt đúng 1 lần refresh dù có nhiều request đồng thời, sidebar ẩn đúng mục khi không có quyền.

## Danh sách việc cần làm
- [x] Cài dep FE + khởi tạo shadcn/ui
- [x] `auth-store` (token trong bộ nhớ, `hasPermission`)
- [x] `api-client` kèm refresh single-flight + lỗi có kiểu
- [x] Refresh lúc boot + hydrate `/auth/me` + splash
- [x] `LoginPage` + `ChangePasswordPage` (luồng bắt buộc)
- [x] Wrapper `RequireAuth` / `RequirePermission` + trang 403
- [x] `AppShell` + `Sidebar` theo quyền
- [x] Cấu hình TanStack Query (tra cứu dùng mutation)
- [x] `i18n/vi.ts` + helper định dạng `vi-VN`
- [x] Error boundary + toast
- [x] Test (luồng auth, refresh single-flight, ẩn menu)

## Tiêu chí hoàn thành
- Đăng nhập → reload trang → vẫn còn đăng nhập, **không có token nào trong localStorage/sessionStorage**
  (verify bằng devtools).
- User không có `api:*` không thấy menu tra cứu nào; user không có `admin:users` không thấy menu admin;
  vào thẳng URL cũng bị **backend** trả 403.
- Admin khóa 1 user giữa phiên → trong vòng TTL của access token, user đó bị đẩy về login kèm thông báo
  rõ ràng.
- Nhiều request 401 đồng thời chỉ kích hoạt đúng 1 lần gọi `/auth/refresh`.
- `pnpm build` ra bundle chạy được; `pnpm typecheck` sạch với type dùng chung được import đúng.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Vòng lặp refresh / thundering herd lúc hết hạn | Promise refresh single-flight; khi fail thì xóa state 1 lần và dừng retry. |
| Dev lỡ tay check theo tên role (`role === 'ADMIN'`) | Quy tắc lint hoặc checklist review: chỉ dùng `hasPermission(PERMISSIONS.X)` với hằng số từ `packages/shared`. |
| Coi việc ẩn ở FE là bảo mật thật | Đã ghi rõ: ẩn ở FE chỉ là UX. Mỗi test e2e check việc ẩn cũng đồng thời assert backend trả 403. |
| Over-engineer design system | Dùng mặc định shadcn/ui; không tự xây component library riêng (YAGNI). |

## Cân nhắc bảo mật
- Không token nào trong web storage → XSS không thể lấy cắp credential sống lâu (research §D).
- Cookie refresh là `httpOnly; Secure; SameSite=Strict` — do backend set, JS không bao giờ đụng được.
- CSP chặt trong build production (không `unsafe-inline`); Vite build hỗ trợ asset có hash.
- Giá trị `.env` baked vào bundle FE **về bản chất là công khai** — chỉ nên có base URL của API ở đó.
  Không bao giờ đặt secret ở đây.
- Không log response API ra console trong build production (vì chứa dữ liệu công dân).

## Bước tiếp theo
Mở khóa Giai đoạn 07 (query UI) và Giai đoạn 08 (admin/history UI), có thể build song song bởi 2 dev.

## Câu hỏi chưa giải quyết
- Branding: logo công ty, bảng màu, tên app tiếng Việt — hỏi Egor.
- UI có cần hỗ trợ cả tiếng Anh ngoài tiếng Việt không, hay chỉ tiếng Việt? Đang giả định chỉ tiếng
  Việt; file i18n vẫn để ngỏ khả năng mở rộng với chi phí thấp.

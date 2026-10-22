# Giai đoạn 08 — Admin & History UI

## Liên kết ngữ cảnh
- [plan.md](plan.md) · [reference-screens-and-ux.md](reference-screens-and-ux.md) (S4-S7) · [reference-api-specification.md](reference-api-specification.md)
- Phụ thuộc vào Giai đoạn 06 (shell/auth). Backend từ Giai đoạn 03, 05.

## Tổng quan
- **Priority:** P2 (hướng tới admin; triển khai sau khi luồng tra cứu chính hoạt động)
- **Status:** completed
- **Effort:** 10h
- Các màn hình xem lịch sử tra cứu (spec f), quản trị user (spec b), quản lý role/permission (spec c),
  và audit log quản trị (spec g).

## Nhận định chính
- **Màn hình ma trận quyền là nơi thiết kế config-driven trở nên thấy được với khách hàng**: quyền
  `api:*` tự xuất hiện từ `config.json`, nên admin có thể cấp quyền truy cập datasource vừa thêm mà
  không cần developer can thiệp. Đáng để demo rõ ràng điều này.
- History UI phải **không** render filter theo user cho user chỉ có `view_own` — nhưng bảo vệ thật sự
  nằm ở việc backend ép phạm vi (Giai đoạn 05). UI chỉ tránh hiển thị control sẽ dẫn tới 403.
- Reset mật khẩu chỉ hiện mật khẩu tạm **một lần**. Thiết kế cho việc này: modal copy-to-clipboard, cảnh
  báo rõ ràng là sẽ không hiện lại, không log ở bất kỳ đâu.

## Yêu cầu
**Chức năng**
- History: bảng phân trang + filter (user / API / khoảng thời gian / trạng thái) + drawer chi tiết (spec f).
- Users: danh sách/tìm kiếm, tạo, sửa, khóa/mở khóa, gán role, reset mật khẩu (spec b).
- Roles: CRUD + checklist quyền; role hệ thống không xóa được.
- Audit log: bảng chỉ đọc kèm view so sánh trước/sau.

**Phi chức năng:** dialog xác nhận cho hành động nguy hiểm; mutation không optimistic (refetch sau khi
ghi — ưu tiên đúng đắn hơn mượt mà cho màn hình admin); định dạng ngày giờ `vi-VN`.

## Kiến trúc
```
apps/web/src/features/
├── history/
│   ├── HistoryPage.tsx        # filter + bảng
│   ├── HistoryFilters.tsx     # filter user chỉ render khi có history:view_all
│   └── HistoryDetailDrawer.tsx
└── admin/
    ├── users/  UsersPage.tsx, UserFormDialog.tsx, ResetPasswordDialog.tsx, AssignRolesDialog.tsx
    ├── roles/  RolesPage.tsx, RoleFormDialog.tsx, PermissionMatrix.tsx
    └── audit/  AuditLogPage.tsx, AuditDiffView.tsx
```
Mọi bảng đều dùng TanStack Table v8 (cùng dependency như Giai đoạn 07 — DRY, không thêm thư viện bảng thứ 2).

## File code liên quan
**Tạo mới:** các file trên + hook `apps/web/src/features/**/api.ts` (TanStack Query).
**Sửa:** route tree + `Sidebar.tsx` (Giai đoạn 06).
**Dùng lại:** `packages/shared/src/history-types.ts`, `permission-codes.ts`, các primitive shadcn từ Giai đoạn 06.

## Các bước triển khai
1. `HistoryPage`: danh sách TanStack Query phân trang phía server; cột = thời gian, user, API, tóm tắt điều kiện, trạng thái (chip: thành công/thất bại/bị từ chối), số bản ghi.
2. `HistoryFilters`: chọn datasource (từ `GET /datasources`), chọn khoảng ngày, chọn trạng thái; **chọn user chỉ render khi `hasPermission('history:view_all')`**.
3. `HistoryDetailDrawer`: tham số đã mask, request id upstream, thời lượng, thông báo lỗi, số bản ghi.
4. `UsersPage`: bảng tìm kiếm được, phân trang, có chip trạng thái; menu hành động theo dòng.
5. `UserFormDialog`: tạo/sửa (username, họ tên, email, role ban đầu). Username không đổi được sau khi tạo.
6. Hành động khóa/mở khóa có dialog xác nhận; thành công thì invalidate danh sách và hiện toast. Nội dung bằng tiếng Việt.
7. `ResetPasswordDialog`: gọi endpoint, hiển thị mật khẩu tạm 1 lần kèm copy-to-clipboard và cảnh báo rõ "sẽ không hiển thị lại"; không bao giờ ghi ra console/storage.
8. `AssignRolesDialog`: multi-select role; thay thế toàn bộ tập role; cảnh báo khi gỡ ADMIN cuối cùng (vẫn cần chặn ở server — không dựa vào cảnh báo dialog).
9. `RolesPage` + `RoleFormDialog`: CRUD; disable xóa với role `is_system`.
10. `PermissionMatrix`: checklist toàn bộ quyền từ `GET /admin/permissions`, gom theo `kind` (API vs Feature), quyền API gắn nhãn theo tên datasource. Lưu → `PUT /admin/roles/:id/permissions`.
11. `AuditLogPage` + `AuditDiffView`: filter theo người thực hiện/hành động/ngày; diff JSON trước/sau mở rộng được, render dạng text (không bao giờ dùng HTML).
12. Test: user `view_own` không thấy filter user; lưu quyền role round-trip đúng; reset mật khẩu chỉ hiện đúng 1 lần; hành động nguy hiểm cần xác nhận; quyền `api:*` thêm qua config xuất hiện trong ma trận.

## Danh sách việc cần làm
- [x] Bảng `HistoryPage` + phân trang phía server
- [x] `HistoryFilters` (filter user gate theo `history:view_all`)
- [x] `HistoryDetailDrawer` (triển khai thành `HistoryDetailDialog` — dạng dialog, không phải slide-over; cùng thông tin)
- [x] `UsersPage` danh sách/tìm kiếm + hành động theo dòng
- [x] `UserFormDialog` (tạo/sửa)
- [x] Khóa/mở khóa có xác nhận + invalidate
- [x] `ResetPasswordDialog` (hiện 1 lần + copy) — `ResetPasswordResultDialog`
- [x] `AssignRolesDialog` (+ cảnh báo admin cuối cùng)
- [x] `RolesPage` + `RoleFormDialog` (bảo vệ role hệ thống)
- [x] `PermissionMatrix` gom nhóm API/Feature — `PermissionMatrixDialog`
- [x] `AuditLogPage` + `AuditDiffView` — `AuditDiffDialog`
- [x] Test gồm filter gate theo quyền + quyền nguồn từ config trong ma trận

## Tiêu chí hoàn thành
- Admin thực hiện được mọi hành động spec (b) end-to-end từ UI, mỗi hành động tạo 1 dòng `audit_logs`.
- Admin filter được history theo user, API và khoảng thời gian, mở được chi tiết 1 lần tra cứu (spec f).
- User `view_own` chỉ thấy history của chính mình, không có control filter theo user.
- Datasource thêm vào `config.json` xuất hiện trong ma trận quyền sau restart, cấp được quyền mà không cần deploy.
- Khóa user từ UI kết thúc phiên của user đó trong vòng TTL của access token.

## Đánh giá rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| Admin lỡ tay gỡ ADMIN cuối cùng và khóa mọi người | Ràng buộc phía server (từ chối thao tác) **cộng** cảnh báo UI. Phía server mới là fix thật. |
| Mật khẩu tạm bị lộ qua thói quen console/log/screenshot | Chỉ hiện 1 lần, copy-to-clipboard, cảnh báo rõ ràng, không bao giờ log. Cân nhắc bắt đổi ở lần đăng nhập đầu (đã ép qua `must_change_password`). |
| Bảng history chậm khi log tăng nhiều | Phân trang phía server + index ERD; filter ngày mặc định về khung gần đây thay vì "toàn bộ thời gian". |
| Màn hình admin bị làm quá tay (import hàng loạt, export CSV, biểu đồ) | Ngoài phạm vi. Chỉ build đúng spec (b)/(f). |

## Cân nhắc bảo mật
- Mỗi màn hình admin được gate bởi `RequirePermission`, và mỗi endpoint re-check phía server (spec g).
- Diff trước/sau của audit được render dạng text đã escape — không bao giờ dùng `dangerouslySetInnerHTML`.
- Chi tiết history hiện tham số nhạy cảm đã **mask**, khớp với cách lưu (Giai đoạn 05).
- Không export hàng loạt history hay dữ liệu user ở phase này — đó là quyết định về quản trị dữ liệu,
  không phải quyết định kỹ thuật.
- Dialog xác nhận cho khóa/xóa/đổi role để giảm thay đổi quyền do nhầm lẫn.

## Bước tiếp theo
Mở khóa cho Giai đoạn 09. Song song với Giai đoạn 07 (file tách biệt).

## Ghi chú triển khai (bổ sung sau)
- **Sai khác — bổ sung backend nhỏ dạng cộng thêm.** `GET/POST /admin/users[/:id]` và
  `GET/POST /admin/roles[/:id]` không bao giờ trả về role/permission hiện có của đối tượng
  (`UsersService`/`RolesService` không eager-load `userRoles.role` / `rolePermissions.permission`).
  Cả `AssignRolesDialog` lẫn `PermissionMatrixDialog` đều làm `PUT` kiểu full-replace, nên nếu không có
  tập hiện tại, các dialog này sẽ âm thầm xóa mất quyền/role đã gán khi lưu. Đã fix bằng thay đổi chỉ
  mang tính bổ sung (thêm field tùy chọn `roles`/`permissionCodes` mới, không đụng field/hành vi nào đã
  có): `apps/api/src/users/user-view.util.ts`, `apps/api/src/users/users.service.ts`,
  `apps/api/src/roles/roles.service.ts`. Đã verify qua `pnpm --filter api test` (24/24 pass) + curl
  thật trước/sau.
- Chi tiết history là `Dialog` căn giữa, không phải drawer bên hông — cùng thông tin, đơn giản hơn cho
  quy mô này.
- `AuditLogEntry.actorUserId` là UUID thô (backend không join username người thực hiện); chấp nhận được
  theo đúng hợp đồng API đã ghi, không phải điểm chặn.

## Câu hỏi chưa giải quyết
- `history:view_own` có nên mặc định cấp cho mọi user không? (Cũng đang treo ở Giai đoạn 03; spec f
  ghi *"nếu được cấp quyền"*.)
- Có ai cần export CSV lịch sử/audit cho báo cáo tuân thủ không? Hỏi Egor trước khi làm.
- Admin có nên *xóa* được user, hay chỉ vô hiệu hóa? Spec chỉ liệt kê khóa/mở khóa — đang giả định
  **không xóa cứng** (tốt hơn cho tính toàn vẹn của audit). Cần xác nhận.

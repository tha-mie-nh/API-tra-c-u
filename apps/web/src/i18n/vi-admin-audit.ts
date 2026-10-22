/**
 * Vietnamese chrome strings for the read-only "Nhật ký quản trị" audit log
 * screen (Phase 08, reference-screens-and-ux.md S7). Merged into
 * `vi.admin.audit` by `vi.ts`.
 */
export const viAdminAudit = {
  title: 'Nhật ký quản trị',
  columnTime: 'Thời gian',
  columnActor: 'Người thực hiện',
  columnAction: 'Hành động',
  columnTarget: 'Đối tượng',
  columnActions: 'Chi tiết',
  emptyList: 'Không có nhật ký nào.',
  viewDiff: 'Xem chi tiết',
  diffTitle: 'Chi tiết thay đổi',
  diffBefore: 'Trước khi thay đổi',
  diffAfter: 'Sau khi thay đổi',
  diffEmpty: 'Không có dữ liệu',
  filterActor: 'Người thực hiện (User ID)',
  filterTargetType: 'Loại đối tượng',
  filterAll: 'Tất cả',
  targetTypeUser: 'Người dùng',
  targetTypeRole: 'Vai trò',
} as const;

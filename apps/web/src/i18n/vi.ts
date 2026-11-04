import { viAdminUsers } from './vi-admin-users';
import { viAdminRoles } from './vi-admin-roles';
import { viAdminAudit } from './vi-admin-audit';
import { viAdminDatasources } from './vi-admin-datasources';
import { viHistory } from './vi-history';

/**
 * All Vietnamese chrome strings (layout, auth, errors) live here — data
 * labels (form fields, table columns) come from `config.json` via the
 * backend instead (see reference-screens-and-ux.md "Cross-cutting UX
 * rules"). Do not hardcode Vietnamese string literals inside components.
 *
 * Phase 08 (`vi.history`, `vi.admin.*`) is split into `i18n/vi-*.ts` modules
 * to keep this file under the project's 200-line guideline; they're merged
 * back in below so every screen still imports the single `{ vi }` object.
 */
export const vi = {
  app: {
    title: 'APP Tra cứu dữ liệu',
  },
  common: {
    loading: 'Đang tải...',
    save: 'Lưu',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    logout: 'Đăng xuất',
    back: 'Quay lại',
    comingSoon: 'Chức năng đang được xây dựng, sẽ có trong bản cập nhật tiếp theo.',
    notFoundTitle: 'Không tìm thấy trang',
    notFoundBody: 'Đường dẫn bạn truy cập không tồn tại.',
    goHome: 'Về trang chủ',
  },
  nav: {
    lookupSection: 'Tra cứu',
    history: 'Lịch sử tra cứu',
    adminSection: 'Quản trị',
    adminUsers: 'Người dùng',
    adminRoles: 'Vai trò & quyền',
    adminAudit: 'Nhật ký quản trị',
    adminDatasources: 'Nguồn dữ liệu',
    home: 'Trang chủ',
  },
  auth: {
    loginTitle: 'Đăng nhập',
    loginSubtitle: 'Đăng nhập để sử dụng hệ thống tra cứu dữ liệu',
    username: 'Tên đăng nhập',
    password: 'Mật khẩu',
    submit: 'Đăng nhập',
    submitting: 'Đang đăng nhập...',
    usernameRequired: 'Vui lòng nhập tên đăng nhập',
    passwordRequired: 'Vui lòng nhập mật khẩu',
    errorInvalidCredentials: 'Sai tên đăng nhập hoặc mật khẩu',
    errorAccountLocked: 'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên',
    errorAccountDisabled: 'Tài khoản đã bị vô hiệu hóa',
    errorRateLimited: 'Bạn đã thử đăng nhập quá nhiều lần, vui lòng thử lại sau',
    errorGeneric: 'Đăng nhập thất bại, vui lòng thử lại',
    changePasswordTitle: 'Đổi mật khẩu',
    changePasswordSubtitle: 'Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống',
    newPassword: 'Mật khẩu mới',
    confirmPassword: 'Xác nhận mật khẩu mới',
    passwordMinLength: 'Mật khẩu phải có ít nhất 12 ký tự',
    currentPassword: 'Mật khẩu hiện tại',
    passwordMismatch: 'Mật khẩu xác nhận không khớp',
    changePasswordSubmit: 'Đổi mật khẩu',
    changePasswordSuccess: 'Đổi mật khẩu thành công',
    sessionExpired: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    logoutSuccess: 'Đã đăng xuất',
    forgotPasswordLink: 'Quên mật khẩu?',
    forgotPasswordTitle: 'Quên mật khẩu',
    forgotPasswordSubtitle: 'Nhập tên đăng nhập, quản trị viên sẽ duyệt và cấp lại mật khẩu tạm cho bạn',
    forgotPasswordSubmit: 'Gửi yêu cầu',
    forgotPasswordSubmitting: 'Đang gửi...',
    forgotPasswordSuccess:
      'Nếu tài khoản tồn tại, yêu cầu đặt lại mật khẩu đã được ghi nhận. Vui lòng chờ quản trị viên xử lý và thông báo lại cho bạn.',
    backToLogin: 'Quay lại đăng nhập',
  },
  errors: {
    forbiddenTitle: 'Không có quyền truy cập',
    forbiddenBody: 'Bạn không có quyền truy cập chức năng này. Vui lòng liên hệ quản trị viên nếu đây là nhầm lẫn.',
    networkError: 'Không thể kết nối tới máy chủ, vui lòng kiểm tra kết nối mạng',
    unexpectedTitle: 'Đã có lỗi xảy ra',
    unexpectedError: 'Đã có lỗi xảy ra, vui lòng thử lại',
  },
  // Phase 07 — chrome strings for the dynamic query/timeline pages. Field
  // labels themselves always come from `config.json` (`ClientDatasource`),
  // never hardcoded here (reference-screens-and-ux.md "Cross-cutting UX rules").
  query: {
    searchFormTitle: 'Điều kiện tra cứu',
    submit: 'Tra cứu',
    submitting: 'Đang tra cứu...',
    reset: 'Đặt lại',
    selectPlaceholder: '— Không chọn —',
    emptyResults: 'Không tìm thấy kết quả phù hợp với điều kiện tra cứu.',
    noPhotos: 'Không có ảnh nào khớp với điều kiện tra cứu.',
    imageLoadError: 'Không tải được ảnh.',
    truncationNotice: (limit: number) =>
      `Kết quả đã được giới hạn ở ${limit} bản ghi. Hãy thu hẹp điều kiện tra cứu để xem đầy đủ.`,
    errorValidation: 'Dữ liệu nhập không hợp lệ, vui lòng kiểm tra lại các trường được đánh dấu.',
    errorForbidden: 'Bạn không có quyền tra cứu chức năng này.',
    errorUpstream: 'Nguồn dữ liệu tạm thời không phản hồi, vui lòng thử lại sau.',
    errorRateLimited: 'Bạn đã tra cứu quá nhiều lần trong thời gian ngắn, vui lòng thử lại sau.',
    errorGeneric: 'Đã có lỗi xảy ra khi tra cứu, vui lòng thử lại.',
    previousPage: 'Trang trước',
    nextPage: 'Trang sau',
    pageIndicator: (current: number, total: number, count: number) => `Trang ${current}/${total} — ${count} bản ghi`,
  },
  // Phase 08 — admin (users/roles/audit) + history screens. Chrome strings
  // only; table/form data labels still come from the backend where relevant.
  adminCommon: {
    confirmTitle: 'Xác nhận thao tác',
    close: 'Đóng',
    saving: 'Đang lưu...',
    creating: 'Đang tạo...',
    page: 'Trang',
    of: 'trên',
    apply: 'Áp dụng',
    reset: 'Đặt lại',
    total: (count: number) => `${count} kết quả`,
    genericError: 'Đã có lỗi xảy ra, vui lòng thử lại',
  },
  admin: {
    users: viAdminUsers,
    roles: viAdminRoles,
    audit: viAdminAudit,
    datasources: viAdminDatasources,
  },
  history: viHistory,
} as const;

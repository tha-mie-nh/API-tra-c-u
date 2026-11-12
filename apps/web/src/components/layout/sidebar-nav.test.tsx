import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FEATURE_PERMISSION_CODES } from '@shared/index';
import { useAuthStore } from '@/lib/auth-store';
import { SidebarNav } from './sidebar-nav';

vi.mock('@/features/datasources/use-datasources', () => ({ useDatasources: vi.fn() }));
import { useDatasources } from '@/features/datasources/use-datasources';

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarNav />
    </MemoryRouter>,
  );
}

function setPermissions(permissions: string[]) {
  useAuthStore.setState({
    accessToken: 'tok',
    status: 'authenticated',
    user: { id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions, roles: [] },
  });
}

describe('SidebarNav', () => {
  beforeEach(() => {
    vi.mocked(useDatasources).mockReturnValue({ data: [], isLoading: false } as never);
  });

  it('hides Tra cứu / Lịch sử / Quản trị for a user with no matching permissions', () => {
    setPermissions([]);
    renderSidebar();

    expect(screen.queryByText('Tra cứu')).not.toBeInTheDocument();
    expect(screen.queryByText('Lịch sử tra cứu')).not.toBeInTheDocument();
    expect(screen.queryByText('Quản trị')).not.toBeInTheDocument();
  });

  it('shows the lookup section only when a datasource is present', () => {
    vi.mocked(useDatasources).mockReturnValue({
      data: [{ code: 'CITIZEN_BASIC', name: 'Thông tin cơ bản', type: 'info', input: { fields: [] }, output: { fields: [] }, limits: { maxResults: 100, pageSize: 20 } }],
      isLoading: false,
    } as never);
    setPermissions(['api:citizen_basic']);

    renderSidebar();
    expect(screen.getByText('Thông tin cơ bản')).toBeInTheDocument();
  });

  it('shows Lịch sử tra cứu only for history:view_own/history:view_all holders', () => {
    setPermissions([FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN]);
    renderSidebar();
    expect(screen.getByRole('link', { name: /Lịch sử tra cứu/ })).toBeInTheDocument();
  });

  it('shows only the admin sub-item matching the held permission', () => {
    setPermissions([FEATURE_PERMISSION_CODES.ADMIN_USERS]);
    renderSidebar();

    expect(screen.getByText('Người dùng')).toBeInTheDocument();
    expect(screen.queryByText('Vai trò & quyền')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhật ký quản trị')).not.toBeInTheDocument();
  });

  it('shows Thống kê tra cứu only for admin:query_stats holders', () => {
    setPermissions([FEATURE_PERMISSION_CODES.ADMIN_QUERY_STATS]);
    const { unmount } = renderSidebar();
    expect(screen.getByRole('link', { name: /Thống kê tra cứu/ })).toBeInTheDocument();
    unmount();

    setPermissions([FEATURE_PERMISSION_CODES.ADMIN_USERS]);
    renderSidebar();
    expect(screen.queryByText('Thống kê tra cứu')).not.toBeInTheDocument();
  });

  it('shows Phân tích tra cứu only for history:view_all holders', () => {
    setPermissions([FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]);
    const { unmount } = renderSidebar();
    expect(screen.getByRole('link', { name: /Phân tích tra cứu/ })).toHaveAttribute('href', '/quan-tri/phan-tich-tra-cuu');
    unmount();

    setPermissions([FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN, FEATURE_PERMISSION_CODES.ADMIN_USERS]);
    renderSidebar();
    expect(screen.queryByText('Phân tích tra cứu')).not.toBeInTheDocument();
  });
});

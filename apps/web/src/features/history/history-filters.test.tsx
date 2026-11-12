import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES } from '@shared/index';
import { useAuthStore } from '@/lib/auth-store';
import { HistoryFilters } from './history-filters';

// Radix Checkbox measures itself with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

vi.mock('./history-api', async () => {
  const actual = await vi.importActual<typeof import('./history-api')>('./history-api');
  return { ...actual, fetchHistoryDatasourceOptions: vi.fn(() => Promise.resolve([])) };
});

function renderFilters() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HistoryFilters filters={{}} onApply={vi.fn()} />
    </QueryClientProvider>,
  );
}

/** Phase 08 step 12 requirement: "view_own user sees no user filter" — the
 * real protection is server-side forced scoping (Phase 05), this only
 * verifies the UI doesn't render a control that would 403 for such a user. */
describe('HistoryFilters', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'tok', status: 'authenticated', user: null });
  });

  it('hides the user filter for a history:view_own-only user', () => {
    useAuthStore.setState({
      user: { id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions: [FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN], roles: [] },
    });

    renderFilters();

    expect(screen.queryByLabelText('Tên đăng nhập')).not.toBeInTheDocument();
  });

  it('shows the user filter for a history:view_all holder', () => {
    useAuthStore.setState({
      user: { id: '1', username: 'u', fullName: 'U', email: null, mustChangePassword: false, permissions: [FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL], roles: [] },
    });

    renderFilters();

    expect(screen.getByLabelText('Tên đăng nhập')).toBeInTheDocument();
  });
});

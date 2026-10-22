import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminRole, PermissionCatalogItem } from '@shared/index';
import { PermissionMatrixDialog } from './permission-matrix-dialog';

const setRolePermissions = vi.fn().mockResolvedValue({ id: 'role-1', permissionCodes: ['history:view_own', 'api:citizen_new'] });
const fetchPermissionCatalog = vi.fn();

vi.mock('./roles-api', () => ({
  fetchPermissionCatalog: (...args: unknown[]) => fetchPermissionCatalog(...args),
  setRolePermissions: (...args: [string, string[]]) => setRolePermissions(...args),
}));

const role: AdminRole = {
  id: 'role-1',
  code: 'OPERATOR',
  name: 'Operator',
  description: null,
  isSystem: false,
  createdAt: '2026-01-01T00:00:00Z',
  permissionCodes: ['history:view_own'],
};

const catalog: PermissionCatalogItem[] = [
  { id: 'p1', code: 'history:view_own', name: 'Xem lịch sử của mình', kind: 'FEATURE', createdAt: '2026-01-01T00:00:00Z' },
  // A datasource added to config.json after this role was created — must
  // still show up in the matrix (reference-screens-and-ux.md S6).
  { id: 'p2', code: 'api:citizen_new', name: 'API: Tra cứu công dân mới', kind: 'API', createdAt: '2026-01-02T00:00:00Z' },
];

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PermissionMatrixDialog role={role} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PermissionMatrixDialog', () => {
  it('shows a config-sourced api:* permission and round-trips the save with the current + newly checked codes', async () => {
    fetchPermissionCatalog.mockResolvedValue(catalog);
    const user = userEvent.setup();
    renderDialog();

    // The new API permission (auto-synced from config.json, phase-04) is visible.
    expect(await screen.findByText('API: Tra cứu công dân mới')).toBeInTheDocument();

    // Pre-checked from role.permissionCodes.
    const ownHistoryCheckbox = screen.getByRole('checkbox', { name: 'Xem lịch sử của mình' });
    expect(ownHistoryCheckbox).toHaveAttribute('data-state', 'checked');

    await user.click(screen.getByRole('checkbox', { name: 'API: Tra cứu công dân mới' }));
    await user.click(screen.getByRole('button', { name: 'Lưu phân quyền' }));

    expect(setRolePermissions).toHaveBeenCalledWith('role-1', ['history:view_own', 'api:citizen_new']);
  });
});

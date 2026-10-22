import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog';

/** Phase 08 step 12 requirement: "destructive actions require confirmation" —
 * `onConfirm` must never fire without an explicit click on the confirm button. */
describe('ConfirmDialog', () => {
  it('does not call onConfirm just from being open, only after the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Khóa tài khoản người dùng?"
        description="mô tả"
        destructive
        onConfirm={onConfirm}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel does not call onConfirm', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConfirmDialog open onOpenChange={onOpenChange} title="Xóa vai trò?" description="mô tả" destructive onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

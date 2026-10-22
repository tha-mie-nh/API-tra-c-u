import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordResultDialog } from './reset-password-result-dialog';

/** Phase 08 step 12 requirement: "reset-password shows the password exactly
 * once" — visible while `result` is set, copy-to-clipboard works, and once
 * the caller clears `result` (e.g. after the admin closes it) it is gone. */
describe('ResetPasswordResultDialog', () => {
  it('shows the temp password once and copies it to the clipboard', async () => {
    const user = userEvent.setup();
    // Defined AFTER `userEvent.setup()` — user-event installs its own
    // clipboard stub during setup, which would otherwise clobber this mock.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { rerender } = render(
      <ResetPasswordResultDialog result={{ username: 'e2e_test_user', tempPassword: 'Tmp$ecret123' }} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText('Tmp$ecret123')).toBeInTheDocument();
    expect(screen.getByText(/sẽ không hiển thị lại|chỉ hiển thị một lần/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sao chép/ }));
    expect(writeText).toHaveBeenCalledWith('Tmp$ecret123');

    // Caller clears the result once acknowledged — the password must not be recoverable.
    rerender(<ResetPasswordResultDialog result={null} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Tmp$ecret123')).not.toBeInTheDocument();
  });
});

import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTextInput } from './date-text-input';

/** Wraps the controlled component the way `field-registry.tsx`'s RHF
 * `Controller` does — state lives outside, `onChange` feeds back in. */
function ControlledHarness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTextInput id="dob" invalid={false} value={value} onChange={setValue} onBlur={() => {}} />
      <output data-testid="iso-value">{value}</output>
      <button type="button" onClick={() => setValue('')}>
        Đặt lại
      </button>
    </>
  );
}

describe('DateTextInput', () => {
  it('masks typed digits into dd-mm-yyyy and emits ISO yyyy-mm-dd once complete', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initial="" />);

    await user.type(screen.getByRole('textbox'), '31121999');

    expect(screen.getByRole('textbox')).toHaveValue('31-12-1999');
    expect(screen.getByTestId('iso-value')).toHaveTextContent('1999-12-31');
  });

  it('renders a pre-filled ISO value as dd-mm-yyyy', () => {
    render(<ControlledHarness initial="2026-03-02" />);
    expect(screen.getByRole('textbox')).toHaveValue('02-03-2026');
  });

  it('keeps an incomplete, in-progress date on screen instead of wiping it (own onChange must not self-reset)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initial="" />);

    await user.type(screen.getByRole('textbox'), '3112');

    expect(screen.getByRole('textbox')).toHaveValue('31-12');
    expect(screen.getByTestId('iso-value')).toHaveTextContent('');
  });

  it('clears the displayed text when the value is reset externally', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness initial="2026-03-02" />);

    await user.click(screen.getByRole('button', { name: 'Đặt lại' }));

    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

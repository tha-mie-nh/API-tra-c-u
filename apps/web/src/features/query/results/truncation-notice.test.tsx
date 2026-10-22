import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TruncationNotice } from './truncation-notice';

describe('TruncationNotice', () => {
  it('renders nothing when the result set was not truncated', () => {
    const { container } = render(
      <TruncationNotice page={{ page: 1, pageSize: 20, total: 5, returned: 5, limit: 100, truncated: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the configured limit when the result set was truncated (spec g)', () => {
    render(<TruncationNotice page={{ page: 1, pageSize: 20, total: 500, returned: 20, limit: 100, truncated: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('100 bản ghi');
  });
});

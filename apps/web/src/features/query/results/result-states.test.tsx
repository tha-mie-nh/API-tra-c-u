import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState, ErrorState, LoadingSkeleton } from './result-states';

describe('ResultStates', () => {
  it('EmptyState and ErrorState render distinguishable messages', () => {
    const { unmount } = render(<EmptyState />);
    expect(screen.getByText('Không tìm thấy kết quả phù hợp với điều kiện tra cứu.')).toBeInTheDocument();
    unmount();

    render(<ErrorState message="Nguồn dữ liệu tạm thời không phản hồi, vui lòng thử lại sau." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nguồn dữ liệu tạm thời không phản hồi');
  });

  it('LoadingSkeleton marks itself busy for assistive tech', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

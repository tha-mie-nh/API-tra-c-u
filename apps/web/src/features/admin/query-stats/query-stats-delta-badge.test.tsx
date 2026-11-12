import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryStatsDeltaBadge, deltaColorClass } from './query-stats-delta-badge';

describe('QueryStatsDeltaBadge', () => {
  it('shows em dash when previous is 0 (null delta)', () => {
    render(<QueryStatsDeltaBadge current={5} previous={0} tone="down" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
  it('shows em dash when previous is missing', () => {
    render(<QueryStatsDeltaBadge current={5} previous={undefined} tone="up" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
  it('shows signed percent', () => {
    render(<QueryStatsDeltaBadge current={150} previous={100} tone="up" />);
    expect(screen.getByText(/\+50%/)).toBeInTheDocument();
  });
  it('error increase is red, decrease green; neutral muted', () => {
    expect(deltaColorClass(20, 'down')).toContain('destructive');
    expect(deltaColorClass(-20, 'down')).toContain('emerald');
    expect(deltaColorClass(20, 'up')).toContain('emerald');
    expect(deltaColorClass(20, 'neutral')).toContain('muted');
  });
});

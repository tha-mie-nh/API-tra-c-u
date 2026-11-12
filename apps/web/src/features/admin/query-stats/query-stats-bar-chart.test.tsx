import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QueryStatsBucket } from '@shared/index';
import { QueryStatsBarChart, bucketLabel } from './query-stats-bar-chart';

const mk = (bucket: string, requests: number, errors = 0): QueryStatsBucket => ({
  bucket, requests, answered: requests - errors, gap: errors, success: requests - errors, empty: 0,
  failed: errors, denied: 0, errors, records: 0, avgDurationMs: null,
});

describe('bucketLabel', () => {
  it('formats by granularity', () => {
    expect(bucketLabel('2026-11-11T09', 'hour')).toBe('09h');
    expect(bucketLabel('2026-11-11', 'day')).toBe('11');
    expect(bucketLabel('2026-11', 'month')).toBe('11');
  });
});

describe('QueryStatsBarChart', () => {
  it('renders one bar per bucket with labels', () => {
    render(<QueryStatsBarChart buckets={[mk('2026-11-01', 5, 1), mk('2026-11-02', 10)]} granularity="day" />);
    expect(screen.getAllByTestId('qs-bar')).toHaveLength(2);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
  });
  it('does not divide by zero when all buckets are 0', () => {
    render(<QueryStatsBarChart buckets={[mk('2026-11-01', 0), mk('2026-11-02', 0)]} granularity="day" />);
    expect(screen.getAllByTestId('qs-bar')).toHaveLength(2);
    expect(document.body.innerHTML).not.toContain('NaN');
  });
});

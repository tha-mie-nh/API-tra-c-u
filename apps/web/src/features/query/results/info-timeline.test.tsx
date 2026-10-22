import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QueryEnvelope } from '@shared/index';
import { InfoTimeline } from './info-timeline';

const envelope: QueryEnvelope = {
  datasource: 'DS_SAMPLE',
  type: 'info',
  requestId: 'r1',
  columns: [
    { name: 'fullName', label: 'Họ và tên', type: 'string' },
    { name: 'recordedAt', label: 'Thời điểm ghi nhận', type: 'datetime' },
  ],
  timestampField: 'recordedAt',
  groups: [
    {
      identity: '001099001234',
      label: 'Nguyễn Văn A',
      records: [
        { fullName: 'Nguyễn Văn A', recordedAt: '2026-03-02T10:00:00Z' },
        { fullName: 'Nguyễn Văn A', recordedAt: '2026-03-01T10:00:00Z' },
      ],
    },
    {
      identity: '001099009999',
      label: '001099009999',
      records: [{ fullName: undefined, recordedAt: '2026-02-01T10:00:00Z' }],
    },
  ],
  page: { page: 1, pageSize: 20, total: 3, returned: 3, limit: 100, truncated: false },
  tookMs: 10,
};

describe('InfoTimeline', () => {
  it('renders one card per group, with the configured timestamp field shown per record', () => {
    render(<InfoTimeline envelope={envelope} />);

    expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
    expect(screen.getByText('001099009999')).toBeInTheDocument();
    // 2 records for group 1 + 1 for group 2 = 3 prominent timestamp lines
    // (just the time value, no field label — review feedback: "cột chính
    // chỉ để là thời gian").
    expect(screen.getAllByText(/\d{2}-\d{2}-2026/)).toHaveLength(3);
  });

  it('falls back to one group per record when a group has no distinct label', () => {
    render(<InfoTimeline envelope={envelope} />);
    // group.label === group.identity for the second group (no fullName).
    expect(screen.getAllByText('001099009999')).toHaveLength(1);
  });
});

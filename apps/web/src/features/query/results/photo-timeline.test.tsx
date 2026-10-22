import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QueryEnvelope } from '@shared/index';
import { PhotoTimeline } from './photo-timeline';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetchImageBlob: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' })) };
});

const envelope: QueryEnvelope = {
  datasource: 'DS_PHOTO_SAMPLE',
  type: 'image',
  requestId: 'r1',
  columns: [
    { name: 'recordId', label: 'Mã ảnh', type: 'string' },
    { name: 'capturedAt', label: 'Thời điểm chụp', type: 'datetime' },
  ],
  timestampField: 'capturedAt',
  groups: [
    {
      identity: '001099001234',
      label: '001099001234',
      records: [
        { recordId: 'photo-1', capturedAt: '2026-03-02T10:00:00Z' },
        { recordId: 'photo-2', capturedAt: '2026-03-01T10:00:00Z' },
        { recordId: 'photo-3', capturedAt: '2026-02-01T10:00:00Z' },
      ],
    },
  ],
  page: { page: 1, pageSize: 24, total: 3, returned: 3, limit: 50, truncated: false },
  tookMs: 5,
};

describe('PhotoTimeline', () => {
  it('renders EVERY matching photo with its own update-timestamp caption (spec a)', async () => {
    render(<PhotoTimeline envelope={envelope} code="DS_PHOTO_SAMPLE" />);

    const photoButtons = await screen.findAllByRole('button');
    expect(photoButtons).toHaveLength(3);
    expect(screen.getAllByText(/\d{2}-\d{2}-2026/)).toHaveLength(3);
  });

  it('shows a "no photos" message for a group with no image-bearing records', () => {
    const noPhotoEnvelope: QueryEnvelope = {
      ...envelope,
      groups: [{ identity: '001099009999', label: '001099009999', records: [] }],
    };
    render(<PhotoTimeline envelope={noPhotoEnvelope} code="DS_PHOTO_SAMPLE" />);
    expect(screen.getByText('Không có ảnh nào khớp với điều kiện tra cứu.')).toBeInTheDocument();
  });
});

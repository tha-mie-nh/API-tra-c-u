import { describe, it, expect } from 'vitest';
import type { QueryLogDetail } from '@shared/index';
import { buildRelatedLinks } from './history-detail-related-links';

const detail = { userId: 'u1', datasourceCode: 'ds1', ip: '2001:db8::1', errorCode: null } as QueryLogDetail;

describe('buildRelatedLinks insights links', () => {
  it('adds user + IP activity links (IPv6 encoded) only with view_all', () => {
    const tos = buildRelatedLinks(detail, true).map((l) => l.to);
    expect(tos).toContain('/quan-tri/phan-tich-tra-cuu/nguoi-dung/u1');
    expect(tos).toContain('/quan-tri/phan-tich-tra-cuu/ip/2001%3Adb8%3A%3A1');
    expect(buildRelatedLinks(detail, false)).toEqual([]);
  });
});

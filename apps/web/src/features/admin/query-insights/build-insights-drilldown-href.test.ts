import { describe, it, expect } from 'vitest';
import { historyHref, ipActivityPath, offHoursHref, spikeDayHref, userActivityPath } from './build-insights-drilldown-href';

const filter = { from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z', datasourceCode: 'ds1' };
const q = (href: string) => new URLSearchParams(href.split('?')[1]);

describe('insights drill-down hrefs', () => {
  it('historyHref keeps range + datasource and adds exact filters', () => {
    const href = historyHref(filter, { userId: 'u1', status: 'failed' });
    expect(href.startsWith('/lich-su?')).toBe(true);
    expect(Object.fromEntries(q(href))).toEqual({ ...filter, userId: 'u1', status: 'failed' });
  });
  it('off-hours drill is exact: userId + offHours=true + same range', () => {
    expect(Object.fromEntries(q(offHoursHref(filter, 'u1')))).toEqual({ ...filter, userId: 'u1', offHours: 'true' });
  });
  it('spike drill covers exactly one VN day', () => {
    const p = q(spikeDayHref('u1', '2026-11-10'));
    expect(p.get('from')).toBe('2026-11-09T17:00:00.000Z');
    expect(p.get('to')).toBe('2026-11-10T17:00:00.000Z');
    expect(p.get('userId')).toBe('u1');
  });
  it('encodes IPv6 and user ids in activity paths', () => {
    expect(ipActivityPath('2001:db8::1', 'from=a')).toBe('/quan-tri/phan-tich-tra-cuu/ip/2001%3Adb8%3A%3A1?from=a');
    expect(userActivityPath('u 1', '')).toBe('/quan-tri/phan-tich-tra-cuu/nguoi-dung/u%201');
  });
});

import { resolveQueryStatsRange } from './query-stats-date-range.util';
import { resolvePreviousWindow } from './query-stats-previous-range.util';
import { queryStatsDeltaPct } from '@app/shared';

const NOW = new Date('2026-11-12T05:00:00Z'); // 12:00 VN, 12-11
const prev = (preset: Parameters<typeof resolveQueryStatsRange>[0]['preset'], now = NOW, extra = {}) =>
  resolvePreviousWindow(resolveQueryStatsRange({ preset, ...extra }, now), now);

describe('resolvePreviousWindow', () => {
  it('today: same elapsed time of yesterday', () => {
    expect(prev('today')).toEqual({ from: '2026-11-10T17:00:00.000Z', to: '2026-11-11T05:00:00.000Z' });
  });
  it('yesterday: the day before', () => {
    expect(prev('yesterday')).toEqual({ from: '2026-11-09T17:00:00.000Z', to: '2026-11-10T17:00:00.000Z' });
  });
  it('this_month: elapsed days of last month', () => {
    expect(prev('this_month')).toEqual({ from: '2026-09-30T17:00:00.000Z', to: '2026-10-12T05:00:00.000Z' });
  });
  it('this_month: capped at the current start when previous month is shorter', () => {
    const now = new Date('2026-03-31T05:00:00Z'); // 30+ days elapsed vs February (28 days)
    expect(prev('this_month', now)).toEqual({ from: '2026-01-31T17:00:00.000Z', to: '2026-02-28T17:00:00.000Z' });
  });
  it('this_year: elapsed part of last year', () => {
    expect(prev('this_year')).toEqual({ from: '2024-12-31T17:00:00.000Z', to: '2025-11-12T05:00:00.000Z' });
  });
  it('last_month: month before it (January edge)', () => {
    expect(prev('last_month')).toEqual({ from: '2026-08-31T17:00:00.000Z', to: '2026-09-30T17:00:00.000Z' });
    const jan = new Date('2026-01-15T05:00:00Z');
    expect(prev('last_month', jan)).toEqual({ from: '2025-10-31T17:00:00.000Z', to: '2025-11-30T17:00:00.000Z' });
  });
  it('rolling presets: same-length window right before', () => {
    expect(prev('last_7d')).toEqual({ from: '2026-10-29T17:00:00.000Z', to: '2026-11-05T17:00:00.000Z' });
    expect(prev('last_24h')).toEqual({ from: '2026-11-10T06:00:00.000Z', to: '2026-11-11T06:00:00.000Z' });
  });
  it('custom: same length before from', () => {
    expect(prev('custom', NOW, { from: '2026-03-10', to: '2026-03-14' })).toEqual({
      from: '2026-03-04T17:00:00.000Z',
      to: '2026-03-09T17:00:00.000Z',
    });
  });
});

describe('queryStatsDeltaPct', () => {
  it('is null when previous is 0, signed percent otherwise', () => {
    expect(queryStatsDeltaPct(5, 0)).toBeNull();
    expect(queryStatsDeltaPct(0, 0)).toBeNull();
    expect(queryStatsDeltaPct(150, 100)).toBe(50);
    expect(queryStatsDeltaPct(50, 100)).toBe(-50);
    expect(queryStatsDeltaPct(0, 100)).toBe(-100);
  });
});

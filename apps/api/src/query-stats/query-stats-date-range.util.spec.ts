import { listBucketKeys, resolveQueryStatsRange } from './query-stats-date-range.util';
import { queryStatsQuerySchema } from './dto/query-stats-query.dto';

// 2026-11-11T17:30Z == 2026-11-12 00:30 Vietnam time
const NOW = new Date('2026-11-11T17:30:00Z');

describe('resolveQueryStatsRange', () => {
  it('today uses the VN calendar day (already 12-11 in VN)', () => {
    const r = resolveQueryStatsRange({ preset: 'today' }, NOW);
    expect(r.from).toBe('2026-11-11T17:00:00.000Z');
    expect(r.to).toBe('2026-11-12T17:00:00.000Z');
    expect(r.granularity).toBe('hour');
  });

  it('yesterday', () => {
    const r = resolveQueryStatsRange({ preset: 'yesterday' }, NOW);
    expect(r.from).toBe('2026-11-10T17:00:00.000Z');
    expect(r.to).toBe('2026-11-11T17:00:00.000Z');
  });

  it('this_month / this_year boundaries', () => {
    const m = resolveQueryStatsRange({ preset: 'this_month' }, NOW);
    expect(m.from).toBe('2026-10-31T17:00:00.000Z');
    expect(m.to).toBe('2026-11-30T17:00:00.000Z');
    expect(m.granularity).toBe('day');
    const y = resolveQueryStatsRange({ preset: 'this_year' }, NOW);
    expect(y.from).toBe('2025-12-31T17:00:00.000Z');
    expect(y.to).toBe('2026-12-31T17:00:00.000Z');
    expect(y.granularity).toBe('month');
  });

  it('31-12 23:59 VN still belongs to that year; 00:00 on the 1st of next month rolls over', () => {
    const endOfYear = new Date('2026-12-31T16:59:00Z'); // 23:59 VN
    expect(resolveQueryStatsRange({ preset: 'this_year' }, endOfYear).to).toBe('2026-12-31T17:00:00.000Z');
    const newYear = new Date('2026-12-31T17:00:00Z'); // 00:00 VN 2027-01-01
    expect(resolveQueryStatsRange({ preset: 'this_year' }, newYear).from).toBe('2026-12-31T17:00:00.000Z');
    const monthStart = new Date('2026-11-30T17:00:00Z'); // 00:00 VN 12-01
    expect(resolveQueryStatsRange({ preset: 'this_month' }, monthStart).from).toBe('2026-11-30T17:00:00.000Z');
  });

  it('custom granularity by length', () => {
    const g = (from: string, to: string) => resolveQueryStatsRange({ preset: 'custom', from, to }, NOW).granularity;
    expect(g('2026-03-01', '2026-03-02')).toBe('hour');
    expect(g('2026-03-01', '2026-03-03')).toBe('day');
    expect(g('2026-01-01', '2026-03-31')).toBe('day'); // 90 days
    expect(g('2026-01-01', '2026-04-01')).toBe('month'); // 91 days
  });

  it('manual granularity overrides auto', () => {
    const r = resolveQueryStatsRange({ preset: 'last_7d', granularity: 'hour' }, NOW);
    expect(r.granularity).toBe('hour');
    expect(listBucketKeys(r)).toHaveLength(168);
  });

  it('last_7d / last_30d / last_90d = N VN calendar days including today', () => {
    const r7 = resolveQueryStatsRange({ preset: 'last_7d' }, NOW);
    expect(r7.from).toBe('2026-11-05T17:00:00.000Z'); // 06-11 00:00 VN
    expect(r7.to).toBe('2026-11-12T17:00:00.000Z');
    expect(r7.granularity).toBe('day');
    expect(listBucketKeys(r7)).toHaveLength(7);
    const r30 = resolveQueryStatsRange({ preset: 'last_30d' }, NOW);
    expect(r30.from).toBe('2026-10-13T17:00:00.000Z');
    expect(listBucketKeys(r30)).toHaveLength(30);
    const r90 = resolveQueryStatsRange({ preset: 'last_90d' }, NOW);
    expect(r90.granularity).toBe('day');
    expect(listBucketKeys(r90)).toHaveLength(90);
  });

  it('last_7d at 23:59 VN vs 00:00 VN rolls the window by one day', () => {
    const at2359 = resolveQueryStatsRange({ preset: 'last_7d' }, new Date('2026-11-11T16:59:00Z'));
    expect(at2359.to).toBe('2026-11-11T17:00:00.000Z');
    const at0000 = resolveQueryStatsRange({ preset: 'last_7d' }, new Date('2026-11-11T17:00:00Z'));
    expect(at0000.to).toBe('2026-11-12T17:00:00.000Z');
  });

  it('last_24h = 24 whole VN hours ending with the current hour', () => {
    const r = resolveQueryStatsRange({ preset: 'last_24h' }, NOW);
    expect(r.from).toBe('2026-11-10T18:00:00.000Z'); // 01:00 VN 11-11
    expect(r.to).toBe('2026-11-11T18:00:00.000Z'); // 01:00 VN 11-12 (exclusive)
    expect(r.granularity).toBe('hour');
    const keys = listBucketKeys(r);
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe('2026-11-11T01');
    expect(keys[23]).toBe('2026-11-12T00');
  });

  it('last_24h by day still covers both touched VN days', () => {
    const keys = listBucketKeys(resolveQueryStatsRange({ preset: 'last_24h', granularity: 'day' }, NOW));
    expect(keys).toEqual(['2026-11-11', '2026-11-12']);
  });

  it('last_month: previous calendar month, incl. January and leap February', () => {
    const oct = resolveQueryStatsRange({ preset: 'last_month' }, NOW);
    expect(oct.from).toBe('2026-09-30T17:00:00.000Z');
    expect(oct.to).toBe('2026-10-31T17:00:00.000Z');
    expect(oct.granularity).toBe('day');
    const dec = resolveQueryStatsRange({ preset: 'last_month' }, new Date('2026-01-15T05:00:00Z'));
    expect(dec.from).toBe('2025-11-30T17:00:00.000Z');
    expect(dec.to).toBe('2025-12-31T17:00:00.000Z');
    const feb = resolveQueryStatsRange({ preset: 'last_month' }, new Date('2024-03-10T05:00:00Z'));
    expect(listBucketKeys(feb)).toHaveLength(29);
    // 00:00 VN 1st of month: last_month already switched
    const edge = resolveQueryStatsRange({ preset: 'last_month' }, new Date('2026-11-30T17:00:00Z'));
    expect(edge.to).toBe('2026-11-30T17:00:00.000Z');
  });
});

describe('listBucketKeys', () => {
  it('hour: 24 keys for today, VN hours', () => {
    const keys = listBucketKeys(resolveQueryStatsRange({ preset: 'today' }, NOW));
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe('2026-11-12T00');
    expect(keys[23]).toBe('2026-11-12T23');
  });
  it('day: 30 keys for Nov 2026', () => {
    const keys = listBucketKeys(resolveQueryStatsRange({ preset: 'this_month' }, NOW));
    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe('2026-11-01');
  });
  it('month: 12 keys for the year', () => {
    const keys = listBucketKeys(resolveQueryStatsRange({ preset: 'this_year' }, NOW));
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe('2026-01');
    expect(keys[11]).toBe('2026-12');
  });
});

describe('queryStatsQuerySchema', () => {
  it('defaults preset to last_7d, granularity unset', () => {
    const q = queryStatsQuerySchema.parse({});
    expect(q.preset).toBe('last_7d');
    expect(q.granularity).toBeUndefined();
  });
  it('validates granularity and new presets', () => {
    expect(queryStatsQuerySchema.safeParse({ preset: 'last_90d', granularity: 'day' }).success).toBe(true);
    expect(queryStatsQuerySchema.safeParse({ preset: 'last_24h' }).success).toBe(true);
    expect(queryStatsQuerySchema.safeParse({ granularity: 'week' }).success).toBe(false);
  });
  it('rejects custom without from/to', () => {
    expect(queryStatsQuerySchema.safeParse({ preset: 'custom' }).success).toBe(false);
    expect(queryStatsQuerySchema.safeParse({ preset: 'custom', from: '2026-01-01' }).success).toBe(false);
  });
  it('rejects from > to, bad date and > 366 days', () => {
    expect(queryStatsQuerySchema.safeParse({ preset: 'custom', from: '2026-02-02', to: '2026-02-01' }).success).toBe(false);
    expect(queryStatsQuerySchema.safeParse({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }).success).toBe(false);
    expect(queryStatsQuerySchema.safeParse({ preset: 'custom', from: '2025-01-01', to: '2026-01-02' }).success).toBe(false);
  });
  it('accepts exactly 366 days', () => {
    expect(queryStatsQuerySchema.safeParse({ preset: 'custom', from: '2024-01-01', to: '2024-12-31' }).success).toBe(true);
  });
});

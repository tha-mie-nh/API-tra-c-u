import { fillTimeseries, mergeDatasourceRows, sumRaw, toCounters } from './query-stats-aggregation.util';
import type { RawCounterRow } from './query-stats-sql.repository';

const raw = (o: Partial<RawCounterRow>): RawCounterRow => ({
  requests: 0, answered: 0, success: 0, failed: 0, denied: 0, records: 0, avg_duration_ms: null, duration_sum_ms: 0, duration_count: 0, ...o,
});

describe('toCounters', () => {
  it('derives gap / empty / errors', () => {
    const c = toCounters(raw({ requests: 10, answered: 4, success: 6, failed: 3, denied: 1, records: 9, avg_duration_ms: 120 }));
    expect(c.gap).toBe(6);
    expect(c.empty).toBe(2);
    expect(c.errors).toBe(4);
    expect(c.avgDurationMs).toBe(120);
  });
});

describe('sumRaw', () => {
  it('computes exact avg duration over rows that have a duration (not request-weighted)', () => {
    // DS A: 10 requests but only 5 have a duration (sum 500, avg 100); DS B: 1 request, duration 1000.
    // Exact = (500 + 1000) / (5 + 1) = 250. Re-averaging rounded averages by requests would give 182.
    const s = sumRaw([
      raw({ requests: 10, avg_duration_ms: 100, duration_sum_ms: 500, duration_count: 5 }),
      raw({ requests: 1, avg_duration_ms: 1000, duration_sum_ms: 1000, duration_count: 1 }),
      raw({ requests: 2 }),
    ]);
    expect(s.requests).toBe(13);
    expect(s.avg_duration_ms).toBe(250);
  });
  it('null avg when no data', () => {
    expect(sumRaw([]).avg_duration_ms).toBeNull();
  });
});

describe('mergeDatasourceRows', () => {
  it('includes zero-traffic configured codes and orphan codes (name null), sorted by requests desc', () => {
    const rows = mergeDatasourceRows(
      [
        { ...raw({ requests: 2, answered: 2, success: 2 }), datasource_code: 'A' },
        { ...raw({ requests: 5, failed: 5 }), datasource_code: 'GONE' },
      ],
      [{ code: 'A', name: 'Alpha' }, { code: 'B', name: 'Beta' }],
    );
    expect(rows.map((r) => [r.datasourceCode, r.name, r.requests])).toEqual([
      ['GONE', null, 5],
      ['A', 'Alpha', 2],
      ['B', 'Beta', 0],
    ]);
  });
});

describe('fillTimeseries', () => {
  it('zero-fills missing buckets', () => {
    const out = fillTimeseries([{ ...raw({ requests: 3 }), bucket: '2026-01-02' }], ['2026-01-01', '2026-01-02']);
    expect(out.map((b) => b.requests)).toEqual([0, 3]);
  });
});

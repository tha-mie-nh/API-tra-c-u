import { buildHistorySearchParams, STATS_COUNTER_HISTORY_FILTER, vnBucketRange, vnDateStartIso, vnNextDateStartIso } from '@app/shared';

describe('vnBucketRange (UTC+7, half-open)', () => {
  it('hour', () => {
    expect(vnBucketRange('2026-11-12T00', 'hour')).toEqual({ from: '2026-11-11T17:00:00.000Z', to: '2026-11-11T18:00:00.000Z' });
    expect(vnBucketRange('2026-11-11T23', 'hour')).toEqual({ from: '2026-11-11T16:00:00.000Z', to: '2026-11-11T17:00:00.000Z' });
  });
  it('day incl. month/year rollover', () => {
    expect(vnBucketRange('2026-12-31', 'day')).toEqual({ from: '2026-12-30T17:00:00.000Z', to: '2026-12-31T17:00:00.000Z' });
    expect(vnDateStartIso('2026-03-01')).toBe('2026-02-28T17:00:00.000Z');
    expect(vnNextDateStartIso('2028-02-28')).toBe('2028-02-28T17:00:00.000Z');
  });
  it('month', () => {
    expect(vnBucketRange('2026-12', 'month')).toEqual({ from: '2026-11-30T17:00:00.000Z', to: '2026-12-31T17:00:00.000Z' });
    expect(vnBucketRange('2026-12', 'month').to).not.toBe('2027-01-01T00:00:00.000Z');
  });
  it('rejects garbage', () => {
    expect(() => vnBucketRange('nope', 'day')).toThrow();
  });
});

describe('STATS_COUNTER_HISTORY_FILTER / buildHistorySearchParams', () => {
  it('maps every counter', () => {
    expect(STATS_COUNTER_HISTORY_FILTER.errors).toEqual({ status: 'failed,denied' });
    expect(STATS_COUNTER_HISTORY_FILTER.gap).toEqual({ outcome: 'gap' });
    expect(STATS_COUNTER_HISTORY_FILTER.requests).toEqual({});
  });
  it('drops empties and orders keys stably', () => {
    const qs = buildHistorySearchParams({ status: 'failed', from: 'A', to: '', datasourceCode: 'X', page: '2' });
    expect(qs.toString()).toBe('from=A&datasourceCode=X&status=failed&page=2');
  });
});

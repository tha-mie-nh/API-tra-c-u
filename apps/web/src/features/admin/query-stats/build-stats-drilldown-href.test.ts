import { describe, it, expect } from 'vitest';
import { STATS_COUNTER_HISTORY_FILTER, type QueryStatsCounterKey } from '@shared/index';
import { buildStatsDrilldownHref } from './build-stats-drilldown-href';

const range = { from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z' };
const parse = (href: string) => {
  const [path, qs] = href.split('?');
  return { path, sp: new URLSearchParams(qs) };
};

describe('buildStatsDrilldownHref', () => {
  it('requests => only range (+ datasource)', () => {
    const { path, sp } = parse(buildStatsDrilldownHref({ range, datasourceCode: 'ds1' }, { counter: 'requests' }));
    expect(path).toBe('/lich-su');
    expect(Object.fromEntries(sp)).toEqual({ from: range.from, to: range.to, datasourceCode: 'ds1' });
  });

  it.each(Object.keys(STATS_COUNTER_HISTORY_FILTER) as QueryStatsCounterKey[])('counter %s uses the shared filter table', (counter) => {
    const { sp } = parse(buildStatsDrilldownHref({ range }, { counter }));
    for (const [k, v] of Object.entries(STATS_COUNTER_HISTORY_FILTER[counter])) expect(sp.get(k)).toBe(v);
    expect(sp.get('datasourceCode')).toBeNull();
  });

  it('hour bucket 23:00 VN = 16:00Z..17:00Z same day', () => {
    const { sp } = parse(buildStatsDrilldownHref({ range }, { bucket: '2026-11-10T23', granularity: 'hour', counter: 'errors' }));
    expect(sp.get('from')).toBe('2026-11-10T16:00:00.000Z');
    expect(sp.get('to')).toBe('2026-11-10T17:00:00.000Z');
    expect(sp.get('status')).toBe('failed,denied');
  });

  it('day bucket is VN midnight to next VN midnight', () => {
    const { sp } = parse(buildStatsDrilldownHref({ range }, { bucket: '2026-11-08', granularity: 'day' }));
    expect(sp.get('from')).toBe('2026-11-07T17:00:00.000Z');
    expect(sp.get('to')).toBe('2026-11-08T17:00:00.000Z');
  });

  it('month bucket at month end (Nov -> Dec, Dec -> next year)', () => {
    const wide = { from: '2025-12-31T17:00:00.000Z', to: '2027-01-01T00:00:00.000Z' };
    const nov = parse(buildStatsDrilldownHref({ range: wide }, { bucket: '2026-11', granularity: 'month' })).sp;
    expect([nov.get('from'), nov.get('to')]).toEqual(['2026-10-31T17:00:00.000Z', '2026-11-30T17:00:00.000Z']);
    const dec = parse(buildStatsDrilldownHref({ range: wide }, { bucket: '2026-12', granularity: 'month' })).sp;
    expect([dec.get('from'), dec.get('to')]).toEqual(['2026-11-30T17:00:00.000Z', '2026-12-31T17:00:00.000Z']);
  });

  it('clips edge buckets to the stats range', () => {
    const r = { from: '2026-11-10T05:30:00.000Z', to: '2026-11-11T05:30:00.000Z' }; // last_24h
    const first = parse(buildStatsDrilldownHref({ range: r }, { bucket: '2026-11-10', granularity: 'day' })).sp;
    expect([first.get('from'), first.get('to')]).toEqual([r.from, '2026-11-10T17:00:00.000Z']);
    const last = parse(buildStatsDrilldownHref({ range: r }, { bucket: '2026-11-11', granularity: 'day' })).sp;
    expect([last.get('from'), last.get('to')]).toEqual(['2026-11-10T17:00:00.000Z', r.to]);
  });

  it('error item maps null code/status to __null__', () => {
    const a = parse(buildStatsDrilldownHref({ range }, { errorItem: { errorCode: null, statusCode: null } })).sp;
    expect([a.get('status'), a.get('errorCode'), a.get('statusCode')]).toEqual(['failed,denied', '__null__', '__null__']);
    const b = parse(buildStatsDrilldownHref({ range }, { errorItem: { errorCode: 'UPSTREAM_TIMEOUT', statusCode: 504 } })).sp;
    expect([b.get('errorCode'), b.get('statusCode')]).toEqual(['UPSTREAM_TIMEOUT', '504']);
  });
});

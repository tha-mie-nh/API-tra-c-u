import { describe, it, expect } from 'vitest';
import { QUERY_LOG_NULL_TOKEN } from '@shared/index';
import { buildStatsDrilldownHref } from '@/features/admin/query-stats/build-stats-drilldown-href';
import { parseHistorySearchParams, serializeHistorySearchParams, omitViewAllOnlyFilters } from './history-search-params';
import { joinVnDateTime, splitVnDateTime } from './history-datetime-input';

const parse = (qs: string) => parseHistorySearchParams(new URLSearchParams(qs));

describe('history URL <-> state', () => {
  it('defaults when URL is empty', () => {
    const { params, detail } = parse('');
    expect(params).toMatchObject({ page: 1, pageSize: 20, sort: undefined, order: undefined });
    expect(detail).toBeNull();
    expect(serializeHistorySearchParams(params).toString()).toBe('');
  });

  it('round-trips every filter, sort, paging and detail', () => {
    const qs = new URLSearchParams({
      from: '2026-11-01T17:00:00.000Z', to: '2026-11-08', datasourceCode: 'ds 1&x', status: 'failed,denied',
      outcome: 'gap', userId: QUERY_LOG_NULL_TOKEN, username: 'ngu yen', statusCode: QUERY_LOG_NULL_TOKEN,
      errorCode: 'A/B+C', ip: '10.0.0.1', durationMinMs: '10', durationMaxMs: '500', hasRecords: 'false',
      upstreamRequestId: 'req-1', offHours: 'true', sort: 'durationMs', order: 'asc', page: '3', pageSize: '50', detail: 'abc',
    }).toString();
    const first = parse(qs);
    const out = serializeHistorySearchParams(first.params, first.detail);
    const second = parseHistorySearchParams(out);
    expect(second).toEqual(first);
    expect(first.params.errorCode).toBe('A/B+C');
    expect(first.params.sort).toBe('durationMs');
    expect(first.params.page).toBe(3);
    expect(first.detail).toBe('abc');
  });

  it('drops garbage and normalizes status', () => {
    const { params } = parse('status=failed,bogus,failed,denied&outcome=zzz&hasRecords=maybe&offHours=false&statusCode=99&durationMinMs=-1&from=hello&sort=x&order=up&page=0&pageSize=999');
    expect(params.status).toBe('failed,denied');
    expect(params).toMatchObject({ page: 1, pageSize: 20 });
    for (const k of ['outcome', 'hasRecords', 'offHours', 'statusCode', 'durationMinMs', 'from', 'sort', 'order'] as const) {
      expect(params[k]).toBeUndefined();
    }
  });

  it('applies the exact filter of a Thống kê drill-down link', () => {
    const range = { from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z' };
    const href = buildStatsDrilldownHref({ range, datasourceCode: 'ds1' }, { counter: 'errors' });
    const { params } = parse(href.split('?')[1] ?? '');
    expect(params).toMatchObject({ from: range.from, to: range.to, datasourceCode: 'ds1', status: 'failed,denied' });
    const err = buildStatsDrilldownHref({ range }, { errorItem: { errorCode: null, statusCode: 504 } });
    expect(parse(err.split('?')[1] ?? '').params).toMatchObject({ errorCode: QUERY_LOG_NULL_TOKEN, statusCode: '504', status: 'failed,denied' });
    const gap = buildStatsDrilldownHref({ range }, { counter: 'gap' });
    expect(parse(gap.split('?')[1] ?? '').params.outcome).toBe('gap');
  });

  it('omitViewAllOnlyFilters strips userId/username/ip only', () => {
    expect(omitViewAllOnlyFilters({ userId: 'u', username: 'n', ip: '1', status: 'failed' })).toEqual({ status: 'failed' });
  });
});

describe('VN date-time helpers', () => {
  it('date-only stays date-only', () => {
    expect(splitVnDateTime('2026-11-05')).toEqual({ date: '2026-11-05', time: '' });
    expect(joinVnDateTime('2026-11-05', '')).toBe('2026-11-05');
  });
  it('ISO instant shows VN wall-clock and round-trips', () => {
    expect(splitVnDateTime('2026-11-04T17:00:00.000Z')).toEqual({ date: '2026-11-05', time: '00:00' });
    expect(joinVnDateTime('2026-11-05', '00:00')).toBe('2026-11-04T17:00:00.000Z');
    expect(joinVnDateTime('2026-11-05', '08:30')).toBe('2026-11-05T01:30:00.000Z');
  });
  it('invalid date => undefined', () => {
    expect(joinVnDateTime('', '08:30')).toBeUndefined();
    expect(splitVnDateTime('nope')).toEqual({ date: '', time: '' });
  });
  it('`to` + time is inclusive of the picked minute (emits the next minute) and round-trips', () => {
    expect(joinVnDateTime('2026-11-05', '23:59', 'to')).toBe('2026-11-05T17:00:00.000Z'); // 00:00 VN 06-11
    expect(joinVnDateTime('2026-11-05', '17:00', 'to')).toBe('2026-11-05T10:01:00.000Z');
    expect(joinVnDateTime('2026-11-05', '', 'to')).toBe('2026-11-05');
    expect(splitVnDateTime('2026-11-05T17:00:00.000Z', 'to')).toEqual({ date: '2026-11-05', time: '23:59' });
    expect(splitVnDateTime('2026-11-05T10:01:00.000Z', 'to')).toEqual({ date: '2026-11-05', time: '17:00' });
  });
});

describe('from/to normalizers match the server validator', () => {
  const to = (v: string) => parseHistorySearchParams(new URLSearchParams({ to: v })).params.to;
  it('rejects non-existent dates and datetimes without offset', () => {
    expect(to('2026-02-31')).toBeUndefined();
    expect(to('2026-02-31T10:00:00Z')).toBeUndefined();
    expect(to('2026-11-05T10:00')).toBeUndefined();
    expect(to('2026-11-05T10:00:00')).toBeUndefined();
    expect(to('2026-11-05T10:00Z')).toBeUndefined();
  });
  it('accepts real dates and offset datetimes', () => {
    expect(to('2026-02-28')).toBe('2026-02-28');
    expect(to('2028-02-29')).toBe('2028-02-29');
    expect(to('2026-11-05T10:00:00Z')).toBe('2026-11-05T10:00:00Z');
    expect(to('2026-11-05T10:00:00.000+07:00')).toBe('2026-11-05T10:00:00.000+07:00');
  });
});

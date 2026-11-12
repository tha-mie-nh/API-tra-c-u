import { queryLogFilterQuerySchema as schema, withQueryLogFilter } from './query-log-filter-query.schema';
import { z } from 'zod';

const ok = (q: Record<string, string>) => schema.parse(q);
const bad = (q: Record<string, string>) => expect(schema.safeParse(q).success).toBe(false);
const UUID = '3f2b8c1e-9d4a-4b6e-8a1c-2d3e4f5a6b7c';

describe('queryLogFilterQuerySchema', () => {
  it('empty input -> empty filter; empty strings ignored', () => {
    expect(ok({})).toEqual({});
    expect(ok({ from: '', status: '' })).toEqual({});
  });
  it('datetime with offset kept as instant', () => {
    expect(ok({ from: '2026-11-12T00:00:00+07:00' }).from?.toISOString()).toBe('2026-11-11T17:00:00.000Z');
  });
  it('datetime without offset rejected', () => bad({ from: '2026-11-12T00:00:00' }));
  it('date-only from = 00:00 VN; date-only to = next VN day start (whole day inclusive)', () => {
    const r = ok({ from: '2026-11-12', to: '2026-11-12' });
    expect(r.from?.toISOString()).toBe('2026-11-11T17:00:00.000Z');
    expect(r.to?.toISOString()).toBe('2026-11-12T17:00:00.000Z');
  });
  it('invalid calendar date rejected', () => bad({ from: '2026-02-30' }));
  it('from >= to rejected', () => bad({ from: '2026-11-12T00:00:00Z', to: '2026-11-12T00:00:00Z' }));
  it('status CSV, dedup, enum only', () => {
    expect(ok({ status: 'failed,denied,failed' }).status).toEqual(['failed', 'denied']);
    bad({ status: 'failed,bogus' });
  });
  it('__null__ tokens', () => {
    const r = ok({ userId: '__null__', statusCode: '__null__', errorCode: '__null__' });
    expect(r).toEqual({ userId: null, statusCode: null, errorCode: null });
  });
  it('userId must be uuid, statusCode 100-599, errorCode charset', () => {
    expect(ok({ userId: UUID }).userId).toBe(UUID);
    bad({ userId: 'x' });
    expect(ok({ statusCode: '504' }).statusCode).toBe(504);
    bad({ statusCode: '99' });
    bad({ statusCode: '600' });
    bad({ statusCode: 'abc' });
    expect(ok({ errorCode: 'UPSTREAM_TIMEOUT' }).errorCode).toBe('UPSTREAM_TIMEOUT');
    bad({ errorCode: "x'; DROP" });
  });
  it('ip v4/v6 only', () => {
    expect(ok({ ip: '10.0.0.1' }).ip).toBe('10.0.0.1');
    expect(ok({ ip: '::1' }).ip).toBe('::1');
    bad({ ip: '10.0.0.999' });
    bad({ ip: 'abc' });
  });
  it('duration bounds, min > max rejected', () => {
    expect(ok({ durationMinMs: '5', durationMaxMs: '10' })).toEqual({ durationMinMs: 5, durationMaxMs: 10 });
    bad({ durationMinMs: '11', durationMaxMs: '10' });
    bad({ durationMinMs: '-1' });
  });
  it('hasRecords / offHours / outcome', () => {
    expect(ok({ hasRecords: 'false', offHours: 'true', outcome: 'gap' })).toEqual({ hasRecords: false, offHours: true, outcome: 'gap' });
    bad({ outcome: 'x' });
    bad({ offHours: 'false' });
  });
  it('withQueryLogFilter passes extra keys through', () => {
    const s = withQueryLogFilter({ page: z.coerce.number().int().min(1).default(1) });
    expect(s.parse({ status: 'failed', page: '3' })).toEqual({ status: ['failed'], page: 3 });
  });
});

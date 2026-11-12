import { describe, it, expect } from 'vitest';
import { parseInsightsParams, rangeEndingAt, validateInsightsRange, vnToday, rangeSearchString } from './use-insights-range-search-params';

const NOW = Date.parse('2026-11-11T03:00:00Z'); // 10:00 VN, 11 Nov

describe('insights range <-> URL', () => {
  it('vnToday uses Vietnam date (UTC+7)', () => {
    expect(vnToday(Date.parse('2026-11-11T18:00:00Z'))).toBe('2026-11-12');
  });
  it('defaults to the last 7 inclusive VN days and builds half-open ISO', () => {
    const p = parseInsightsParams(new URLSearchParams(), NOW);
    expect(p.from).toBe('2026-11-05');
    expect(p.to).toBe('2026-11-11');
    expect(p.filter).toEqual({ from: '2026-11-04T17:00:00.000Z', to: '2026-11-11T17:00:00.000Z' });
  });
  it('reads from/to/datasourceCode/tab from the URL', () => {
    const p = parseInsightsParams(new URLSearchParams('from=2026-10-01&to=2026-10-31&datasourceCode=ds1&tab=anomalies'), NOW);
    expect(p.tab).toBe('anomalies');
    expect(p.filter).toEqual({ from: '2026-09-30T17:00:00.000Z', to: '2026-10-31T17:00:00.000Z', datasourceCode: 'ds1' });
    expect(rangeSearchString(p)).toBe('from=2026-10-01&to=2026-10-31&datasourceCode=ds1');
  });
  it('90 days inclusive is allowed, 91 is not', () => {
    const ok = rangeEndingAt('2026-11-11', 90);
    expect(validateInsightsRange(ok.from, ok.to)).toBeNull();
    const bad = rangeEndingAt('2026-11-11', 91);
    expect(validateInsightsRange(bad.from, bad.to)).toBe('tooLong');
    expect(parseInsightsParams(new URLSearchParams(`from=${bad.from}&to=${bad.to}`), NOW).filter).toBeNull();
    expect(validateInsightsRange('2026-11-11', '2026-11-01')).toBe('order');
    expect(validateInsightsRange('x', '2026-11-01')).toBe('missing');
  });
});

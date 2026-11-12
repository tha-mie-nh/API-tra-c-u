import { describe, it, expect } from 'vitest';
import { parseRangeParams, validateCustomRange } from './use-query-stats-range-search-params';

describe('parseRangeParams', () => {
  it('defaults to last_7d', () => {
    const r = parseRangeParams(new URLSearchParams(''));
    expect(r.preset).toBe('last_7d');
    expect(r.apiParams).toEqual({ preset: 'last_7d', granularity: undefined });
  });
  it('falls back to last_7d for unknown preset', () => {
    expect(parseRangeParams(new URLSearchParams('preset=bogus')).preset).toBe('last_7d');
  });
  it('accepts every new preset', () => {
    for (const p of ['last_24h', 'last_30d', 'last_90d', 'last_month', 'today']) {
      expect(parseRangeParams(new URLSearchParams(`preset=${p}`)).preset).toBe(p);
    }
  });
  it('reads a valid granularity and ignores an unknown one', () => {
    expect(parseRangeParams(new URLSearchParams('granularity=hour')).apiParams).toEqual({ preset: 'last_7d', granularity: 'hour' });
    expect(parseRangeParams(new URLSearchParams('granularity=week')).granularity).toBeUndefined();
  });
  it('reads a valid custom range', () => {
    const r = parseRangeParams(new URLSearchParams('preset=custom&from=2026-11-01&to=2026-11-10'));
    expect(r.apiParams).toEqual({ preset: 'custom', from: '2026-11-01', to: '2026-11-10', granularity: undefined });
  });
  it('custom with missing/invalid dates yields no api params (no call)', () => {
    expect(parseRangeParams(new URLSearchParams('preset=custom')).apiParams).toBeNull();
    expect(parseRangeParams(new URLSearchParams('preset=custom&from=2026-11-10&to=2026-11-01')).apiParams).toBeNull();
  });
});

describe('validateCustomRange', () => {
  it('flags order, missing and too long', () => {
    expect(validateCustomRange('', '2026-01-01')).toBe('missing');
    expect(validateCustomRange('2026-02-01', '2026-01-01')).toBe('order');
    expect(validateCustomRange('2025-01-01', '2026-12-31')).toBe('tooLong');
    expect(validateCustomRange('2026-01-01', '2026-01-01')).toBeNull();
  });
});

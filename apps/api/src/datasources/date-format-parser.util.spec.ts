import { parseDateValue, parseWithFormat, parseWithFormats } from './date-format-parser.util';

describe('parseWithFormat', () => {
  it('parses DD/MM/YYYY into ISO 8601 (UTC midnight)', () => {
    expect(parseWithFormat('31/12/1999', 'DD/MM/YYYY')).toBe('1999-12-31T00:00:00.000Z');
  });

  it('parses DD/MM/YYYY HH:mm:ss into ISO 8601', () => {
    expect(parseWithFormat('20/10/2024 12:30:45', 'DD/MM/YYYY HH:mm:ss')).toBe('2024-10-20T12:30:45.000Z');
  });

  it('returns undefined when the value does not match the declared format', () => {
    expect(parseWithFormat('1999-12-31', 'DD/MM/YYYY')).toBeUndefined();
  });

  it('returns undefined for an impossible calendar date (month 13)', () => {
    expect(parseWithFormat('31/13/1999', 'DD/MM/YYYY')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(parseWithFormat('', 'DD/MM/YYYY')).toBeUndefined();
  });
});

describe('parseWithFormats / parseDateValue', () => {
  const formats = 'DD/MM/YYYY HH:mm:ss|DD/MM/YYYY HH:mm|DD/MM/YYYY';

  it('tries each |-separated alternative', () => {
    expect(parseWithFormats('20/10/2024 12:30', formats)).toBe('2024-10-20T12:30:00.000Z');
    expect(parseWithFormats('20/10/2024', formats)).toBe('2024-10-20T00:00:00.000Z');
  });

  it('parseDateValue falls back to ISO-looking values and returns undefined otherwise', () => {
    expect(parseDateValue('2026-01-15 09:30:00')).toBe('2026-01-15T09:30:00.000Z');
    expect(parseDateValue('không phải ngày', formats)).toBeUndefined();
  });
});

describe('time zones', () => {
  it('reads zone-less wall time in the given IANA zone (Asia/Ho_Chi_Minh = UTC+7)', () => {
    expect(parseWithFormat('15/01/2026 09:30:00', 'DD/MM/YYYY HH:mm:ss', 'Asia/Ho_Chi_Minh')).toBe('2026-01-15T02:30:00.000Z');
    expect(parseDateValue('2026-01-15 09:30:00', undefined, 'Asia/Ho_Chi_Minh')).toBe('2026-01-15T02:30:00.000Z');
  });

  it('defaults to UTC and never shifts values that carry an explicit zone', () => {
    expect(parseWithFormat('15/01/2026 09:30:00', 'DD/MM/YYYY HH:mm:ss')).toBe('2026-01-15T09:30:00.000Z');
    expect(parseDateValue('2026-01-15T09:30:00+07:00', undefined, 'America/New_York')).toBe('2026-01-15T02:30:00.000Z');
  });

  it('handles zones with daylight saving', () => {
    expect(parseWithFormat('15/07/2026 12:00:00', 'DD/MM/YYYY HH:mm:ss', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
    expect(parseWithFormat('15/01/2026 12:00:00', 'DD/MM/YYYY HH:mm:ss', 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
  });
});

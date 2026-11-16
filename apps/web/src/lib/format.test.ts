import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatWithPattern } from './format';

describe('date formatting with time zones', () => {
  const iso = '2026-01-15T02:30:00.000Z';

  it('defaults to Asia/Ho_Chi_Minh (UTC+7)', () => {
    expect(formatDateTime(iso)).toBe('15-01-2026 09:30');
    expect(formatDate(iso)).toBe('15-01-2026');
  });

  it('shows the configured display time zone', () => {
    expect(formatDateTime(iso, 'UTC')).toBe('15-01-2026 02:30');
    expect(formatWithPattern(iso, 'HH:mm DD/MM/YYYY', 'America/New_York')).toBe('21:30 14/01/2026');
  });

  it('never guesses a non-ISO string (02/03/2026 would be read month-first by Date)', () => {
    expect(formatWithPattern('02/03/2026 14:10:00', 'DD/MM/YYYY')).toBeNull();
    expect(formatDateTime('02/03/2026 14:10:00')).toBe('—');
  });

  it('returns null for non-dates or unknown zones so callers can fall back to the raw value', () => {
    expect(formatWithPattern('không phải ngày', 'DD/MM/YYYY')).toBeNull();
    expect(formatWithPattern(iso, 'DD/MM/YYYY', 'Mars/Base')).toBeNull();
  });
});

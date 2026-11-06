import { parseWithFormat } from './date-format-parser.util';

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

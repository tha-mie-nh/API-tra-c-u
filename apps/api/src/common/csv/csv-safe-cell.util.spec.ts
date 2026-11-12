import { CSV_UTF8_BOM, toCsvCell, toCsvRow } from './csv-safe-cell.util';

describe('toCsvCell', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx'])('prefixes formula-leading %j with a quote', (v) => {
    const out = toCsvCell(v);
    expect(out.startsWith(`"'`)).toBe(true);
  });
  it('keeps plain text, doubles quotes, wraps in quotes', () => {
    expect(toCsvCell('a "b", c')).toBe('"a ""b"", c"');
  });
  it('null/undefined -> empty, numbers/booleans verbatim (negative number not prefixed)', () => {
    expect(toCsvCell(null)).toBe('');
    expect(toCsvCell(undefined)).toBe('');
    expect(toCsvCell(-5)).toBe('-5');
    expect(toCsvCell(true)).toBe('true');
  });
  it('dates -> ISO; embedded newline stays inside quotes', () => {
    expect(toCsvCell(new Date('2026-01-01T00:00:00Z'))).toBe('"2026-01-01T00:00:00.000Z"');
    expect(toCsvCell('a\nb')).toBe('"a\nb"');
  });
  it('row ends with CRLF; BOM constant', () => {
    expect(toCsvRow(['a', 1, null, '=x'])).toBe(`"a",1,,"'=x"\r\n`);
    expect(CSV_UTF8_BOM).toBe('﻿');
  });
});

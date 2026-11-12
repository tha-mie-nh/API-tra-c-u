/** CSV helpers with formula-injection protection (OWASP CSV injection). */

export const CSV_UTF8_BOM = '﻿';
export const CSV_EOL = '\r\n';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Always quoted; formula-leading strings get a `'` prefix; null/undefined -> empty cell. */
export function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** One CSV record including trailing CRLF. */
export function toCsvRow(cells: readonly unknown[]): string {
  return cells.map(toCsvCell).join(',') + CSV_EOL;
}

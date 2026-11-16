/**
 * `vi-VN` date/number formatting helpers, display timezone
 * `Asia/Ho_Chi_Minh` (the API itself always deals in UTC — see
 * reference-screens-and-ux.md "Cross-cutting UX rules").
 */
const DISPLAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const PATTERN_TOKEN_RE = /YYYY|MM|DD|HH|mm|ss/g;

/** The API sends ISO 8601. Anything else (e.g. `02/03/2026`) must NOT go through `new Date`, which would read it
 * US-style (month first) and show a wrong date without any warning — such values are displayed as received. */
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Formats an ISO timestamp with a config-driven pattern (tokens `DD` `MM` `YYYY` `HH` `mm` `ss`,
 * anything else is a literal) in `timeZone` (IANA, default Asia/Ho_Chi_Minh). Returns `null` when the
 * value is not a date or the zone is unknown. */
export function formatWithPattern(iso: string, pattern: string, timeZone: string = DISPLAY_TIME_ZONE): string | null {
  if (!ISO_8601_RE.test(iso)) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    return null;
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const values: Record<string, string> = { YYYY: get('year'), MM: get('month'), DD: get('day'), HH: get('hour'), mm: get('minute'), ss: get('second') };
  return pattern.replace(PATTERN_TOKEN_RE, (token) => values[token] ?? token);
}

/** Formats an ISO timestamp (UTC, as returned by the API) as `dd-MM-yyyy HH:mm` in Asia/Ho_Chi_Minh (or `timeZone`). */
export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return formatWithPattern(iso, 'DD-MM-YYYY HH:mm', timeZone) ?? '—';
}

/** Formats an ISO date/timestamp as `dd-MM-yyyy` in Asia/Ho_Chi_Minh (or `timeZone`). */
export function formatDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return formatWithPattern(iso, 'DD-MM-YYYY', timeZone) ?? '—';
}

/** Formats a plain number with `vi-VN` grouping (e.g. 1000 -> "1.000"). */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

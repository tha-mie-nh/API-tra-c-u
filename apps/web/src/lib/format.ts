/**
 * `vi-VN` date/number formatting helpers, display timezone
 * `Asia/Ho_Chi_Minh` (the API itself always deals in UTC — see
 * reference-screens-and-ux.md "Cross-cutting UX rules").
 */
const DISPLAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/** `vi-VN`'s own day/month/year separator is `/`; the DSL calls for `-`
 * (dd-mm-yyyy), so the parts are pulled out and re-joined by hand rather
 * than relying on a locale that happens to use dashes. */
function formatDateParts(date: Date): string {
  const parts = dateFormatter.formatToParts(date);
  const get = (type: 'day' | 'month' | 'year') => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

/** Formats an ISO timestamp (UTC, as returned by the API) as `dd-MM-yyyy HH:mm` in Asia/Ho_Chi_Minh. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDateParts(date)} ${timeFormatter.format(date)}`;
}

/** Formats an ISO date/timestamp as `dd-MM-yyyy` in Asia/Ho_Chi_Minh. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDateParts(date);
}

/** Formats a plain number with `vi-VN` grouping (e.g. 1000 -> "1.000"). */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

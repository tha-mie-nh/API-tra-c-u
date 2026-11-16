const TOKEN_PATTERNS: Record<string, string> = {
  YYYY: '(\\d{4})',
  MM: '(\\d{2})',
  DD: '(\\d{2})',
  HH: '(\\d{2})',
  mm: '(\\d{2})',
  ss: '(\\d{2})',
};

/**
 * Parses `value` according to a declared source `format` (e.g.
 * `"DD/MM/YYYY"` or `"DD/MM/YYYY HH:mm:ss"` — see `OutputFieldDef.format`)
 * and returns an ISO 8601 string, or `undefined` if `value` doesn't match
 * `format` or isn't a real calendar date/time. Used by
 * `ResponseMapperService` to normalize upstreams that send Vietnamese-style
 * dates instead of ISO 8601 (observed on a real customer API sample —
 * no ISO fallback exists upstream, so this can't just `new Date(value)`).
 */
/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock components written in `timeZone` -> the real UTC instant (ms). `UTC`/undefined = no shift. */
function zonedWallTimeToUtcMs(wallAsUtcMs: number, timeZone?: string): number {
  if (!timeZone || timeZone === 'UTC') return wallAsUtcMs;
  const first = wallAsUtcMs - zoneOffsetMs(wallAsUtcMs, timeZone);
  return wallAsUtcMs - zoneOffsetMs(first, timeZone);
}

/** True when `timeZone` is a valid IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function parseWithFormat(value: string, format: string, timeZone?: string): string | undefined {
  const tokenOrder: string[] = [];
  const regexSource = format.replace(/YYYY|MM|DD|HH|mm|ss|./g, (token) => {
    const pattern = TOKEN_PATTERNS[token];
    if (pattern) {
      tokenOrder.push(token);
      return pattern;
    }
    return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });

  const match = new RegExp(`^${regexSource}$`).exec(value);
  if (!match) return undefined;

  const parts: Record<string, string> = {};
  tokenOrder.forEach((token, i) => {
    parts[token] = match[i + 1] as string;
  });
  if (!parts.YYYY || !parts.MM || !parts.DD) return undefined;

  const year = Number(parts.YYYY);
  const month = Number(parts.MM);
  const day = Number(parts.DD);
  const date = new Date(Date.UTC(year, month - 1, day, Number(parts.HH ?? '0'), Number(parts.mm ?? '0'), Number(parts.ss ?? '0')));
  // `Date.UTC` silently rolls over out-of-range fields (e.g. month 13 ->
  // January next year) instead of producing an invalid date — check the
  // components round-trip instead of just `!isNaN`, so a malformed upstream
  // value never gets silently reinterpreted as a different, wrong date.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return new Date(zonedWallTimeToUtcMs(date.getTime(), timeZone)).toISOString();
}

/** First alternative of a `|`-separated `format` that parses `value`, else `undefined`. */
export function parseWithFormats(value: string, format?: string, timeZone?: string): string | undefined {
  for (const alt of (format ?? '').split('|').map((f) => f.trim()).filter(Boolean)) {
    const parsed = parseWithFormat(value.trim(), alt, timeZone);
    if (parsed) return parsed;
  }
  return undefined;
}

const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Normalizes an upstream date/datetime string to ISO 8601, or `undefined`
 * when nothing matches. `format` may list alternatives separated by `|`
 * (e.g. `"DD/MM/YYYY HH:mm:ss|DD/MM/YYYY HH:mm|DD/MM/YYYY"`) because real
 * upstreams mix shapes inside one field; the first alternative that parses
 * wins, then an ISO-looking value passes through. Never throws.
 */
export function parseDateValue(value: string, format?: string, timeZone?: string): string | undefined {
  const text = value.trim();
  const fromFormat = parseWithFormats(text, format, timeZone);
  if (fromFormat) return fromFormat;
  if (ISO_LIKE_RE.test(text)) {
    const iso = text.replace(' ', 'T');
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
    // No explicit zone -> `timeZone` (default UTC), never the server's local zone.
    const time = new Date(hasZone ? iso : `${iso}Z`).getTime();
    if (!Number.isNaN(time)) return new Date(hasZone ? time : zonedWallTimeToUtcMs(time, timeZone)).toISOString();
  }
  return undefined;
}

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
export function parseWithFormat(value: string, format: string): string | undefined {
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
  return date.toISOString();
}

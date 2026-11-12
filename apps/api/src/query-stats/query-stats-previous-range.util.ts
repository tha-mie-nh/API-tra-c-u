import type { QueryStatsRange } from '@app/shared';
import { VN_OFFSET_MS, vnMidnight } from './query-stats-preset-range.util';

export interface PreviousWindow {
  from: string;
  to: string;
}

/**
 * Comparison window for a resolved range (half-open ISO UTC).
 * - today / this_month / this_year (still running): same elapsed length from the start of the
 *   previous day/month/year (like-for-like, no fake drop), capped at the current start.
 * - yesterday / last_month: the calendar unit right before.
 * - rolling presets & custom: same-length window immediately before `from`.
 */
export function resolvePreviousWindow(range: QueryStatsRange, now: Date): PreviousWindow {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const vn = new Date(from.getTime() + VN_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();

  const toWindow = (a: Date, b: Date): PreviousWindow => ({ from: a.toISOString(), to: b.toISOString() });
  const sameLength = () => toWindow(new Date(from.getTime() - (to.getTime() - from.getTime())), from);
  const elapsed = Math.max(0, now.getTime() - from.getTime());
  const toDate = (prevStart: Date) => new Date(Math.min(prevStart.getTime() + elapsed, from.getTime()));

  switch (range.preset) {
    case 'today': {
      const prev = vnMidnight(y, m, d - 1);
      return toWindow(prev, toDate(prev));
    }
    case 'this_month': {
      const prev = vnMidnight(y, m - 1, 1);
      return toWindow(prev, toDate(prev));
    }
    case 'this_year': {
      const prev = vnMidnight(y - 1, 0, 1);
      return toWindow(prev, toDate(prev));
    }
    case 'yesterday':
      return toWindow(vnMidnight(y, m, d - 1), from);
    case 'last_month':
      return toWindow(vnMidnight(y, m - 1, 1), from);
    default:
      return sameLength();
  }
}

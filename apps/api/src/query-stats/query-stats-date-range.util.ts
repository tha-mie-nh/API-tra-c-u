import {
  QUERY_STATS_TIME_ZONE,
  type QueryStatsGranularity,
  type QueryStatsPreset,
  type QueryStatsRange,
} from '@app/shared';
import { DAY_MS, VN_OFFSET_MS, parseYmd, resolvePresetWindow, vnMidnight } from './query-stats-preset-range.util';

/** Max buckets per response (e.g. hourly over 90 days = 2160 is rejected). */
export const QUERY_STATS_MAX_BUCKETS = 800;

export interface QueryStatsRangeInput {
  preset: QueryStatsPreset;
  /** YYYY-MM-DD (VN local date), required for `custom`. */
  from?: string;
  to?: string;
  /** Manual override of the automatic granularity. */
  granularity?: QueryStatsGranularity;
}

/** Auto granularity by span: <= 2 days hour, <= 90 days day, longer month. */
export function autoGranularity(from: Date, to: Date): QueryStatsGranularity {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  if (days <= 2) return 'hour';
  return days <= 90 ? 'day' : 'month';
}

/** Resolve a preset / custom input to a UTC half-open range. `now` injected for tests. */
export function resolveQueryStatsRange(input: QueryStatsRangeInput, now: Date): QueryStatsRange {
  let from: Date;
  let to: Date;
  if (input.preset === 'custom') {
    if (!input.from || !input.to) throw new Error('custom range requires from and to');
    const [fy, fm, fd] = parseYmd(input.from);
    const [ty, tm, td] = parseYmd(input.to);
    from = vnMidnight(fy, fm, fd);
    to = vnMidnight(ty, tm, td + 1);
  } else {
    ({ from, to } = resolvePresetWindow(input.preset, now));
  }
  return {
    preset: input.preset,
    from: from.toISOString(),
    to: to.toISOString(),
    granularity: input.granularity ?? autoGranularity(from, to),
    timeZone: QUERY_STATS_TIME_ZONE,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function formatBucket(vn: Date, g: QueryStatsGranularity): string {
  const ym = `${pad(vn.getUTCFullYear(), 4)}-${pad(vn.getUTCMonth() + 1)}`;
  if (g === 'month') return ym;
  const ymd = `${ym}-${pad(vn.getUTCDate())}`;
  return g === 'day' ? ymd : `${ymd}T${pad(vn.getUTCHours())}`;
}

/** Every bucket key (VN local) in the range, matching the SQL `to_char` format. */
export function listBucketKeys(range: QueryStatsRange): string[] {
  const end = new Date(range.to).getTime() + VN_OFFSET_MS;
  const start = new Date(new Date(range.from).getTime() + VN_OFFSET_MS);
  // Align to the bucket start so non-aligned ranges (e.g. last_24h by day) still cover every SQL bucket.
  let cur =
    range.granularity === 'month'
      ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
      : range.granularity === 'day'
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
        : start;
  const keys: string[] = [];
  while (cur.getTime() < end) {
    keys.push(formatBucket(cur, range.granularity));
    if (range.granularity === 'hour') cur = new Date(cur.getTime() + 3600_000);
    else if (range.granularity === 'day') cur = new Date(cur.getTime() + DAY_MS);
    else cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return keys;
}

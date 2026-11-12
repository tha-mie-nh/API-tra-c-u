import type { QueryStatsPreset } from '@app/shared';

/** Vietnam has no DST: fixed UTC+7. */
export const VN_OFFSET_MS = 7 * 3600_000;
export const HOUR_MS = 3600_000;
export const DAY_MS = 86_400_000;

/** Midnight (VN local) of the given VN calendar date, as a UTC Date. Month/day overflow rolls over. */
export function vnMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day) - VN_OFFSET_MS);
}

export function parseYmd(ymd: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number);
  return [y, m - 1, d];
}

/** Half-open [from, to) UTC range of a non-custom preset (VN calendar), `now` injected. */
export function resolvePresetWindow(
  preset: Exclude<QueryStatsPreset, 'custom'>,
  now: Date,
): { from: Date; to: Date } {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();
  const rolling = (days: number) => ({ from: vnMidnight(y, m, d - (days - 1)), to: vnMidnight(y, m, d + 1) });

  switch (preset) {
    case 'today':
      return { from: vnMidnight(y, m, d), to: vnMidnight(y, m, d + 1) };
    case 'yesterday':
      return { from: vnMidnight(y, m, d - 1), to: vnMidnight(y, m, d) };
    case 'this_month':
      return { from: vnMidnight(y, m, 1), to: vnMidnight(y, m + 1, 1) };
    case 'this_year':
      return { from: vnMidnight(y, 0, 1), to: vnMidnight(y + 1, 0, 1) };
    case 'last_month':
      return { from: vnMidnight(y, m - 1, 1), to: vnMidnight(y, m, 1) };
    case 'last_7d':
      return rolling(7);
    case 'last_30d':
      return rolling(30);
    case 'last_90d':
      return rolling(90);
    case 'last_24h': {
      // 24 whole VN hours ending with the current (partial) hour.
      const endHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS;
      return { from: new Date(endHour - 24 * HOUR_MS), to: new Date(endHour) };
    }
  }
}

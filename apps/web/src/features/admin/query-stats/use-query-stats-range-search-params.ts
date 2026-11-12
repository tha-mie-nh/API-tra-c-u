import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  QUERY_STATS_DEFAULT_PRESET,
  QUERY_STATS_MAX_RANGE_DAYS,
  type QueryStatsGranularity,
  type QueryStatsPreset,
} from '@shared/index';
import type { QueryStatsParams } from './query-stats-api';

export const QUERY_STATS_PRESETS: QueryStatsPreset[] = [
  'today',
  'yesterday',
  'this_month',
  'this_year',
  'last_24h',
  'last_7d',
  'last_30d',
  'last_90d',
  'last_month',
  'custom',
];
const GRANULARITIES: QueryStatsGranularity[] = ['hour', 'day', 'month'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type RangeError = 'missing' | 'order' | 'tooLong' | null;

/** Validates a custom range (inclusive days), mirrors the backend rule. */
export function validateCustomRange(from: string, to: string): RangeError {
  if (!YMD.test(from) || !YMD.test(to)) return 'missing';
  if (from > to) return 'order';
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days > QUERY_STATS_MAX_RANGE_DAYS ? 'tooLong' : null;
}

/** Reads the range from the URL; `apiParams` is null when the range is not queryable yet. */
export function parseRangeParams(sp: URLSearchParams): {
  preset: QueryStatsPreset;
  from: string;
  to: string;
  /** undefined = automatic. Unknown values fall back to automatic. */
  granularity: QueryStatsGranularity | undefined;
  apiParams: QueryStatsParams | null;
} {
  const raw = sp.get('preset') as QueryStatsPreset | null;
  const preset = raw && QUERY_STATS_PRESETS.includes(raw) ? raw : QUERY_STATS_DEFAULT_PRESET;
  const rawG = sp.get('granularity') as QueryStatsGranularity | null;
  const granularity = rawG && GRANULARITIES.includes(rawG) ? rawG : undefined;
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  if (preset !== 'custom') return { preset, from, to, granularity, apiParams: { preset, granularity } };
  const ok = validateCustomRange(from, to) === null;
  return { preset, from, to, granularity, apiParams: ok ? { preset, from, to, granularity } : null };
}

/** Range state kept in the URL (?preset=&from=&to=&granularity=) so reload/back/share keep it. */
export function useQueryStatsRangeSearchParams() {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parseRangeParams(sp), [sp]);
  const { granularity } = state;

  const write = useCallback(
    (next: Record<string, string>, g: QueryStatsGranularity | undefined) => {
      const out = new URLSearchParams(next);
      if (g) out.set('granularity', g);
      setSp(out, { replace: true });
    },
    [setSp],
  );
  const setPreset = useCallback(
    (preset: Exclude<QueryStatsPreset, 'custom'>) => write({ preset }, granularity),
    [write, granularity],
  );
  const setCustom = useCallback(
    (from: string, to: string) => write({ preset: 'custom', from, to }, granularity),
    [write, granularity],
  );
  const setGranularity = useCallback(
    (g: QueryStatsGranularity | undefined) => {
      const out = new URLSearchParams(sp);
      if (g) out.set('granularity', g);
      else out.delete('granularity');
      setSp(out, { replace: true });
    },
    [sp, setSp],
  );

  return { ...state, searchString: sp.toString(), setPreset, setCustom, setGranularity };
}

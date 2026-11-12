import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { QUERY_INSIGHTS_RULES, vnDateStartIso, vnNextDateStartIso } from '@shared/index';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const INSIGHTS_DEFAULT_DAYS = 7;

export type InsightsRangeError = 'missing' | 'order' | 'tooLong' | null;
export type InsightsTab = 'top' | 'anomalies';

/** Today's date in Vietnam time (UTC+7, no DST), YYYY-MM-DD. */
export function vnToday(now = Date.now()): string {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** `days` inclusive days ending at `to` (YYYY-MM-DD). */
export function rangeEndingAt(to: string, days: number): { from: string; to: string } {
  return { from: new Date(Date.parse(to) - (days - 1) * DAY_MS).toISOString().slice(0, 10), to };
}

export function validateInsightsRange(from: string, to: string): InsightsRangeError {
  if (!YMD.test(from) || !YMD.test(to)) return 'missing';
  if (from > to) return 'order';
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  return days > QUERY_INSIGHTS_RULES.maxRangeDays ? 'tooLong' : null;
}

export interface InsightsFilter {
  /** ISO UTC, half-open [from, to) = VN date-start of `from` .. VN date-start after `to`. */
  from: string;
  to: string;
  datasourceCode?: string;
}

/** Reads ?from=&to= (VN dates), defaulting to the last 7 days; `filter` null when the range is invalid. */
export function parseInsightsParams(sp: URLSearchParams, now = Date.now()) {
  const dflt = rangeEndingAt(vnToday(now), INSIGHTS_DEFAULT_DAYS);
  const from = sp.get('from') ?? dflt.from;
  const to = sp.get('to') ?? dflt.to;
  const datasourceCode = sp.get('datasourceCode') || undefined;
  const error = validateInsightsRange(from, to);
  const tab: InsightsTab = sp.get('tab') === 'anomalies' ? 'anomalies' : 'top';
  const filter: InsightsFilter | null = error
    ? null
    : { from: vnDateStartIso(from), to: vnNextDateStartIso(to), ...(datasourceCode ? { datasourceCode } : {}) };
  return { from, to, datasourceCode, tab, error, filter };
}

export function rangeSearchString(s: { from: string; to: string; datasourceCode?: string }): string {
  const out = new URLSearchParams({ from: s.from, to: s.to });
  if (s.datasourceCode) out.set('datasourceCode', s.datasourceCode);
  return out.toString();
}

/** Insights range/datasource/tab kept in the URL so reload/back/share keep them. */
export function useInsightsRangeSearchParams() {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parseInsightsParams(sp), [sp]);
  const patch = useCallback(
    (changes: Record<string, string | undefined>) => {
      const out = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(changes)) {
        if (v) out.set(k, v);
        else out.delete(k);
      }
      setSp(out, { replace: true });
    },
    [sp, setSp],
  );
  return {
    ...state,
    /** from/to/datasourceCode only — carried to the user/IP activity pages. */
    rangeSearch: rangeSearchString(state),
    setRange: (from: string, to: string) => patch({ from, to }),
    setDatasource: (code: string) => patch({ datasourceCode: code || undefined }),
    setTab: (tab: InsightsTab) => patch({ tab: tab === 'top' ? undefined : tab }),
    patch,
  };
}

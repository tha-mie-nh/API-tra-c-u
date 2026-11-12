/**
 * Query statistics dashboard contracts (admin:query_stats), shared by
 * apps/api (`query-stats` module) and apps/web. Source: `app.query_logs`.
 */

export const QUERY_STATS_TIME_ZONE = 'Asia/Ho_Chi_Minh' as const;
/** Max span of a `custom` range (inclusive days). */
export const QUERY_STATS_MAX_RANGE_DAYS = 366;

export type QueryStatsPreset =
  | 'today'
  | 'yesterday'
  | 'this_month'
  | 'this_year'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'last_month'
  | 'custom';
export const QUERY_STATS_DEFAULT_PRESET: QueryStatsPreset = 'last_7d';
export type QueryStatsGranularity = 'hour' | 'day' | 'month';

export interface QueryStatsRange {
  preset: QueryStatsPreset;
  /** ISO UTC, half-open interval [from, to). */
  from: string;
  to: string;
  granularity: QueryStatsGranularity;
  timeZone: typeof QUERY_STATS_TIME_ZONE;
}

export interface QueryStatsCounters {
  /** COUNT(*) */
  requests: number;
  /** success AND record_count > 0 */
  answered: number;
  /** requests - answered */
  gap: number;
  success: number;
  /** success AND record_count = 0/null */
  empty: number;
  failed: number;
  denied: number;
  /** failed + denied */
  errors: number;
  /** SUM(record_count) — informational only */
  records: number;
  avgDurationMs: number | null;
}

/** `bucket` is Vietnam local time: 'YYYY-MM-DDTHH' | 'YYYY-MM-DD' | 'YYYY-MM'. */
export interface QueryStatsBucket extends QueryStatsCounters {
  bucket: string;
}

export interface QueryStatsErrorItem {
  errorCode: string | null;
  statusCode: number | null;
  count: number;
}

export interface QueryStatsDatasourceRow extends QueryStatsCounters {
  datasourceCode: string;
  /** null when the code is no longer in config.json. */
  name: string | null;
}

/** Comparison period; half-open ISO UTC [from, to). */
export interface QueryStatsPreviousPeriod {
  from: string;
  to: string;
  totals: QueryStatsCounters;
}

export interface QueryStatsOverviewResponse {
  range: QueryStatsRange;
  totals: QueryStatsCounters;
  /** Always returned by phase 04 API; optional for older consumers. */
  previous?: QueryStatsPreviousPeriod | null;
  byDatasource: QueryStatsDatasourceRow[];
  timeseries: QueryStatsBucket[];
  topErrors: QueryStatsErrorItem[];
}

export interface QueryStatsDatasourceDetailResponse {
  range: QueryStatsRange;
  datasource: { code: string; name: string | null };
  totals: QueryStatsCounters;
  /** Always returned by phase 04 API; optional for older consumers. */
  previous?: QueryStatsPreviousPeriod | null;
  timeseries: QueryStatsBucket[];
  topErrors: QueryStatsErrorItem[];
}

/** Percent change vs previous period, rounded to 1 decimal; null when previous is 0 (no meaningful %). */
export function queryStatsDeltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

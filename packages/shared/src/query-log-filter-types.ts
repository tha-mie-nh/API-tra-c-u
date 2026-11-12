/**
 * Query-log filter contract shared by Stats / History / CSV / Insights.
 * One filter vocabulary => one where-builder (apps/api history/query-log-filter)
 * => counts match exactly between Stats and History.
 */

/** URL/API token meaning "IS NULL" for errorCode / statusCode / userId. */
export const QUERY_LOG_NULL_TOKEN = '__null__' as const;

/** answered = success AND record_count>0; empty = success AND COALESCE(record_count,0)<=0; gap = NOT answered. */
export type QueryLogOutcome = 'answered' | 'empty' | 'gap';

/** Every value is a string exactly as it appears in the URL / API query string. */
export interface QueryLogFilterParams {
  /** ISO datetime with offset, or YYYY-MM-DD (00:00 Asia/Ho_Chi_Minh). Half-open: [from, to). */
  from?: string;
  to?: string;
  datasourceCode?: string;
  /** CSV of success|failed|denied, e.g. "failed,denied". */
  status?: string;
  outcome?: QueryLogOutcome;
  /** uuid or QUERY_LOG_NULL_TOKEN. */
  userId?: string;
  /** Case-insensitive contains. */
  username?: string;
  /** 100-599 or QUERY_LOG_NULL_TOKEN. */
  statusCode?: string;
  errorCode?: string;
  ip?: string;
  durationMinMs?: string;
  durationMaxMs?: string;
  /** 'true' => record_count>0, 'false' => COALESCE(record_count,0)<=0. */
  hasRecords?: 'true' | 'false';
  upstreamRequestId?: string;
  /** 'true' => only outside working hours (see QUERY_INSIGHTS_RULES). */
  offHours?: 'true';
}

/** Stable key order for URL (de)serialisation. */
export const QUERY_LOG_FILTER_KEYS = [
  'from',
  'to',
  'datasourceCode',
  'status',
  'outcome',
  'userId',
  'username',
  'statusCode',
  'errorCode',
  'ip',
  'durationMinMs',
  'durationMaxMs',
  'hasRecords',
  'upstreamRequestId',
  'offHours',
] as const satisfies readonly (keyof QueryLogFilterParams)[];

export type QueryStatsCounterKey =
  | 'requests'
  | 'answered'
  | 'gap'
  | 'success'
  | 'empty'
  | 'failed'
  | 'denied'
  | 'errors';

/** Which History filter reproduces each Stats counter exactly. */
export const STATS_COUNTER_HISTORY_FILTER: Record<QueryStatsCounterKey, Partial<QueryLogFilterParams>> = {
  requests: {},
  answered: { outcome: 'answered' },
  gap: { outcome: 'gap' },
  empty: { outcome: 'empty' },
  success: { status: 'success' },
  failed: { status: 'failed' },
  denied: { status: 'denied' },
  errors: { status: 'failed,denied' },
};

/** Drops empty values; keys in QUERY_LOG_FILTER_KEYS order, then extras (page, sort...) alphabetically. */
export function buildHistorySearchParams(
  params: Partial<QueryLogFilterParams> & Record<string, string | undefined>,
): URLSearchParams {
  const out = new URLSearchParams();
  const known = new Set<string>(QUERY_LOG_FILTER_KEYS);
  const extras = Object.keys(params)
    .filter((k) => !known.has(k))
    .sort();
  for (const key of [...QUERY_LOG_FILTER_KEYS, ...extras]) {
    const value = (params as Record<string, string | undefined>)[key];
    if (value !== undefined && value !== null && value !== '') out.set(key, value);
  }
  return out;
}

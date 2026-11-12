/** Admin query-insights contracts (history:view_all; CSV needs history:export). */
import type { QueryStatsCounters } from './query-stats-types';

/** Tunable anomaly thresholds, returned in `rules` so the UI can display them. Change here only. */
export const QUERY_INSIGHTS_RULES = {
  /** Working hours in Asia/Ho_Chi_Minh: Mon-Fri, [start, end) hours. Weekends = off-hours; holidays unknown. */
  workStartHour: 7,
  workEndHour: 18,
  spikeMinCount: 20,
  spikeBaselineMultiplier: 3,
  spikeBaselineDays: 7,
  sharedIdentityMinUsers: 3,
  sharedIpMinUsers: 2,
  maxRangeDays: 90,
  maxRowsPerList: 100,
} as const;
export type QueryInsightsRules = typeof QUERY_INSIGHTS_RULES;

export type QueryInsightsTopMetric = 'requests' | 'failed' | 'denied' | 'gap';
export type QueryInsightsCsvTable =
  | 'top-users'
  | 'top-errors'
  | 'datasource-latency'
  | 'anomalies-spikes'
  | 'anomalies-off-hours'
  | 'anomalies-shared-identities'
  | 'anomalies-shared-ips';

export interface QueryInsightsTopUserRow extends QueryStatsCounters {
  userId: string | null;
  username: string;
  p95DurationMs: number | null;
  lastAt: string;
}
export interface QueryInsightsErrorRow {
  errorCode: string | null;
  statusCode: number | null;
  count: number;
}
export interface QueryInsightsLatencyRow {
  datasourceCode: string;
  name: string | null;
  requests: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  maxDurationMs: number | null;
}

export interface QueryInsightsDatasourceCount {
  datasourceCode: string;
  name: string | null;
  count: number;
}
export interface QueryInsightsIpUsage {
  ip: string;
  count: number;
  firstAt: string;
  lastAt: string;
}
export interface QueryInsightsUserAgentUsage {
  userAgent: string;
  count: number;
  lastAt: string;
}
export interface QueryInsightsUserActivity {
  user: { id: string; username: string; fullName: string | null; status: string; lastLoginAt: string | null } | null;
  username: string;
  /** All-time, not limited to the filter range. */
  firstAt: string | null;
  lastAt: string | null;
  totals: QueryStatsCounters;
  byDatasource: QueryInsightsDatasourceCount[];
  ips: QueryInsightsIpUsage[];
  userAgents: QueryInsightsUserAgentUsage[];
}
export interface QueryInsightsIpUserUsage {
  userId: string | null;
  username: string;
  count: number;
  firstAt: string;
  lastAt: string;
}
export interface QueryInsightsIpActivity {
  ip: string;
  firstAt: string | null;
  lastAt: string | null;
  totals: QueryStatsCounters;
  users: QueryInsightsIpUserUsage[];
  multiAccount: boolean;
  byDatasource: QueryInsightsDatasourceCount[];
  userAgents: QueryInsightsUserAgentUsage[];
}

export interface QueryInsightsSpikeRow {
  userId: string | null;
  username: string;
  /** VN calendar day YYYY-MM-DD. */
  day: string;
  count: number;
  baselineAvg: number;
}
export interface QueryInsightsOffHoursRow {
  userId: string | null;
  username: string;
  offHoursCount: number;
  total: number;
  ratio: number;
  firstAt: string;
  lastAt: string;
}
export interface QueryInsightsSharedIdentityRow {
  fieldNames: string[];
  /** Masked unless caller has history:view_sensitive. */
  valueDisplay: string;
  datasourceCodes: string[];
  distinctUsers: number;
  requests: number;
  users: { userId: string | null; username: string; count: number }[];
  firstAt: string;
  lastAt: string;
}
export interface QueryInsightsSharedIpRow {
  ip: string;
  distinctUsers: number;
  usernames: string[];
  requests: number;
  lastAt: string;
}
export interface QueryInsightsAnomalies {
  rules: QueryInsightsRules;
  spikes: QueryInsightsSpikeRow[];
  offHours: QueryInsightsOffHoursRow[];
  sharedIdentities: QueryInsightsSharedIdentityRow[];
  sharedIps: QueryInsightsSharedIpRow[];
}

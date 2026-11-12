import {
  buildHistorySearchParams,
  type QueryInsightsAnomalies,
  type QueryInsightsCsvTable,
  type QueryInsightsErrorRow,
  type QueryInsightsIpActivity,
  type QueryInsightsLatencyRow,
  type QueryInsightsTopMetric,
  type QueryInsightsTopUserRow,
  type QueryInsightsUserActivity,
} from '@shared/index';
import { apiFetch, apiFetchBlob } from '@/lib/api-client';
import type { InsightsFilter } from './use-insights-range-search-params';

const BASE = '/admin/query-insights';

function qs(filter: InsightsFilter, extra: Record<string, string | undefined> = {}): string {
  return `?${buildHistorySearchParams({ ...filter, ...extra }).toString()}`;
}

export const fetchTopUsers = (f: InsightsFilter, metric: QueryInsightsTopMetric) =>
  apiFetch<QueryInsightsTopUserRow[]>(`${BASE}/top-users${qs(f, { metric })}`);
export const fetchTopErrors = (f: InsightsFilter) => apiFetch<QueryInsightsErrorRow[]>(`${BASE}/top-errors${qs(f)}`);
export const fetchDatasourceLatency = (f: InsightsFilter) =>
  apiFetch<QueryInsightsLatencyRow[]>(`${BASE}/datasource-latency${qs(f)}`);
export const fetchAnomalies = (f: InsightsFilter) => apiFetch<QueryInsightsAnomalies>(`${BASE}/anomalies${qs(f)}`);
export const fetchUserActivity = (userId: string, f: InsightsFilter) =>
  apiFetch<QueryInsightsUserActivity>(`${BASE}/users/${encodeURIComponent(userId)}/activity${qs(f)}`);
/** IPv6 contains ":" -> must be encoded in the path segment. */
export const fetchIpActivity = (ip: string, f: InsightsFilter) =>
  apiFetch<QueryInsightsIpActivity>(`${BASE}/ips/${encodeURIComponent(ip)}/activity${qs(f)}`);

export interface InsightsCsvDownload {
  blob: Blob;
  filename: string;
}

/** `GET /admin/query-insights/export.csv?table=..` — needs history:export (+ view_all). */
export async function downloadInsightsCsv(
  table: QueryInsightsCsvTable,
  f: InsightsFilter,
  extra: Record<string, string | undefined> = {},
): Promise<InsightsCsvDownload> {
  const { blob, headers } = await apiFetchBlob(`${BASE}/export.csv${qs(f, { ...extra, table })}`);
  const match = /filename="?([^";]+)"?/i.exec(headers.get('Content-Disposition') ?? '');
  return { blob, filename: match?.[1] ?? `phan-tich-tra-cuu-${table}.csv` };
}

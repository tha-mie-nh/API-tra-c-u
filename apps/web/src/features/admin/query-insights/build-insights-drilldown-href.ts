import { buildHistorySearchParams, vnDateStartIso, vnNextDateStartIso, type QueryLogFilterParams } from '@shared/index';
import type { InsightsFilter } from './use-insights-range-search-params';

export const HISTORY_ROUTE = '/lich-su';
export const INSIGHTS_ROUTE = '/quan-tri/phan-tich-tra-cuu';

/** Link into Lịch sử: the insights range/datasource + extra exact filters. */
export function historyHref(filter: InsightsFilter, extra: Partial<QueryLogFilterParams> = {}): string {
  return `${HISTORY_ROUTE}?${buildHistorySearchParams({ ...filter, ...extra }).toString()}`;
}

/** Exact: one VN calendar day (YYYY-MM-DD) of a user (spike row). */
export function spikeDayHref(userId: string | null, day: string, datasourceCode?: string): string {
  return `${HISTORY_ROUTE}?${buildHistorySearchParams({
    from: vnDateStartIso(day),
    to: vnNextDateStartIso(day),
    datasourceCode,
    userId: userId ?? '__null__',
  }).toString()}`;
}

/** Exact: a user's off-hours queries in the insights range (same rule as the anomaly count). */
export function offHoursHref(filter: InsightsFilter, userId: string | null): string {
  return historyHref(filter, { userId: userId ?? '__null__', offHours: 'true' });
}

/** Path to the per-user / per-IP activity page, keeping the range query. IPv6 is encoded. */
export const userActivityPath = (userId: string, search: string) =>
  `${INSIGHTS_ROUTE}/nguoi-dung/${encodeURIComponent(userId)}${search ? `?${search}` : ''}`;
export const ipActivityPath = (ip: string, search: string) =>
  `${INSIGHTS_ROUTE}/ip/${encodeURIComponent(ip)}${search ? `?${search}` : ''}`;

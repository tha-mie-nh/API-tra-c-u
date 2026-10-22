import type { HistoryListResponse, QueryLogDetail, QueryLogStatus } from '@shared/index';
import { apiFetch } from '@/lib/api-client';

export interface HistoryListParams {
  username?: string;
  datasourceCode?: string;
  from?: string;
  to?: string;
  status?: QueryLogStatus;
  page?: number;
  pageSize?: number;
}

function buildQueryString(params: HistoryListParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** `GET /history` (reference-api-specification.md "History"). The backend
 * forces the scope to the caller when they only hold `history:view_own` —
 * this client never relies on that, it just doesn't render the control. */
export function fetchHistoryList(params: HistoryListParams): Promise<HistoryListResponse> {
  return apiFetch<HistoryListResponse>(`/history${buildQueryString(params)}`);
}

export function fetchHistoryDetail(id: string): Promise<QueryLogDetail> {
  return apiFetch<QueryLogDetail>(`/history/${id}`);
}

/** `GET /history/datasources` — every ENABLED datasource, not filtered by
 * the caller's own `api:*` permissions (unlike `useDatasources()`). Only
 * reachable with `history:view_all`, which is also the only case the "lọc
 * theo API" dropdown renders for (see `HistoryFilters`). */
export function fetchHistoryDatasourceOptions(): Promise<{ code: string; name: string }[]> {
  return apiFetch<{ code: string; name: string }[]>('/history/datasources');
}

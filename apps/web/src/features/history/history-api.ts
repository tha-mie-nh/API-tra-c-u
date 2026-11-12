import {
  buildHistorySearchParams,
  type HistoryListResponse,
  type HistorySortField,
  type HistorySummaryResponse,
  type QueryLogDetail,
  type QueryLogFilterParams,
} from '@shared/index';
import { ApiError, apiFetch, apiFetchBlob } from '@/lib/api-client';
import { isHistoryRecordId } from './history-record-id';

export type HistoryOrder = 'asc' | 'desc';

/** Filter (shared vocabulary with Stats/CSV) + sort + offset paging. */
export type HistoryListParams = QueryLogFilterParams & {
  sort?: HistorySortField;
  order?: HistoryOrder;
  page: number;
  pageSize: number;
};

/** Query string (with leading `?`, or '') — key names = API names. */
function toQueryString(params: object): string {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params as Record<string, string | number | undefined>)) flat[k] = v === undefined ? undefined : String(v);
  const qs = buildHistorySearchParams(flat).toString();
  return qs ? `?${qs}` : '';
}

/** `GET /history`. Scope for `history:view_own` is forced by the backend. */
export function fetchHistoryList(params: HistoryListParams): Promise<HistoryListResponse> {
  return apiFetch<HistoryListResponse>(`/history${toQueryString(params)}`);
}

/** `GET /history/summary` — `history:view_all` only; same filter => same `total` as the list. */
export function fetchHistorySummary(filter: QueryLogFilterParams): Promise<HistorySummaryResponse> {
  return apiFetch<HistorySummaryResponse>(`/history/summary${toQueryString(filter)}`);
}

export function fetchHistoryDetail(id: string): Promise<QueryLogDetail> {
  if (!isHistoryRecordId(id)) return Promise.reject(new ApiError(404, 'NOT_FOUND', 'Invalid history id', ''));
  return apiFetch<QueryLogDetail>(`/history/${encodeURIComponent(id)}`);
}

export interface HistoryCsvDownload {
  blob: Blob;
  filename: string;
  total: number | null;
  exported: number | null;
  truncated: boolean;
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** `GET /history/export.csv` with the current filter (no paging/sort). Needs `history:export`. */
export async function downloadHistoryCsv(filter: QueryLogFilterParams): Promise<HistoryCsvDownload> {
  const { blob, headers } = await apiFetchBlob(`/history/export.csv${toQueryString(filter)}`);
  const match = /filename="?([^";]+)"?/i.exec(headers.get('Content-Disposition') ?? '');
  return {
    blob,
    filename: match?.[1] ?? 'lich-su-tra-cuu.csv',
    total: headerNumber(headers, 'X-Export-Total'),
    exported: headerNumber(headers, 'X-Export-Exported'),
    truncated: headers.get('X-Export-Truncated') === 'true',
  };
}

/** `GET /history/datasources` — every ENABLED datasource (only for `history:view_all`). */
export function fetchHistoryDatasourceOptions(): Promise<{ code: string; name: string }[]> {
  return apiFetch<{ code: string; name: string }[]>('/history/datasources');
}

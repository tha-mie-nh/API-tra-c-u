import type {
  QueryStatsDatasourceDetailResponse,
  QueryStatsGranularity,
  QueryStatsOverviewResponse,
  QueryStatsPreset,
} from '@shared/index';
import { apiFetch } from '@/lib/api-client';

export interface QueryStatsParams {
  preset: QueryStatsPreset;
  /** YYYY-MM-DD, only for preset=custom. */
  from?: string;
  to?: string;
  /** Manual bucket size; omitted => backend picks automatically. */
  granularity?: QueryStatsGranularity;
}

function buildQueryString(params: QueryStatsParams): string {
  const search = new URLSearchParams({ preset: params.preset });
  if (params.preset === 'custom') {
    if (params.from) search.set('from', params.from);
    if (params.to) search.set('to', params.to);
  }
  if (params.granularity) search.set('granularity', params.granularity);
  return `?${search.toString()}`;
}

/** `GET /admin/query-stats/overview`. */
export function fetchQueryStatsOverview(params: QueryStatsParams): Promise<QueryStatsOverviewResponse> {
  return apiFetch<QueryStatsOverviewResponse>(`/admin/query-stats/overview${buildQueryString(params)}`);
}

/** `GET /admin/query-stats/datasources/:code`. */
export function fetchQueryStatsDatasourceDetail(
  code: string,
  params: QueryStatsParams,
): Promise<QueryStatsDatasourceDetailResponse> {
  return apiFetch<QueryStatsDatasourceDetailResponse>(
    `/admin/query-stats/datasources/${encodeURIComponent(code)}${buildQueryString(params)}`,
  );
}

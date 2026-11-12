import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { HistorySortField, QueryLogFilterParams } from '@shared/index';
import type { HistoryListParams } from './history-api';
import { parseHistorySearchParams, pickFilter, serializeHistorySearchParams } from './history-search-params';

/**
 * History state lives in the URL (reload / Back / shared link keep it).
 * Apply & sort => push (Back undoes); paging & detail dialog => replace.
 */
export function useHistorySearchParams() {
  const [sp, setSp] = useSearchParams();
  const { params, detail } = useMemo(() => parseHistorySearchParams(sp), [sp]);
  const filter = useMemo(() => pickFilter(params), [params]);

  const write = useCallback(
    (next: HistoryListParams, nextDetail: string | null, replace: boolean) =>
      setSp(serializeHistorySearchParams(next, nextDetail), { replace }),
    [setSp],
  );

  const applyFilter = useCallback(
    (next: QueryLogFilterParams) =>
      write({ ...next, sort: params.sort, order: params.order, page: 1, pageSize: params.pageSize }, null, false),
    [write, params],
  );
  const resetFilter = useCallback(() => applyFilter({}), [applyFilter]);
  const setPage = useCallback((page: number) => write({ ...params, page }, detail, true), [write, params, detail]);
  /** Same field toggles asc/desc; a new field starts at desc. */
  const toggleSort = useCallback(
    (field: HistorySortField) => {
      const order = (params.sort ?? 'createdAt') === field && (params.order ?? 'desc') === 'desc' ? 'asc' : 'desc';
      write({ ...params, sort: field, order, page: 1 }, null, false);
    },
    [write, params],
  );
  const openDetail = useCallback((id: string) => write(params, id, true), [write, params]);
  const closeDetail = useCallback(() => write(params, null, true), [write, params]);

  return { params, filter, detail, applyFilter, resetFilter, setPage, toggleSort, openDetail, closeDetail };
}

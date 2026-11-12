import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES, HISTORY_MAX_OFFSET, type HistoryListResponse } from '@shared/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPagination } from '@/components/common/list-pagination';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { fetchHistoryList } from './history-api';
import { omitViewAllOnlyFilters } from './history-search-params';
import { useHistorySearchParams } from './use-history-search-params';
import { HistoryFilters } from './history-filters';
import { HistoryTable } from './history-table';
import { HistoryDetailDialog } from './history-detail-dialog';
import { HistorySummaryCards } from './history-summary-cards';
import { HistoryExportCsvButton } from './history-export-csv-button';

/** `/lich-su` (S4) — all filters/sort/page/detail live in the URL (see use-history-search-params). */
export function HistoryPage() {
  const canViewAll = useAuthStore((s) => s.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL));
  const h = useHistorySearchParams();
  // view_own: the backend ignores userId/username/ip; drop them so UI and request agree.
  const filter = useMemo(() => (canViewAll ? h.filter : omitViewAllOnlyFilters(h.filter)), [canViewAll, h.filter]);
  const { sort, order, page, pageSize } = h.params;
  const listParams = { ...filter, sort, order, page, pageSize };

  const query = useQuery<HistoryListResponse>({
    queryKey: ['history', listParams],
    queryFn: () => fetchHistoryList(listParams),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{vi.history.title}</h1>
        <HistoryExportCsvButton filter={filter} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{vi.history.filterTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryFilters filters={filter} onApply={h.applyFilter} />
        </CardContent>
      </Card>

      <HistorySummaryCards filter={filter} />

      <div className="flex flex-col gap-4">
        {query.isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {query.isError && (
          <p role="alert" className="text-destructive text-sm">
            {query.error instanceof ApiError
              ? query.error.status === 422 && h.params.page * h.params.pageSize > HISTORY_MAX_OFFSET
                ? vi.history.offsetLimitHint
                : query.error.message
              : vi.adminCommon.genericError}
          </p>
        )}
        {query.data && (
          <>
            <HistoryTable
              items={query.data.items}
              onViewDetail={h.openDetail}
              sort={h.params.sort ?? 'createdAt'}
              order={h.params.order ?? 'desc'}
              onSort={h.toggleSort}
            />
            <ListPagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onPageChange={h.setPage}
            />
          </>
        )}
      </div>

      <HistoryDetailDialog id={h.detail} canViewAll={canViewAll} onOpenChange={(open) => !open && h.closeDetail()} />
    </div>
  );
}

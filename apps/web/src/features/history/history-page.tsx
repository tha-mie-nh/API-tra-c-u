import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { HistoryListResponse } from '@shared/index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPagination } from '@/components/common/list-pagination';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api-client';
import { fetchHistoryList, type HistoryListParams } from './history-api';
import { HistoryFilters } from './history-filters';
import { HistoryTable } from './history-table';
import { HistoryDetailDialog } from './history-detail-dialog';

const DEFAULT_PAGE_SIZE = 20;

/** `/lich-su` (S4) — filters + server-paginated table + detail dialog. */
export function HistoryPage() {
  const [filters, setFilters] = useState<HistoryListParams>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useQuery<HistoryListResponse>({
    queryKey: ['history', filters],
    queryFn: () => fetchHistoryList(filters),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{vi.history.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{vi.adminCommon.apply}</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryFilters filters={filters} onApply={setFilters} />
        </CardContent>
      </Card>

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
            {query.error instanceof ApiError ? query.error.message : vi.adminCommon.genericError}
          </p>
        )}
        {query.data && (
          <>
            <HistoryTable items={query.data.items} onViewDetail={setDetailId} />
            <ListPagination
              page={query.data.page}
              pageSize={query.data.pageSize}
              total={query.data.total}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            />
          </>
        )}
      </div>

      <HistoryDetailDialog id={detailId} onOpenChange={(open) => !open && setDetailId(null)} />
    </div>
  );
}

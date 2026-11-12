import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { HistorySortField } from '@shared/index';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPagination } from '@/components/common/list-pagination';
import { vi } from '@/i18n/vi';
import { fetchHistoryList } from '@/features/history/history-api';
import { HistoryTable } from '@/features/history/history-table';
import { HistoryDetailDialog } from '@/features/history/history-detail-dialog';
import { QueryInsightsLoadError } from './query-insights-load-error';
import { QueryInsightsSection } from './query-insights-section';
import { historyHref } from './build-insights-drilldown-href';
import { Link } from 'react-router';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;
const PAGE_SIZE = 20;

/** Timeline = the History list (same component + endpoint) filtered by user/IP; row click opens the detail dialog. */
export function QueryInsightsActivityTimeline({ filter, base }: { filter: InsightsFilter; base: Record<string, string> }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ field: HistorySortField; order: 'asc' | 'desc' }>({ field: 'createdAt', order: 'desc' });
  const [detail, setDetail] = useState<string | null>(null);
  const params = { ...filter, ...base, sort: sort.field, order: sort.order, page, pageSize: PAGE_SIZE };
  const q = useQuery({ queryKey: ['qi', 'timeline', params], queryFn: () => fetchHistoryList(params) });

  const toggleSort = (field: HistorySortField) => {
    setPage(1);
    setSort((s) => ({ field, order: s.field === field && s.order === 'desc' ? 'asc' : 'desc' }));
  };

  return (
    <QueryInsightsSection
      title={t.timelineTitle}
      action={
        <Link to={historyHref(filter, base)} className="text-primary text-sm underline-offset-2 hover:underline">
          {t.viewInHistory}
        </Link>
      }
    >
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.isError && <QueryInsightsLoadError error={q.error} />}
      {q.data && (
        <div className="flex flex-col gap-4">
          <HistoryTable items={q.data.items} onViewDetail={setDetail} sort={sort.field} order={sort.order} onSort={toggleSort} />
          <ListPagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPageChange={setPage} />
        </div>
      )}
      <HistoryDetailDialog id={detail} canViewAll onOpenChange={(open) => !open && setDetail(null)} />
    </QueryInsightsSection>
  );
}

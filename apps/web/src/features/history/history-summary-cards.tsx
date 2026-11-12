import { useQuery } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES, type HistorySummaryResponse, type QueryLogFilterParams } from '@shared/index';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { fetchHistorySummary } from './history-api';

const ms = (v: number | null) => (v === null ? '—' : `${formatNumber(Math.round(v))} ms`);
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

function cells(s: HistorySummaryResponse): [string, string][] {
  return [
    [vi.history.summaryTotal, formatNumber(s.total)],
    [vi.history.summarySuccessRate, pct(s.successRate)],
    [vi.history.summaryAvg, ms(s.avgDurationMs)],
    [vi.history.summaryP95, ms(s.p95DurationMs)],
    [vi.history.summaryGap, formatNumber(s.gap)],
    [vi.history.summaryEmpty, formatNumber(s.empty)],
  ];
}

/** Quick stats for the current filter. Only `history:view_all` can call `/history/summary`. */
export function HistorySummaryCards({ filter }: { filter: QueryLogFilterParams }) {
  const canViewAll = useAuthStore((s) => s.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL));
  const query = useQuery({
    queryKey: ['history-summary', filter],
    queryFn: () => fetchHistorySummary(filter),
    enabled: canViewAll,
  });
  if (!canViewAll) return null;

  return (
    <section aria-label={vi.history.summaryTitle} className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {query.isLoading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      {query.isError && (
        <p role="alert" className="text-destructive col-span-full text-sm">
          {vi.history.summaryError}
        </p>
      )}
      {query.data &&
        cells(query.data).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-1 p-3">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className="text-lg font-semibold">{value}</span>
            </CardContent>
          </Card>
        ))}
    </section>
  );
}

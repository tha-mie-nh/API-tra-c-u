import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { vi } from '@/i18n/vi';
import { useCanDrillDown } from './use-can-drill-down';
import { formatRangeVn } from './format-range-vn';
import { QueryStatsLoadError } from './query-stats-load-error';
import type { DrilldownScope } from './build-stats-drilldown-href';
import { fetchQueryStatsOverview } from './query-stats-api';
import { useQueryStatsRangeSearchParams } from './use-query-stats-range-search-params';
import { QueryStatsRangePicker } from './query-stats-range-picker';
import { QueryStatsSummaryCards } from './query-stats-summary-cards';
import { QueryStatsBarChart } from './query-stats-bar-chart';
import { QueryStatsTopErrorsTable } from './query-stats-top-errors-table';
import { QueryStatsDatasourceTable } from './query-stats-datasource-table';

const t = vi.admin.queryStats;

/** `/quan-tri/thong-ke` — aggregated query-log statistics across all datasources. */
export function QueryStatsOverviewPage() {
  const range = useQueryStatsRangeSearchParams();
  const { apiParams } = range;
  const query = useQuery({
    queryKey: ['query-stats', 'overview', apiParams],
    queryFn: () => fetchQueryStatsOverview(apiParams!),
    enabled: apiParams !== null,
  });
  const data = query.data;
  const canDrill = useCanDrillDown();
  const drill: DrilldownScope | undefined =
    canDrill && data ? { range: data.range } : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <QueryStatsRangePicker
        {...range}
        onPreset={range.setPreset}
        onCustom={range.setCustom}
        onGranularity={range.setGranularity}
        effectiveGranularity={data?.range.granularity}
      />
      {data && (
        <p className="text-muted-foreground text-sm">
          {formatRangeVn(data.range.from, data.range.to)}
        </p>
      )}

      {query.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {query.isError && <QueryStatsLoadError error={query.error} />}
      {data && data.totals.requests === 0 && <p className="text-muted-foreground text-sm">{t.empty}</p>}
      {data && data.totals.requests > 0 && (
        <>
          <QueryStatsSummaryCards totals={data.totals} previous={data.previous} drill={drill} />
          <Card>
            <CardHeader><CardTitle>{t.chartTitle}</CardTitle></CardHeader>
            <CardContent><QueryStatsBarChart buckets={data.timeseries} granularity={data.range.granularity} drill={drill} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.dsTitle}</CardTitle></CardHeader>
            <CardContent><QueryStatsDatasourceTable rows={data.byDatasource} searchString={range.searchString} drill={drill} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.errorsTitle}</CardTitle></CardHeader>
            <CardContent><QueryStatsTopErrorsTable items={data.topErrors} drill={drill} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

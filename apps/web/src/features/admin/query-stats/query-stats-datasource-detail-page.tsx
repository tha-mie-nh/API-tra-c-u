import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { vi } from '@/i18n/vi';
import { useCanDrillDown } from './use-can-drill-down';
import { formatRangeVn } from './format-range-vn';
import { QueryStatsLoadError } from './query-stats-load-error';
import type { DrilldownScope } from './build-stats-drilldown-href';
import { fetchQueryStatsDatasourceDetail } from './query-stats-api';
import { useQueryStatsRangeSearchParams } from './use-query-stats-range-search-params';
import { QueryStatsRangePicker } from './query-stats-range-picker';
import { QueryStatsSummaryCards } from './query-stats-summary-cards';
import { QueryStatsBarChart } from './query-stats-bar-chart';
import { QueryStatsTopErrorsTable } from './query-stats-top-errors-table';

const t = vi.admin.queryStats;

/** `/quan-tri/thong-ke/:code` — same widgets as overview, scoped to one datasource. */
export function QueryStatsDatasourceDetailPage() {
  const { code = '' } = useParams<{ code: string }>();
  const range = useQueryStatsRangeSearchParams();
  const { apiParams } = range;
  const query = useQuery({
    queryKey: ['query-stats', 'datasource', code, apiParams],
    queryFn: () => fetchQueryStatsDatasourceDetail(code, apiParams!),
    enabled: apiParams !== null && code !== '',
  });
  const data = query.data;
  const canDrill = useCanDrillDown();
  const drill: DrilldownScope | undefined =
    canDrill && data ? { range: data.range, datasourceCode: code } : undefined;
  const backTo = `/quan-tri/thong-ke${range.searchString ? `?${range.searchString}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to={backTo} className="text-muted-foreground hover:text-foreground text-sm">
          ← {t.backToOverview}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {data?.datasource.name ?? code}
          {data && data.datasource.name === null && <Badge variant="outline">{t.deletedDatasource}</Badge>}
        </h1>
        <span className="text-muted-foreground font-mono text-xs">{code}</span>
      </div>
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
            <CardHeader><CardTitle>{t.errorsTitle}</CardTitle></CardHeader>
            <CardContent><QueryStatsTopErrorsTable items={data.topErrors} drill={drill} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

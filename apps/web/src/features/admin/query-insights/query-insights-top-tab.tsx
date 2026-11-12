import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUERY_INSIGHTS_RULES, type QueryInsightsTopMetric } from '@shared/index';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { vi } from '@/i18n/vi';
import { fetchDatasourceLatency, fetchTopErrors, fetchTopUsers } from './query-insights-api';
import { QueryInsightsExportCsvButton } from './query-insights-export-csv-button';
import { QueryInsightsLoadError } from './query-insights-load-error';
import { QueryInsightsSection } from './query-insights-section';
import { QueryInsightsTopUsersTable } from './query-insights-top-users-table';
import { QueryInsightsErrorsTable, QueryInsightsLatencyTable } from './query-insights-errors-latency-tables';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;
const METRICS: { value: QueryInsightsTopMetric; label: string }[] = [
  { value: 'requests', label: t.metricRequests },
  { value: 'failed', label: t.metricFailed },
  { value: 'denied', label: t.metricDenied },
  { value: 'gap', label: t.metricGap },
];

function Loading() {
  return <Skeleton className="h-24 w-full" />;
}

/** Tab "Tổng quan": top users (metric), top errors, slowest datasources. */
export function QueryInsightsTopTab({ filter, rangeSearch }: { filter: InsightsFilter; rangeSearch: string }) {
  const [metric, setMetric] = useState<QueryInsightsTopMetric>('requests');
  const users = useQuery({ queryKey: ['qi', 'top-users', filter, metric], queryFn: () => fetchTopUsers(filter, metric) });
  const errors = useQuery({ queryKey: ['qi', 'top-errors', filter], queryFn: () => fetchTopErrors(filter) });
  const latency = useQuery({ queryKey: ['qi', 'latency', filter], queryFn: () => fetchDatasourceLatency(filter) });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-xs">{t.listCap(QUERY_INSIGHTS_RULES.maxRowsPerList)}</p>
      <QueryInsightsSection
        title={t.topUsersTitle}
        action={<QueryInsightsExportCsvButton table="top-users" label={t.topUsersTitle} filter={filter} extra={{ metric }} />}
      >
        <div className="mb-3 flex items-center gap-2">
          <Label htmlFor="qi-metric">{t.metricLabel}</Label>
          <select
            id="qi-metric"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            value={metric}
            onChange={(e) => setMetric(e.target.value as QueryInsightsTopMetric)}
          >
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        {users.isLoading && <Loading />}
        {users.isError && <QueryInsightsLoadError error={users.error} />}
        {users.data && <QueryInsightsTopUsersTable rows={users.data} filter={filter} rangeSearch={rangeSearch} />}
      </QueryInsightsSection>

      <QueryInsightsSection
        title={t.topErrorsTitle}
        action={<QueryInsightsExportCsvButton table="top-errors" label={t.topErrorsTitle} filter={filter} />}
      >
        {errors.isLoading && <Loading />}
        {errors.isError && <QueryInsightsLoadError error={errors.error} />}
        {errors.data && <QueryInsightsErrorsTable rows={errors.data} filter={filter} />}
      </QueryInsightsSection>

      <QueryInsightsSection
        title={t.latencyTitle}
        action={<QueryInsightsExportCsvButton table="datasource-latency" label={t.latencyTitle} filter={filter} />}
      >
        {latency.isLoading && <Loading />}
        {latency.isError && <QueryInsightsLoadError error={latency.error} />}
        {latency.data && <QueryInsightsLatencyTable rows={latency.data} filter={filter} />}
      </QueryInsightsSection>
    </div>
  );
}

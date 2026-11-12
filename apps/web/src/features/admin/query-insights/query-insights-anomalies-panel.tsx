import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { vi } from '@/i18n/vi';
import { fetchAnomalies } from './query-insights-api';
import { QueryInsightsAnomalyRules } from './query-insights-anomaly-rules';
import { OffHoursTable, SharedIdentitiesTable, SharedIpsTable, SpikesTable } from './query-insights-anomaly-tables';
import { QueryInsightsExportCsvButton } from './query-insights-export-csv-button';
import { QueryInsightsLoadError } from './query-insights-load-error';
import { QueryInsightsSection } from './query-insights-section';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;

/** Tab "Bất thường": rules + 4 tables from one `GET /anomalies` call. */
export function QueryInsightsAnomaliesPanel({ filter, rangeSearch }: { filter: InsightsFilter; rangeSearch: string }) {
  const q = useQuery({ queryKey: ['qi', 'anomalies', filter], queryFn: () => fetchAnomalies(filter) });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <QueryInsightsLoadError error={q.error} />;
  if (!q.data) return null;
  const d = q.data;
  const common = { filter, rangeSearch };
  const csv = (table: Parameters<typeof QueryInsightsExportCsvButton>[0]['table'], label: string) => (
    <QueryInsightsExportCsvButton table={table} label={label} filter={filter} />
  );
  return (
    <div className="flex flex-col gap-6">
      <QueryInsightsAnomalyRules rules={d.rules} />
      <QueryInsightsSection title={t.spikesTitle} action={csv('anomalies-spikes', t.spikesTitle)}>
        <SpikesTable rows={d.spikes} {...common} />
      </QueryInsightsSection>
      <QueryInsightsSection title={t.offHoursTitle} action={csv('anomalies-off-hours', t.offHoursTitle)}>
        <OffHoursTable rows={d.offHours} {...common} />
      </QueryInsightsSection>
      <QueryInsightsSection title={t.sharedIdentTitle} action={csv('anomalies-shared-identities', t.sharedIdentTitle)}>
        <SharedIdentitiesTable rows={d.sharedIdentities} {...common} />
      </QueryInsightsSection>
      <QueryInsightsSection title={t.sharedIpTitle} action={csv('anomalies-shared-ips', t.sharedIpTitle)}>
        <SharedIpsTable rows={d.sharedIps} {...common} />
      </QueryInsightsSection>
    </div>
  );
}

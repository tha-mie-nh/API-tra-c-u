import { vi } from '@/i18n/vi';
import { Button } from '@/components/ui/button';
import { QueryInsightsAnomaliesPanel } from './query-insights-anomalies-panel';
import { QueryInsightsRangeBar } from './query-insights-range-bar';
import { QueryInsightsTopTab } from './query-insights-top-tab';
import { useInsightsRangeSearchParams } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;

/** `/quan-tri/phan-tich-tra-cuu` — range in the URL (?from&to&datasourceCode&tab), tabs Tổng quan / Bất thường. */
export function QueryInsightsPage() {
  const r = useInsightsRangeSearchParams();
  const tabs = [
    { id: 'top' as const, label: t.tabTop },
    { id: 'anomalies' as const, label: t.tabAnomalies },
  ];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <QueryInsightsRangeBar
        from={r.from}
        to={r.to}
        datasourceCode={r.datasourceCode}
        error={r.error}
        onRange={r.setRange}
        onDatasource={r.setDatasource}
      />
      <div role="tablist" aria-label={t.title} className="flex gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            role="tab"
            aria-selected={r.tab === tab.id}
            size="sm"
            variant={r.tab === tab.id ? 'default' : 'outline'}
            onClick={() => r.setTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {r.filter && r.tab === 'top' && <QueryInsightsTopTab filter={r.filter} rangeSearch={r.rangeSearch} />}
      {r.filter && r.tab === 'anomalies' && <QueryInsightsAnomaliesPanel filter={r.filter} rangeSearch={r.rangeSearch} />}
    </div>
  );
}

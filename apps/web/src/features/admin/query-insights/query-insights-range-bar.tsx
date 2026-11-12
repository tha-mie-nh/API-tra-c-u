import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { vi } from '@/i18n/vi';
import { fetchHistoryDatasourceOptions } from '@/features/history/history-api';
import {
  rangeEndingAt,
  validateInsightsRange,
  vnToday,
  type InsightsRangeError,
} from './use-insights-range-search-params';
import { QUERY_INSIGHTS_RULES } from '@shared/index';

const t = vi.admin.queryInsights;
const PRESETS = [
  { days: 7, label: t.last7 },
  { days: 30, label: t.last30 },
  { days: 90, label: t.last90 },
];

export function insightsRangeErrorText(err: InsightsRangeError): string {
  if (err === 'missing') return t.errMissing;
  if (err === 'order') return t.errOrder;
  if (err === 'tooLong') return t.errTooLong(QUERY_INSIGHTS_RULES.maxRangeDays);
  return '';
}

interface Props {
  from: string;
  to: string;
  datasourceCode?: string;
  /** URL-level error (invalid range typed into the address bar). */
  error: InsightsRangeError;
  onRange: (from: string, to: string) => void;
  onDatasource: (code: string) => void;
  /** Hide the datasource select (e.g. when options cannot be loaded). */
  showDatasource?: boolean;
}

/** Date range (<= 90 days, VN days) + datasource select. Validates before writing to the URL. */
export function QueryInsightsRangeBar({ from, to, datasourceCode, error, onRange, onDatasource, showDatasource = true }: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [draftError, setDraftError] = useState<InsightsRangeError>(null);
  const options = useQuery({
    queryKey: ['history-datasource-options'],
    queryFn: fetchHistoryDatasourceOptions,
    enabled: showDatasource,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setDraftError(null);
  }, [from, to]);

  const apply = () => {
    const err = validateInsightsRange(draftFrom, draftTo);
    setDraftError(err);
    if (!err) onRange(draftFrom, draftTo);
  };
  const shown = draftError ?? error;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.rangeLabel}>
        {PRESETS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant="outline"
            onClick={() => {
              const r = rangeEndingAt(vnToday(), p.days);
              onRange(r.from, r.to);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qi-from">{t.from}</Label>
          <Input id="qi-from" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qi-to">{t.to}</Label>
          <Input id="qi-to" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
        </div>
        {showDatasource && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qi-ds">{t.datasource}</Label>
            <select
              id="qi-ds"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={datasourceCode ?? ''}
              onChange={(e) => onDatasource(e.target.value)}
            >
              <option value="">{t.allDatasources}</option>
              {(options.data ?? []).map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button size="sm" onClick={apply}>
          {t.apply}
        </Button>
      </div>
      {shown && (
        <p role="alert" className="text-destructive text-sm">
          {insightsRangeErrorText(shown)}
        </p>
      )}
    </div>
  );
}

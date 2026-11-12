import { useEffect, useState } from 'react';
import { QUERY_STATS_MAX_RANGE_DAYS, type QueryStatsGranularity, type QueryStatsPreset } from '@shared/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { vi } from '@/i18n/vi';
import { QueryStatsGranularitySelect } from './query-stats-granularity-select';
import { validateCustomRange, type RangeError } from './use-query-stats-range-search-params';

const t = vi.admin.queryStats;
const PRESET_BUTTONS: { value: Exclude<QueryStatsPreset, 'custom'>; label: string }[] = [
  { value: 'today', label: t.presetToday },
  { value: 'yesterday', label: t.presetYesterday },
  { value: 'last_24h', label: t.presetLast24h },
  { value: 'last_7d', label: t.presetLast7d },
  { value: 'last_30d', label: t.presetLast30d },
  { value: 'last_90d', label: t.presetLast90d },
  { value: 'this_month', label: t.presetThisMonth },
  { value: 'last_month', label: t.presetLastMonth },
  { value: 'this_year', label: t.presetThisYear },
];

function errorText(err: RangeError): string {
  if (err === 'missing') return t.errMissingDates;
  if (err === 'order') return t.errFromAfterTo;
  if (err === 'tooLong') return t.errTooLong(QUERY_STATS_MAX_RANGE_DAYS);
  return '';
}

interface Props {
  preset: QueryStatsPreset;
  from: string;
  to: string;
  onPreset: (preset: Exclude<QueryStatsPreset, 'custom'>) => void;
  onCustom: (from: string, to: string) => void;
  granularity: QueryStatsGranularity | undefined;
  onGranularity: (g: QueryStatsGranularity | undefined) => void;
  /** Granularity used by the last API response (for the "Tự động" label). */
  effectiveGranularity?: QueryStatsGranularity;
}

/** Preset buttons + custom date range (validated before it reaches the URL/API). */
export function QueryStatsRangePicker({ preset, from, to, onPreset, onCustom, granularity, onGranularity, effectiveGranularity }: Props) {
  const [showCustom, setShowCustom] = useState(preset === 'custom');
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [error, setError] = useState<RangeError>(null);

  // URL is the source of truth: re-sync the drafts when it changes from outside
  // (browser Back/Forward, a shared link) instead of keeping the first-render values.
  useEffect(() => {
    setShowCustom(preset === 'custom');
    setDraftFrom(from);
    setDraftTo(to);
    setError(null);
  }, [preset, from, to]);

  const apply = () => {
    const err = validateCustomRange(draftFrom, draftTo);
    setError(err);
    if (!err) onCustom(draftFrom, draftTo);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.rangeLabel}>
        {PRESET_BUTTONS.map((b) => (
          <Button
            key={b.value}
            size="sm"
            variant={preset === b.value ? 'default' : 'outline'}
            onClick={() => {
              setShowCustom(false);
              setError(null);
              onPreset(b.value);
            }}
          >
            {b.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={preset === 'custom' || showCustom ? 'default' : 'outline'}
          onClick={() => setShowCustom(true)}
        >
          {t.presetCustom}
        </Button>
        <QueryStatsGranularitySelect value={granularity} effective={effectiveGranularity} onChange={onGranularity} />
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qs-from">{t.from}</Label>
            <Input id="qs-from" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qs-to">{t.to}</Label>
            <Input id="qs-to" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
          </div>
          <Button size="sm" onClick={apply}>
            {t.apply}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {errorText(error)}
        </p>
      )}
      {preset === 'custom' && !from && !to && !showCustom && <p className="text-muted-foreground text-sm">{t.pickCustom}</p>}
    </div>
  );
}

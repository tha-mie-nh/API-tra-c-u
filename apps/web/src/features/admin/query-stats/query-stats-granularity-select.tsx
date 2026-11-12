import type { QueryStatsGranularity } from '@shared/index';
import { Label } from '@/components/ui/label';
import { vi } from '@/i18n/vi';

const t = vi.admin.queryStats;
const OPTIONS: { value: QueryStatsGranularity; label: string }[] = [
  { value: 'hour', label: t.granHour },
  { value: 'day', label: t.granDay },
  { value: 'month', label: t.granMonth },
];

interface Props {
  /** undefined = automatic. */
  value: QueryStatsGranularity | undefined;
  /** Granularity the API actually used (shown for "Tự động"). */
  effective?: QueryStatsGranularity;
  onChange: (value: QueryStatsGranularity | undefined) => void;
}

/** Bucket size select: Tự động / Giờ / Ngày / Tháng. Native select keeps it keyboard + test friendly. */
export function QueryStatsGranularitySelect({ value, effective, onChange }: Props) {
  const autoLabel = effective && !value ? t.granAutoUsing(OPTIONS.find((o) => o.value === effective)?.label ?? '') : t.granAuto;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="qs-granularity">{t.granLabel}</Label>
      <select
        id="qs-granularity"
        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as QueryStatsGranularity | undefined)}
      >
        <option value="">{autoLabel}</option>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

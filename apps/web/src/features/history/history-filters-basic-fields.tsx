import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import { fetchHistoryDatasourceOptions } from './history-api';
import { HistoryDatetimeInput } from './history-datetime-input';
import type { HistoryFilterFieldsProps } from './history-filters-fields.types';

const ALL = '__all__';
const STATUS_OPTIONS = [
  { value: 'success', label: vi.history.statusSuccess },
  { value: 'failed', label: vi.history.statusFailed },
  { value: 'denied', label: vi.history.statusDenied },
];

const splitStatus = (csv: string | undefined) => (csv ? csv.split(',') : []);

/** Username (view_all) / datasource / multi-status / time range. */
export function HistoryFiltersBasicFields({ draft, set, canViewAll }: HistoryFilterFieldsProps) {
  const { data: datasourceOptions } = useQuery({
    queryKey: ['history-datasource-options'],
    queryFn: fetchHistoryDatasourceOptions,
    enabled: canViewAll,
    staleTime: 60_000,
  });
  const selected = splitStatus(draft.status);
  const toggleStatus = (value: string, checked: boolean) => {
    const next = STATUS_OPTIONS.map((o) => o.value).filter((v) => (v === value ? checked : selected.includes(v)));
    set('status', next.length ? next.join(',') : undefined);
  };

  return (
    <>
      {canViewAll && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-filter-user">{vi.history.filterUser}</Label>
          <Input
            id="history-filter-user"
            placeholder={vi.history.filterUserPlaceholder}
            value={draft.username ?? ''}
            onChange={(e) => set('username', e.target.value || undefined)}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>{vi.history.filterDatasource}</Label>
        <Select
          value={draft.datasourceCode ?? ALL}
          onValueChange={(value) => set('datasourceCode', value === ALL ? undefined : value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{vi.history.filterDatasourceAll}</SelectItem>
            {(datasourceOptions ?? []).map((ds) => (
              <SelectItem key={ds.code} value={ds.code}>
                {ds.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm leading-none font-medium">{vi.history.filterStatus}</legend>
        <div className="flex flex-wrap gap-3 pt-1">
          {STATUS_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-1.5">
              <Checkbox
                id={`history-filter-status-${o.value}`}
                checked={selected.includes(o.value)}
                onCheckedChange={(c) => toggleStatus(o.value, c === true)}
              />
              <Label htmlFor={`history-filter-status-${o.value}`}>{o.label}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      <HistoryDatetimeInput
        id="history-filter-from"
        kind="from"
        label={vi.history.filterFrom}
        value={draft.from}
        onChange={(v) => set('from', v)}
      />
      <HistoryDatetimeInput
        id="history-filter-to"
        kind="to"
        label={vi.history.filterTo}
        value={draft.to}
        onChange={(v) => set('to', v)}
      />
    </>
  );
}

import { QUERY_LOG_NULL_TOKEN } from '@shared/index';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { vi } from '@/i18n/vi';
import type { HistoryFilterFieldsProps } from './history-filters-fields.types';

const ANY = '__any__';

function TextField({ id, label, placeholder, value, onChange, inputMode, disabled }: {
  id: string;
  label: string;
  placeholder?: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  inputMode?: 'numeric';
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={inputMode}
        placeholder={placeholder}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() || undefined)}
      />
    </div>
  );
}

/** statusCode / errorCode / IP (view_all) / duration range / hasRecords / upstreamRequestId. */
export function HistoryFiltersAdvancedFields({ draft, set, canViewAll }: HistoryFilterFieldsProps) {
  const errorCodeNull = draft.errorCode === QUERY_LOG_NULL_TOKEN;
  return (
    <>
      <TextField
        id="history-filter-status-code"
        label={vi.history.filterStatusCodeLabel}
        placeholder={vi.history.filterStatusCodePlaceholder}
        inputMode="numeric"
        value={draft.statusCode}
        onChange={(v) => set('statusCode', v)}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          id="history-filter-error-code"
          label={vi.history.filterErrorCode}
          placeholder={vi.history.filterErrorCodePlaceholder}
          disabled={errorCodeNull}
          value={errorCodeNull ? '' : draft.errorCode}
          onChange={(v) => set('errorCode', v)}
        />
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="history-filter-error-code-null"
            checked={errorCodeNull}
            onCheckedChange={(c) => set('errorCode', c === true ? QUERY_LOG_NULL_TOKEN : undefined)}
          />
          <Label htmlFor="history-filter-error-code-null">{vi.history.filterErrorCodeNone}</Label>
        </div>
      </div>
      {canViewAll && (
        <TextField id="history-filter-ip" label={vi.history.filterIp} value={draft.ip} onChange={(v) => set('ip', v)} />
      )}
      <TextField
        id="history-filter-duration-min"
        label={vi.history.filterDurationMin}
        inputMode="numeric"
        value={draft.durationMinMs}
        onChange={(v) => set('durationMinMs', v)}
      />
      <TextField
        id="history-filter-duration-max"
        label={vi.history.filterDurationMax}
        inputMode="numeric"
        value={draft.durationMaxMs}
        onChange={(v) => set('durationMaxMs', v)}
      />
      <div className="flex flex-col gap-1.5">
        <Label>{vi.history.filterHasRecords}</Label>
        <Select
          value={draft.hasRecords ?? ANY}
          onValueChange={(v) => set('hasRecords', v === ANY ? undefined : (v as 'true' | 'false'))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{vi.history.filterHasRecordsAny}</SelectItem>
            <SelectItem value="true">{vi.history.filterHasRecordsYes}</SelectItem>
            <SelectItem value="false">{vi.history.filterHasRecordsNo}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TextField
        id="history-filter-upstream-request-id"
        label={vi.history.filterUpstreamRequestId}
        value={draft.upstreamRequestId}
        onChange={(v) => set('upstreamRequestId', v)}
      />
    </>
  );
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { QueryLogStatus } from '@shared/index';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateTextInput } from '@/components/common/date-text-input';
import { useAuthStore } from '@/lib/auth-store';
import { FEATURE_PERMISSION_CODES } from '@shared/index';
import { vi } from '@/i18n/vi';
import { fetchHistoryDatasourceOptions, type HistoryListParams } from './history-api';

const STATUS_ALL = '__all__';

interface HistoryFiltersProps {
  /** Currently APPLIED filters (what the table is actually showing) — only
   * used to seed the draft on mount/reset, never written to on every
   * keystroke (see `draft` below). */
  filters: HistoryListParams;
  /** Fires only on "Tìm lịch sử" / reset — review feedback: filters were
   * applying (and refetching) on every keystroke/select change, which is
   * both a flicker and an unnecessary request per character typed. */
  onApply: (filters: HistoryListParams) => void;
}

/**
 * Filter row for `HistoryPage` (S4). The username filter renders ONLY for
 * `history:view_all` holders (reference-screens-and-ux.md "Key Insight" —
 * the backend forces the scope regardless, this just avoids showing a
 * control that would 403 for a `view_own`-only user). Same permission gates
 * the datasource-filter dropdown's data source: `fetchHistoryDatasourceOptions`
 * (every enabled datasource) rather than `useDatasources()` (the caller's OWN
 * query permissions) — an AUDITOR has `history:view_all` but typically zero
 * `api:*` permissions, so the latter would always render empty for them.
 */
export function HistoryFilters({ filters, onApply }: HistoryFiltersProps) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canViewAll = hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL);
  const { data: datasourceOptions } = useQuery({
    queryKey: ['history-datasource-options'],
    queryFn: fetchHistoryDatasourceOptions,
    enabled: canViewAll,
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<HistoryListParams>(filters);
  // Keep the draft in sync when filters are applied/reset from elsewhere
  // (e.g. the reset button below), but never on every parent re-render —
  // `filters` only actually changes identity when an apply/reset happens.
  useEffect(() => setDraft(filters), [filters]);

  const set = <K extends keyof HistoryListParams>(key: K, value: HistoryListParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const apply = () => onApply({ ...draft, page: 1 });
  const reset = () => onApply({ page: 1, pageSize: filters.pageSize });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            value={draft.datasourceCode ?? STATUS_ALL}
            onValueChange={(value) => set('datasourceCode', value === STATUS_ALL ? undefined : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATUS_ALL}>{vi.history.filterDatasourceAll}</SelectItem>
              {(datasourceOptions ?? []).map((ds) => (
                <SelectItem key={ds.code} value={ds.code}>
                  {ds.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{vi.history.filterStatus}</Label>
          <Select
            value={draft.status ?? STATUS_ALL}
            onValueChange={(value) => set('status', value === STATUS_ALL ? undefined : (value as QueryLogStatus))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATUS_ALL}>{vi.history.filterStatusAll}</SelectItem>
              <SelectItem value="success">{vi.history.statusSuccess}</SelectItem>
              <SelectItem value="failed">{vi.history.statusFailed}</SelectItem>
              <SelectItem value="denied">{vi.history.statusDenied}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-filter-from">{vi.history.filterFrom}</Label>
          <DateTextInput
            id="history-filter-from"
            invalid={false}
            value={draft.from?.slice(0, 10) ?? ''}
            onChange={(iso) => set('from', iso || undefined)}
            onBlur={() => {}}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-filter-to">{vi.history.filterTo}</Label>
          <DateTextInput
            id="history-filter-to"
            invalid={false}
            value={draft.to?.slice(0, 10) ?? ''}
            onChange={(iso) => set('to', iso || undefined)}
            onBlur={() => {}}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={apply}>
          {vi.history.applyFilters}
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          {vi.adminCommon.reset}
        </Button>
      </div>
    </div>
  );
}

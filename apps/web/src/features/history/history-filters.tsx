import { useEffect, useState } from 'react';
import { FEATURE_PERMISSION_CODES, type QueryLogFilterParams } from '@shared/index';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/auth-store';
import { vi } from '@/i18n/vi';
import { HistoryActiveFilterChips } from './history-active-filter-chips';
import { HistoryFiltersAdvancedFields } from './history-filters-advanced-fields';
import { HistoryFiltersBasicFields } from './history-filters-basic-fields';
import type { HistoryFilterFieldsProps } from './history-filters-fields.types';

interface HistoryFiltersProps {
  /** Currently APPLIED filter (from the URL) — seeds the draft; never written per keystroke. */
  filters: QueryLogFilterParams;
  /** Fires only on "Tìm lịch sử" / reset / chip removal. */
  onApply: (filters: QueryLogFilterParams) => void;
}

/**
 * Filter form for `HistoryPage`. `username` / `ip` render ONLY for `history:view_all`
 * (backend ignores them for view_own — this avoids a control that does nothing).
 */
export function HistoryFilters({ filters, onApply }: HistoryFiltersProps) {
  const canViewAll = useAuthStore((s) => s.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL));
  const [draft, setDraft] = useState<QueryLogFilterParams>(filters);
  // `filters` changes identity only when the URL changed (apply / Back / chip removal).
  useEffect(() => setDraft(filters), [filters]);

  const set: HistoryFilterFieldsProps['set'] = (key, value) =>
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (value === undefined) delete next[key];
      return next;
    });
  const fieldProps = { draft, set, canViewAll };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HistoryFiltersBasicFields {...fieldProps} />
      </div>
      <details className="rounded-md border p-3" open={hasAdvanced(filters)}>
        <summary className="cursor-pointer text-sm font-medium">{vi.history.filterAdvanced}</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HistoryFiltersAdvancedFields {...fieldProps} />
        </div>
      </details>
      <HistoryActiveFilterChips
        filter={filters}
        canViewAll={canViewAll}
        onRemove={(key) => {
          const { [key]: _removed, ...rest } = filters;
          void _removed;
          onApply(rest);
        }}
      />
      <div className="flex gap-2">
        <Button type="submit">{vi.history.applyFilters}</Button>
        <Button type="button" variant="outline" onClick={() => onApply({})}>
          {vi.adminCommon.reset}
        </Button>
      </div>
    </form>
  );
}

const ADVANCED_KEYS = ['statusCode', 'errorCode', 'ip', 'durationMinMs', 'durationMaxMs', 'hasRecords', 'upstreamRequestId'] as const;
const hasAdvanced = (f: QueryLogFilterParams) => ADVANCED_KEYS.some((k) => f[k] !== undefined);

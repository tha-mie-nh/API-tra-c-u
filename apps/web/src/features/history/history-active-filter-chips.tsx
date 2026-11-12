import { X } from 'lucide-react';
import type { QueryLogFilterParams, QueryLogOutcome } from '@shared/index';
import { Badge } from '@/components/ui/badge';
import { vi } from '@/i18n/vi';

type ChipKey = 'outcome' | 'userId' | 'offHours';

interface Props {
  filter: QueryLogFilterParams;
  canViewAll: boolean;
  onRemove: (key: ChipKey) => void;
}

/** Chips for URL-only filters that have no form control (outcome, userId, offHours). */
export function HistoryActiveFilterChips({ filter, canViewAll, onRemove }: Props) {
  const chips: { key: ChipKey; label: string; text: string }[] = [];
  if (filter.outcome) {
    const text = vi.history.chipOutcome[filter.outcome as QueryLogOutcome];
    chips.push({ key: 'outcome', label: vi.history.chipOutcomeLabel, text });
  }
  if (filter.userId && canViewAll) {
    chips.push({ key: 'userId', label: vi.history.chipUserId, text: filter.userId });
  }
  if (filter.offHours) {
    chips.push({ key: 'offHours', label: vi.history.chipOffHours, text: vi.history.chipOffHours });
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="history-active-chips">
      <span className="text-muted-foreground">{vi.history.chipsPrefix}</span>
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1">
          {c.key === 'offHours' ? c.text : `${c.label}: ${c.text}`}
          <button
            type="button"
            aria-label={vi.history.chipRemove(c.label)}
            className="rounded-sm hover:opacity-70 focus-visible:ring-2"
            onClick={() => onRemove(c.key)}
          >
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      ))}
    </div>
  );
}

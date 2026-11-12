import { cn } from '@/lib/utils';
import { vi } from '@/i18n/vi';

export type HistoryDetailTab = 'overview' | 'input' | 'output';

/** Simple accessible tab bar. Input/output tabs are offered only when `showPayloadTabs`. */
export function HistoryDetailTabs({
  value,
  onChange,
  showPayloadTabs,
}: {
  value: HistoryDetailTab;
  onChange: (tab: HistoryDetailTab) => void;
  showPayloadTabs: boolean;
}) {
  if (!showPayloadTabs) return null;
  const tabs: { id: HistoryDetailTab; label: string }[] = [
    { id: 'overview', label: vi.history.tabOverview },
    { id: 'input', label: vi.history.tabInput },
    { id: 'output', label: vi.history.tabOutput },
  ];
  return (
    <div role="tablist" aria-label={vi.history.tabsLabel} className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            '-mb-px border-b-2 px-3 py-1.5 text-sm font-medium',
            value === tab.id ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

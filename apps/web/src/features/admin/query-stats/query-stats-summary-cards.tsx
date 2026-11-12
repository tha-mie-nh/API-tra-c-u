import type { QueryStatsCounterKey, QueryStatsCounters, QueryStatsPreviousPeriod } from '@shared/index';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { buildStatsDrilldownHref, type DrilldownScope } from './build-stats-drilldown-href';
import { QueryStatsDeltaBadge, type DeltaTone } from './query-stats-delta-badge';
import { QueryStatsDrillNumber } from './query-stats-drill-number';
import { formatRangeVn } from './format-range-vn';

const t = vi.admin.queryStats;

interface CardDef {
  key: keyof QueryStatsCounters;
  /** Present => number links to Lịch sử with this counter's filter. */
  counter?: QueryStatsCounterKey;
  label: string;
  tone: DeltaTone;
  hint?: string;
}

const CARDS: CardDef[] = [
  { key: 'requests', counter: 'requests', label: t.cardRequests, tone: 'neutral' },
  { key: 'answered', counter: 'answered', label: t.cardAnswered, tone: 'up' },
  { key: 'gap', counter: 'gap', label: t.cardGap, tone: 'down', hint: t.cardGapHint },
  { key: 'empty', counter: 'empty', label: t.cardEmpty, tone: 'neutral', hint: t.cardEmptyHint },
  { key: 'success', counter: 'success', label: t.cardSuccess, tone: 'up' },
  { key: 'failed', counter: 'failed', label: t.cardFailed, tone: 'down' },
  { key: 'denied', counter: 'denied', label: t.cardDenied, tone: 'down' },
  { key: 'errors', counter: 'errors', label: t.cardErrors, tone: 'down', hint: t.cardErrorsHint },
  { key: 'records', label: t.cardRecords, tone: 'neutral' },
  { key: 'avgDurationMs', label: t.cardAvg, tone: 'down' },
];

interface Props {
  totals: QueryStatsCounters;
  previous?: QueryStatsPreviousPeriod | null;
  /** undefined => no drill-down links (missing history:view_all). */
  drill?: DrilldownScope;
}

/** Totals grid shared by overview and datasource detail pages. */
export function QueryStatsSummaryCards({ totals, previous, drill }: Props) {
  const prevTitle = previous ? t.previousPeriod(formatRangeVn(previous.from, previous.to)) : undefined;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {CARDS.map((c) => {
        const value = totals[c.key];
        const prev = previous?.totals[c.key];
        return (
          <Card size="sm" key={c.key} title={c.hint}>
            <CardContent className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">{c.label}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {c.counter ? (
                  <QueryStatsDrillNumber
                    value={value ?? 0}
                    label={c.label}
                    noPermission={!drill}
                    href={drill ? buildStatsDrilldownHref(drill, { counter: c.counter }) : undefined}
                  />
                ) : (
                  formatNumber(value)
                )}
              </span>
              {previous && (
                <span className="flex items-center gap-1">
                  <QueryStatsDeltaBadge current={value} previous={prev} tone={c.tone} title={prevTitle} />
                  <span className="text-muted-foreground text-xs">{t.vsPrevious}</span>
                </span>
              )}
              {c.hint && <span className="text-muted-foreground text-xs">{c.hint}</span>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

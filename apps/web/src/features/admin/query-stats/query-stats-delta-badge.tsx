import { queryStatsDeltaPct } from '@shared/index';
import { vi } from '@/i18n/vi';

const t = vi.admin.queryStats;

/** up = rising is good (answered), down = rising is bad (errors, latency), neutral = no judgement. */
export type DeltaTone = 'up' | 'down' | 'neutral';

export function deltaColorClass(pct: number, tone: DeltaTone): string {
  if (pct === 0 || tone === 'neutral') return 'text-muted-foreground';
  const good = tone === 'up' ? pct > 0 : pct < 0;
  return good ? 'text-emerald-600' : 'text-destructive';
}

interface Props {
  current: number | null;
  previous: number | null | undefined;
  tone: DeltaTone;
  /** Tooltip, e.g. previous period range. */
  title?: string;
}

/** ±x% vs previous period; "—" when previous is 0/unknown (no meaningful percentage). */
export function QueryStatsDeltaBadge({ current, previous, tone, title }: Props) {
  const pct = current == null || previous == null ? null : queryStatsDeltaPct(current, previous);
  if (pct === null) {
    return (
      <span className="text-muted-foreground text-xs" title={title} aria-label={t.deltaNone}>
        —
      </span>
    );
  }
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
  const sign = pct > 0 ? '+' : '';
  return (
    <span className={`text-xs font-medium tabular-nums ${deltaColorClass(pct, tone)}`} title={title}>
      {arrow} {sign}
      {String(pct).replace('.', ',')}%
    </span>
  );
}

import { Link } from 'react-router';
import type { QueryStatsBucket, QueryStatsGranularity } from '@shared/index';
import { vi } from '@/i18n/vi';
import { buildStatsDrilldownHref, type DrilldownScope } from './build-stats-drilldown-href';

const t = vi.admin.queryStats;

/** Axis label from a Vietnam-local bucket key ('YYYY-MM-DDTHH' | 'YYYY-MM-DD' | 'YYYY-MM'). Pure string slicing: no Date, no UTC shift. */
export function bucketLabel(bucket: string, granularity: QueryStatsGranularity): string {
  if (granularity === 'hour') return `${bucket.slice(11, 13)}h`;
  if (granularity === 'day') return bucket.slice(8, 10);
  return bucket.slice(5, 7);
}

/** Full bucket description for tooltips, e.g. "11/11/2026 23h", "11/11/2026", "11/2026". */
export function bucketTitle(bucket: string, granularity: QueryStatsGranularity): string {
  const [y = '', m = '', rest = ''] = bucket.split('-');
  if (granularity === 'month') return `${m}/${y}`;
  const [d = '', h = ''] = rest.split('T');
  return granularity === 'day' ? `${d}/${m}/${y}` : `${d}/${m}/${y} ${h}h`;
}

interface Props {
  buckets: QueryStatsBucket[];
  granularity: QueryStatsGranularity;
  /** undefined => bars are not links (missing history:view_all). */
  drill?: DrilldownScope;
}

/** Div + Tailwind bar chart: bar height ~ requests, lower segment = errors. Segments/labels are links into Lịch sử. */
export function QueryStatsBarChart({ buckets, granularity, drill }: Props) {
  const max = Math.max(0, ...buckets.map((b) => b.requests));
  const pct = (n: number) => (max > 0 ? (n / max) * 100 : 0);
  const href = (b: QueryStatsBucket, counter: 'requests' | 'errors') =>
    drill ? buildStatsDrilldownHref(drill, { bucket: b.bucket, granularity, counter }) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="flex h-48 items-end gap-1" style={{ minWidth: `${buckets.length * 24}px` }} role="group" aria-label={t.chartTitle}>
          {buckets.map((b) => {
            const when = bucketTitle(b.bucket, granularity);
            const reqHref = b.requests > 0 ? href(b, 'requests') : undefined;
            const errHref = b.errors > 0 ? href(b, 'errors') : undefined;
            const segment = (to: string | undefined, label: string, cls: string, grow: number) =>
              to ? (
                <Link to={to} aria-label={label} className={`${cls} block w-full`} style={{ flexGrow: grow }} />
              ) : (
                <div className={`${cls} w-full`} style={{ flexGrow: grow }} />
              );
            return (
              <div
                key={b.bucket}
                data-testid="qs-bar"
                className="flex h-full min-w-5 flex-1 flex-col items-center justify-end"
                title={t.barTooltip(when, b)}
              >
                <div className="flex w-full flex-col justify-end" style={{ height: `${pct(b.requests)}%` }}>
                  {segment(reqHref, t.barAria(when, b.requests), 'bg-primary/70 flex-1 rounded-t-sm', b.requests - b.errors)}
                  {segment(errHref, t.barErrorAria(when, b.errors), 'bg-destructive', b.errors)}
                </div>
                {reqHref ? (
                  <Link to={reqHref} aria-label={t.barAria(when, b.requests)} className="text-muted-foreground hover:text-foreground mt-1 text-[10px]">
                    {bucketLabel(b.bucket, granularity)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground mt-1 text-[10px]">{bucketLabel(b.bucket, granularity)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-muted-foreground flex gap-4 text-xs">
        <span className="flex items-center gap-1"><i className="bg-primary/70 inline-block size-2.5 rounded-sm" />{t.chartOk}</span>
        <span className="flex items-center gap-1"><i className="bg-destructive inline-block size-2.5 rounded-sm" />{t.chartError}</span>
      </div>
    </div>
  );
}

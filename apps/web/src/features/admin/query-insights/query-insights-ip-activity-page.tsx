import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { INSIGHTS_ROUTE, userActivityPath } from './build-insights-drilldown-href';
import { fetchIpActivity } from './query-insights-api';
import { QueryInsightsActivityTimeline } from './query-insights-activity-timeline';
import { BackLink, QueryInsightsByDatasource, QueryInsightsTotals, QueryInsightsUserAgents } from './query-insights-activity-breakdown';
import { QueryInsightsLoadError } from './query-insights-load-error';
import { QueryInsightsRangeBar } from './query-insights-range-bar';
import { QueryInsightsSection } from './query-insights-section';
import { useInsightsRangeSearchParams } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;

/** `/quan-tri/phan-tich-tra-cuu/ip/:ip` (react-router decodes the encoded IPv6 param). */
export function QueryInsightsIpActivityPage() {
  const { ip = '' } = useParams<{ ip: string }>();
  const r = useInsightsRangeSearchParams();
  const { filter } = r;
  const q = useQuery({
    queryKey: ['qi', 'ip', ip, filter],
    queryFn: () => fetchIpActivity(ip, filter!),
    enabled: !!filter && !!ip,
    retry: false,
  });
  const d = q.data;
  const base = { ip };

  return (
    <div className="flex flex-col gap-6">
      <BackLink to={`${INSIGHTS_ROUTE}?${r.rangeSearch}`} />
      <h1 className="text-xl font-semibold">{t.ipTitle}: <span className="font-mono">{ip}</span></h1>
      <QueryInsightsRangeBar from={r.from} to={r.to} datasourceCode={r.datasourceCode} error={r.error} onRange={r.setRange} onDatasource={r.setDatasource} />
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.isError && <QueryInsightsLoadError error={q.error} />}
      {d && filter && (
        <>
          {d.multiAccount && (
            <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">{t.multiAccount}</p>
              <p>{t.multiAccountHint}</p>
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            {t.firstSeen}: {formatDateTime(d.firstAt)} · {t.lastSeen}: {formatDateTime(d.lastAt)}
          </p>
          <QueryInsightsTotals totals={d.totals} filter={filter} base={base} />
          <QueryInsightsSection title={t.usersOfIpTitle}>
            {d.users.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.empty}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.colUser}</TableHead>
                    <TableHead className="text-right">{t.colCount}</TableHead>
                    <TableHead>{t.colFirst}</TableHead>
                    <TableHead>{t.colLastAt}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.users.map((u) => (
                    <TableRow key={`${u.userId}-${u.username}`}>
                      <TableCell>
                        {u.userId ? (
                          <Link to={userActivityPath(u.userId, r.rangeSearch)} className="text-primary underline-offset-2 hover:underline">{u.username}</Link>
                        ) : (
                          u.username
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{u.count}</TableCell>
                      <TableCell>{formatDateTime(u.firstAt)}</TableCell>
                      <TableCell>{formatDateTime(u.lastAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryInsightsSection>
          <QueryInsightsByDatasource rows={d.byDatasource} filter={filter} base={base} />
          <QueryInsightsUserAgents rows={d.userAgents} />
          <QueryInsightsActivityTimeline filter={filter} base={base} />
        </>
      )}
    </div>
  );
}

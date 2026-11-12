import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { INSIGHTS_ROUTE, ipActivityPath } from './build-insights-drilldown-href';
import { fetchUserActivity } from './query-insights-api';
import { QueryInsightsActivityTimeline } from './query-insights-activity-timeline';
import { BackLink, QueryInsightsByDatasource, QueryInsightsTotals, QueryInsightsUserAgents } from './query-insights-activity-breakdown';
import { QueryInsightsLoadError } from './query-insights-load-error';
import { QueryInsightsRangeBar } from './query-insights-range-bar';
import { QueryInsightsSection } from './query-insights-section';
import { useInsightsRangeSearchParams } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;

/** `/quan-tri/phan-tich-tra-cuu/nguoi-dung/:userId` */
export function QueryInsightsUserActivityPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const r = useInsightsRangeSearchParams();
  const { filter } = r;
  const q = useQuery({
    queryKey: ['qi', 'user', userId, filter],
    queryFn: () => fetchUserActivity(userId, filter!),
    enabled: !!filter && !!userId,
    retry: false,
  });
  const d = q.data;
  const base = { userId };

  return (
    <div className="flex flex-col gap-6">
      <BackLink to={`${INSIGHTS_ROUTE}?${r.rangeSearch}`} />
      <h1 className="text-xl font-semibold">{t.userTitle}{d ? `: ${d.username}` : ''}</h1>
      <QueryInsightsRangeBar from={r.from} to={r.to} datasourceCode={r.datasourceCode} error={r.error} onRange={r.setRange} onDatasource={r.setDatasource} />
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.isError && <QueryInsightsLoadError error={q.error} />}
      {d && filter && (
        <>
          <QueryInsightsSection title={d.username}>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground text-xs">{t.fullName}</dt><dd>{d.user?.fullName ?? (d.user ? '—' : t.deletedUser)}</dd></div>
              {d.user && <div><dt className="text-muted-foreground text-xs">{t.accountStatus}</dt><dd>{d.user.status}</dd></div>}
              {d.user && <div><dt className="text-muted-foreground text-xs">{t.lastLogin}</dt><dd>{formatDateTime(d.user.lastLoginAt)}</dd></div>}
              <div><dt className="text-muted-foreground text-xs">{t.firstSeen}</dt><dd>{formatDateTime(d.firstAt)}</dd></div>
              <div><dt className="text-muted-foreground text-xs">{t.lastSeen}</dt><dd>{formatDateTime(d.lastAt)}</dd></div>
            </dl>
          </QueryInsightsSection>
          <QueryInsightsTotals totals={d.totals} filter={filter} base={base} />
          <QueryInsightsByDatasource rows={d.byDatasource} filter={filter} base={base} />
          <QueryInsightsSection title={t.ipsTitle}>
            {d.ips.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t.empty}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.colIp}</TableHead>
                    <TableHead className="text-right">{t.colCount}</TableHead>
                    <TableHead>{t.colFirst}</TableHead>
                    <TableHead>{t.colLastAt}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.ips.map((ip) => (
                    <TableRow key={ip.ip}>
                      <TableCell>
                        <Link to={ipActivityPath(ip.ip, r.rangeSearch)} className="text-primary font-mono text-xs underline-offset-2 hover:underline">{ip.ip}</Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ip.count}</TableCell>
                      <TableCell>{formatDateTime(ip.firstAt)}</TableCell>
                      <TableCell>{formatDateTime(ip.lastAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryInsightsSection>
          <QueryInsightsUserAgents rows={d.userAgents} />
          <QueryInsightsActivityTimeline filter={filter} base={base} />
        </>
      )}
    </div>
  );
}

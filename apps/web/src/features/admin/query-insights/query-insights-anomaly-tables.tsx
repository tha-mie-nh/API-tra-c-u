import { Link } from 'react-router';
import type {
  QueryInsightsOffHoursRow,
  QueryInsightsSharedIdentityRow,
  QueryInsightsSharedIpRow,
  QueryInsightsSpikeRow,
} from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { QueryStatsDrillNumber } from '@/features/admin/query-stats/query-stats-drill-number';
import { historyHref, ipActivityPath, offHoursHref, spikeDayHref, userActivityPath } from './build-insights-drilldown-href';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;
const None = () => <p className="text-muted-foreground text-sm">{t.noAnomaly}</p>;

function UserName({ userId, username, rangeSearch }: { userId: string | null; username: string; rangeSearch: string }) {
  if (!userId) return <>{username}</>;
  return (
    <Link to={userActivityPath(userId, rangeSearch)} className="text-primary underline-offset-2 hover:underline">
      {username}
    </Link>
  );
}

interface Common {
  filter: InsightsFilter;
  rangeSearch: string;
}

export function SpikesTable({ rows, filter, rangeSearch }: Common & { rows: QueryInsightsSpikeRow[] }) {
  if (rows.length === 0) return <None />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colUser}</TableHead>
          <TableHead>{t.colDay}</TableHead>
          <TableHead className="text-right">{t.colRequests}</TableHead>
          <TableHead className="text-right">{t.colBaseline}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.userId}-${r.username}-${r.day}`}>
            <TableCell><UserName {...r} rangeSearch={rangeSearch} /></TableCell>
            <TableCell>{r.day}</TableCell>
            <TableCell className="text-right tabular-nums">
              <QueryStatsDrillNumber value={r.count} label={`${r.username} ${r.day}`} href={spikeDayHref(r.userId, r.day, filter.datasourceCode)} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(r.baselineAvg)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OffHoursTable({ rows, filter, rangeSearch }: Common & { rows: QueryInsightsOffHoursRow[] }) {
  if (rows.length === 0) return <None />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colUser}</TableHead>
          <TableHead className="text-right">{t.colOffCount}</TableHead>
          <TableHead className="text-right">{t.colTotal}</TableHead>
          <TableHead className="text-right">{t.colRatio}</TableHead>
          <TableHead>{t.colLastAt}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.userId}-${r.username}`}>
            <TableCell><UserName {...r} rangeSearch={rangeSearch} /></TableCell>
            <TableCell className="text-right tabular-nums">
              <QueryStatsDrillNumber value={r.offHoursCount} label={r.username} href={offHoursHref(filter, r.userId)} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(r.total)}</TableCell>
            <TableCell className="text-right tabular-nums">{Math.round(r.ratio * 100)}%</TableCell>
            <TableCell>{formatDateTime(r.lastAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** valueDisplay is already masked server-side; never rebuilt or put into a URL. */
export function SharedIdentitiesTable({ rows, filter, rangeSearch }: Common & { rows: QueryInsightsSharedIdentityRow[] }) {
  if (rows.length === 0) return <None />;
  return (
    <>
      <p className="text-muted-foreground mb-2 text-xs">{t.approxNote}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.colFields}</TableHead>
            <TableHead>{t.colValue}</TableHead>
            <TableHead>{t.colDatasource}</TableHead>
            <TableHead className="text-right">{t.colDistinctUsers}</TableHead>
            <TableHead>{t.colUsers}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.fieldNames.join(',')}-${r.valueDisplay}-${r.datasourceCodes.join(',')}`}>
              <TableCell>{r.fieldNames.join(', ')}</TableCell>
              <TableCell className="font-mono text-xs">{r.valueDisplay}</TableCell>
              <TableCell>{r.datasourceCodes.join(', ')}</TableCell>
              <TableCell className="text-right tabular-nums">{r.distinctUsers}</TableCell>
              <TableCell>
                <ul className="flex flex-col gap-0.5">
                  {r.users.map((u) => (
                    <li key={`${u.userId}-${u.username}`} className="text-sm">
                      <Link
                        to={historyHref(
                          { ...filter, ...(r.datasourceCodes.length === 1 ? { datasourceCode: r.datasourceCodes[0] } : {}) },
                          { userId: u.userId ?? '__null__' },
                        )}
                        className="text-primary underline-offset-2 hover:underline"
                        title={t.approxNote}
                      >
                        {t.approxLink(u.username)}
                      </Link>
                      <span className="text-muted-foreground"> · {u.count}</span>
                      {u.userId && (
                        <Link to={userActivityPath(u.userId, rangeSearch)} className="text-muted-foreground ml-2 text-xs underline-offset-2 hover:underline">
                          {t.userTitle}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export function SharedIpsTable({ rows, filter, rangeSearch }: Common & { rows: QueryInsightsSharedIpRow[] }) {
  if (rows.length === 0) return <None />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colIp}</TableHead>
          <TableHead className="text-right">{t.colDistinctUsers}</TableHead>
          <TableHead>{t.colUsers}</TableHead>
          <TableHead className="text-right">{t.colRequests}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.ip}>
            <TableCell>
              <Link to={ipActivityPath(r.ip, rangeSearch)} className="text-primary font-mono text-xs underline-offset-2 hover:underline">
                {r.ip}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.distinctUsers}</TableCell>
            <TableCell>{r.usernames.join(', ')}</TableCell>
            <TableCell className="text-right tabular-nums">
              <QueryStatsDrillNumber value={r.requests} label={r.ip} href={historyHref(filter, { ip: r.ip })} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

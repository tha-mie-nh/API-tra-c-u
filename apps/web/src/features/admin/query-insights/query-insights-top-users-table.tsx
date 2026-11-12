import { Link } from 'react-router';
import { STATS_COUNTER_HISTORY_FILTER, type QueryInsightsTopUserRow, type QueryStatsCounterKey } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { QueryStatsDrillNumber } from '@/features/admin/query-stats/query-stats-drill-number';
import { historyHref, userActivityPath } from './build-insights-drilldown-href';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;
const COLUMNS: { key: Extract<QueryStatsCounterKey, 'requests' | 'failed' | 'denied' | 'gap'>; head: string }[] = [
  { key: 'requests', head: t.colRequests },
  { key: 'failed', head: t.colFailed },
  { key: 'denied', head: t.colDenied },
  { key: 'gap', head: t.colGap },
];

interface Props {
  rows: QueryInsightsTopUserRow[];
  filter: InsightsFilter;
  rangeSearch: string;
}

/** Every count = exact link to Lịch sử (same filter + userId + counter filter). Username -> user activity page. */
export function QueryInsightsTopUsersTable({ rows, filter, rangeSearch }: Props) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{t.empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colUser}</TableHead>
          {COLUMNS.map((c) => (
            <TableHead key={c.key} className="text-right">{c.head}</TableHead>
          ))}
          <TableHead className="text-right">{t.colP95}</TableHead>
          <TableHead>{t.colLast}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.userId}-${r.username}`}>
            <TableCell>
              {r.userId ? (
                <Link to={userActivityPath(r.userId, rangeSearch)} className="text-primary underline-offset-2 hover:underline">
                  {r.username}
                </Link>
              ) : (
                r.username
              )}
            </TableCell>
            {COLUMNS.map((c) => (
              <TableCell key={c.key} className="text-right tabular-nums">
                <QueryStatsDrillNumber
                  value={r[c.key]}
                  label={`${r.username} - ${c.head}`}
                  href={historyHref(filter, { ...STATS_COUNTER_HISTORY_FILTER[c.key], userId: r.userId ?? '__null__' })}
                />
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">{r.p95DurationMs ?? '—'}</TableCell>
            <TableCell>{formatDateTime(r.lastAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

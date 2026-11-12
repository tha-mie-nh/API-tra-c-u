import { Link } from 'react-router';
import type { QueryInsightsErrorRow, QueryInsightsLatencyRow } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vi } from '@/i18n/vi';
import { QueryStatsDrillNumber } from '@/features/admin/query-stats/query-stats-drill-number';
import { buildStatsDrilldownHref } from '@/features/admin/query-stats/build-stats-drilldown-href';
import { errorLabel } from '@/features/admin/query-stats/query-stats-top-errors-table';
import { historyHref } from './build-insights-drilldown-href';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;

export function QueryInsightsErrorsTable({ rows, filter }: { rows: QueryInsightsErrorRow[]; filter: InsightsFilter }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{t.empty}</p>;
  const scope = { range: { from: filter.from, to: filter.to }, datasourceCode: filter.datasourceCode };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colErrorCode}</TableHead>
          <TableHead>{t.colStatus}</TableHead>
          <TableHead className="text-right">{t.colCount}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const label = errorLabel(r);
          return (
            <TableRow key={`${r.errorCode}-${r.statusCode}`}>
              <TableCell>
                <span className="font-mono text-xs">{r.errorCode ?? t.noCode}</span>
                {label && <span className="text-muted-foreground ml-2 text-xs">({label})</span>}
              </TableCell>
              <TableCell>{r.statusCode ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">
                <QueryStatsDrillNumber
                  value={r.count}
                  label={r.errorCode ?? t.noCode}
                  href={buildStatsDrilldownHref(scope, { errorItem: r })}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function QueryInsightsLatencyTable({ rows, filter }: { rows: QueryInsightsLatencyRow[]; filter: InsightsFilter }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{t.empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.colDatasource}</TableHead>
          <TableHead className="text-right">{t.colRequests}</TableHead>
          <TableHead className="text-right">{t.colAvg}</TableHead>
          <TableHead className="text-right">{t.colP95}</TableHead>
          <TableHead className="text-right">{t.colMax}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.datasourceCode}>
            <TableCell>
              <Link
                to={historyHref({ ...filter, datasourceCode: r.datasourceCode })}
                className="text-primary underline-offset-2 hover:underline"
              >
                {r.name ?? r.datasourceCode}
              </Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <QueryStatsDrillNumber
                value={r.requests}
                label={r.name ?? r.datasourceCode}
                href={historyHref({ ...filter, datasourceCode: r.datasourceCode })}
              />
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.avgDurationMs ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.p95DurationMs ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.maxDurationMs ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

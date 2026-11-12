import { Link, useNavigate } from 'react-router';
import type { QueryStatsCounterKey, QueryStatsDatasourceRow } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { buildStatsDrilldownHref, type DrilldownScope } from './build-stats-drilldown-href';
import { QueryStatsDrillNumber } from './query-stats-drill-number';

const t = vi.admin.queryStats;

const DRILL_COLUMNS: { key: QueryStatsCounterKey & keyof QueryStatsDatasourceRow; label: string }[] = [
  { key: 'requests', label: t.dsRequests },
  { key: 'answered', label: t.dsAnswered },
  { key: 'gap', label: t.dsGap },
  { key: 'failed', label: t.dsFailed },
  { key: 'denied', label: t.dsDenied },
];

interface Props {
  rows: QueryStatsDatasourceRow[];
  searchString: string;
  /** Overview range; undefined => numbers are not links (missing history:view_all). */
  drill?: DrilldownScope;
}

/** Per-datasource rows; the name is a link to the detail page (row click is a mouse shortcut), counters link to Lịch sử. */
export function QueryStatsDatasourceTable({ rows, searchString, drill }: Props) {
  const navigate = useNavigate();
  const detailHref = (code: string) =>
    `/quan-tri/thong-ke/${encodeURIComponent(code)}${searchString ? `?${searchString}` : ''}`;
  const num = 'text-right tabular-nums';
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.dsName}</TableHead>
          {DRILL_COLUMNS.map((c) => (
            <TableHead key={c.key} className="text-right">{c.label}</TableHead>
          ))}
          <TableHead className="text-right">{t.dsRecords}</TableHead>
          <TableHead className="text-right">{t.dsAvg}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.datasourceCode} className="cursor-pointer" onClick={() => navigate(detailHref(r.datasourceCode))}>
            <TableCell>
              <Link
                to={detailHref(r.datasourceCode)}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {r.name ?? r.datasourceCode}
              </Link>
              <div className="text-muted-foreground font-mono text-xs">{r.datasourceCode}</div>
            </TableCell>
            {DRILL_COLUMNS.map((c) => (
              <TableCell key={c.key} className={num}>
                <QueryStatsDrillNumber
                  value={r[c.key]}
                  label={`${r.name ?? r.datasourceCode} - ${c.label}`}
                  noPermission={!drill}
                  href={
                    drill
                      ? buildStatsDrilldownHref({ ...drill, datasourceCode: r.datasourceCode }, { counter: c.key })
                      : undefined
                  }
                />
              </TableCell>
            ))}
            <TableCell className={num}>{formatNumber(r.records)}</TableCell>
            <TableCell className={num}>{formatNumber(r.avgDurationMs)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

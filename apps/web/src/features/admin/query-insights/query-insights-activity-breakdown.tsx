import { Link } from 'react-router';
import type { QueryInsightsDatasourceCount, QueryInsightsUserAgentUsage, QueryStatsCounters } from '@shared/index';
import { STATS_COUNTER_HISTORY_FILTER } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { QueryStatsDrillNumber } from '@/features/admin/query-stats/query-stats-drill-number';
import { describeUserAgent } from '@/features/history/parse-user-agent';
import { historyHref } from './build-insights-drilldown-href';
import { QueryInsightsSection } from './query-insights-section';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;
type Base = Record<string, string>;

const TOTALS: { key: 'requests' | 'failed' | 'denied' | 'gap'; label: string }[] = [
  { key: 'requests', label: t.colRequests },
  { key: 'failed', label: t.colFailed },
  { key: 'denied', label: t.colDenied },
  { key: 'gap', label: t.colGap },
];

/** `base` = the exact subject filter (userId or ip) so every number matches Lịch sử. */
export function QueryInsightsTotals({ totals, filter, base }: { totals: QueryStatsCounters; filter: InsightsFilter; base: Base }) {
  return (
    <QueryInsightsSection title={t.totalsTitle}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {TOTALS.map((c) => (
          <div key={c.key}>
            <dt className="text-muted-foreground text-xs">{c.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              <QueryStatsDrillNumber
                value={totals[c.key]}
                label={c.label}
                href={historyHref(filter, { ...STATS_COUNTER_HISTORY_FILTER[c.key], ...base })}
              />
            </dd>
          </div>
        ))}
      </dl>
    </QueryInsightsSection>
  );
}

export function QueryInsightsByDatasource({ rows, filter, base }: { rows: QueryInsightsDatasourceCount[]; filter: InsightsFilter; base: Base }) {
  return (
    <QueryInsightsSection title={t.byDatasourceTitle}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colDatasource}</TableHead>
              <TableHead className="text-right">{t.colCount}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.datasourceCode}>
                <TableCell>{r.name ?? r.datasourceCode}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <QueryStatsDrillNumber
                    value={r.count}
                    label={r.name ?? r.datasourceCode}
                    href={historyHref({ ...filter, datasourceCode: r.datasourceCode }, base)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </QueryInsightsSection>
  );
}

export function QueryInsightsUserAgents({ rows }: { rows: QueryInsightsUserAgentUsage[] }) {
  return (
    <QueryInsightsSection title={t.uaTitle}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.colUa}</TableHead>
              <TableHead className="text-right">{t.colCount}</TableHead>
              <TableHead>{t.colLastAt}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userAgent}>
                <TableCell title={r.userAgent}>{describeUserAgent(r.userAgent) ?? t.unknownUa}</TableCell>
                <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                <TableCell>{formatDateTime(r.lastAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </QueryInsightsSection>
  );
}

export function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="text-primary text-sm underline-offset-2 hover:underline">
      ← {t.back}
    </Link>
  );
}

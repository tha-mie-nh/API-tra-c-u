import type { QueryStatsErrorItem } from '@shared/index';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vi } from '@/i18n/vi';
import { buildStatsDrilldownHref, type DrilldownScope } from './build-stats-drilldown-href';
import { QueryStatsDrillNumber } from './query-stats-drill-number';

const t = vi.admin.queryStats;

/** Raw code + Vietnamese label for common codes. */
export function errorLabel(item: QueryStatsErrorItem): string {
  const byCode = item.errorCode ? t.errorLabels[item.errorCode] : undefined;
  // Mã do đối tác trả về (vd 401 sai key) khác nghĩa với cùng mã do hệ thống tạo (401/403 bị từ chối quyền): không dùng nhãn theo mã hệ thống.
  const byStatus = item.statusCode != null && !item.fromUpstream ? t.statusLabels[item.statusCode] : undefined;
  return byCode ?? byStatus ?? '';
}

/** `drill` undefined => counts are not links (missing history:view_all). */
export function QueryStatsTopErrorsTable({ items, drill }: { items: QueryStatsErrorItem[]; drill?: DrilldownScope }) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t.noErrors}</p>;
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.errCode}</TableHead>
          <TableHead>{t.errStatus}</TableHead>
          <TableHead className="text-right">{t.errCount}</TableHead>
          <TableHead className="text-right">{t.errPercent}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((i) => {
          const label = errorLabel(i);
          return (
            <TableRow key={`${i.errorCode}-${i.statusCode}`}>
              <TableCell>
                <span className="font-mono text-xs">{i.errorCode ?? t.errNoCode}</span>
                {label && <span className="text-muted-foreground ml-2 text-xs">({label})</span>}
              </TableCell>
              <TableCell>
                {i.statusCode ?? '—'}
                {i.statusCode != null && (
                  <span className="text-muted-foreground ml-1 text-xs">({i.fromUpstream ? vi.history.codeSourceUpstream : vi.history.codeSourceSystem})</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <QueryStatsDrillNumber
                  value={i.count}
                  label={i.errorCode ?? t.errNoCode}
                  noPermission={!drill}
                  href={drill ? buildStatsDrilldownHref(drill, { errorItem: i }) : undefined}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">{total > 0 ? `${Math.round((i.count / total) * 100)}%` : '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

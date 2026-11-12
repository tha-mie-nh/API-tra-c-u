import { Link } from 'react-router';
import { buildHistorySearchParams, type QueryLogDetail } from '@shared/index';
import { vi } from '@/i18n/vi';
import { INSIGHTS_ROUTE } from '@/features/admin/query-insights/build-insights-drilldown-href';

const href = (params: Record<string, string | undefined>) => `/lich-su?${buildHistorySearchParams(params).toString()}`;

/** Links to the same History screen with a URL filter (same vocabulary as the drill-down from Thống kê). */
export function buildRelatedLinks(detail: QueryLogDetail, canViewAll: boolean): { label: string; to: string }[] {
  const links: { label: string; to: string }[] = [];
  if (canViewAll && detail.userId) {
    links.push({
      label: vi.history.detailRelatedUserDatasource,
      to: href({ userId: detail.userId, datasourceCode: detail.datasourceCode }),
    });
  }
  if (canViewAll && detail.ip) {
    links.push({ label: vi.history.detailRelatedIp, to: href({ ip: detail.ip }) });
  }
  if (canViewAll && detail.userId) {
    links.push({ label: vi.admin.queryInsights.linkUserActivity, to: `${INSIGHTS_ROUTE}/nguoi-dung/${encodeURIComponent(detail.userId)}` });
  }
  if (canViewAll && detail.ip) {
    links.push({ label: vi.admin.queryInsights.linkIpActivity, to: `${INSIGHTS_ROUTE}/ip/${encodeURIComponent(detail.ip)}` });
  }
  if (detail.errorCode) {
    links.push({
      label: vi.history.detailRelatedErrorCode,
      to: href({ errorCode: detail.errorCode, status: 'failed,denied' }),
    });
  }
  return links;
}

export function HistoryDetailRelatedLinks({ detail, canViewAll }: { detail: QueryLogDetail; canViewAll: boolean }) {
  const links = buildRelatedLinks(detail, canViewAll);
  if (links.length === 0) return null;
  return (
    <nav aria-label={vi.history.detailRelatedTitle} className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{vi.history.detailRelatedTitle}</span>
      <ul className="flex flex-col gap-1">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-primary text-sm underline-offset-2 hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

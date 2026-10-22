import type { QueryLogStatus } from '@shared/index';
import { Badge } from '@/components/ui/badge';
import { vi } from '@/i18n/vi';

const STATUS_VARIANT: Record<QueryLogStatus, 'default' | 'destructive' | 'secondary'> = {
  success: 'default',
  failed: 'destructive',
  denied: 'secondary',
};

const STATUS_LABEL: Record<QueryLogStatus, string> = {
  success: vi.history.statusSuccess,
  failed: vi.history.statusFailed,
  denied: vi.history.statusDenied,
};

/** `200` -> `"2xx"` (review feedback: "chia trạng thái theo các nhóm 2xx/3xx/4xx/5xx"
 * rather than the exact code) — same grouping HTTP itself uses. */
function statusCodeGroup(statusCode: number): string {
  return `${Math.floor(statusCode / 100)}xx`;
}

/** Chip for one `query_logs.status` (spec f: "trạng thái: thành công/thất bại/bị từ chối").
 * `statusCode`'s group is shown alongside when present — `null` for rows written
 * before that column existed. */
export function HistoryStatusBadge({ status, statusCode }: { status: QueryLogStatus; statusCode?: number | null }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {STATUS_LABEL[status]}
      {statusCode != null && <span className="ml-1 opacity-75">({statusCodeGroup(statusCode)})</span>}
    </Badge>
  );
}

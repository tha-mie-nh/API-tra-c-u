import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES, type QueryLogDetail } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { fetchHistoryDetail } from './history-api';
import { HistoryStatusBadge } from './history-status-badge';

interface HistoryDetailDialogProps {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Detail view for one `query_logs` row (S4 "detail drawer", implemented as a
 * dialog — same information, simpler than a slide-over for this scale).
 * `queryParams` is masked SERVER-SIDE based on the viewer's own
 * `history:view_sensitive` permission (review feedback: an ADMIN sees the
 * real value, OPERATOR/AUDITOR see "***") — rendered as plain text only,
 * never HTML (phase-08 Security Considerations).
 */
export function HistoryDetailDialog({ id, onOpenChange }: HistoryDetailDialogProps) {
  const query = useQuery<QueryLogDetail>({
    queryKey: ['history-detail', id],
    queryFn: () => fetchHistoryDetail(id as string),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vi.history.detailTitle}</DialogTitle>
        </DialogHeader>
        {query.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {query.data && <HistoryDetailBody detail={query.data} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryDetailBody({ detail }: { detail: QueryLogDetail }) {
  const canViewSensitive = useAuthStore((state) => state.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_SENSITIVE));
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <Row label={vi.history.columnUser}>{detail.username}</Row>
      <Row label={vi.history.columnDatasource}>{detail.datasourceCode}</Row>
      <Row label={vi.history.columnTime}>{formatDateTime(detail.createdAt)}</Row>
      <Row label={vi.history.columnStatus}>
        <HistoryStatusBadge status={detail.status} statusCode={detail.statusCode} />
      </Row>
      <Row label={vi.history.detailRecordCount}>{detail.recordCount ?? '—'}</Row>
      <Row label={vi.history.detailUpstreamRequestId}>{detail.upstreamRequestId ?? '—'}</Row>
      <Row label={vi.history.detailDuration}>{vi.history.detailDurationMs(detail.durationMs)}</Row>
      <Row label={vi.history.detailError}>{detail.errorMessage ?? vi.history.detailNoError}</Row>
      <Row label={canViewSensitive ? vi.history.detailParamsFull : vi.history.detailParams}>
        <pre className="bg-muted max-h-48 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
          {JSON.stringify(detail.queryParams, null, 2)}
        </pre>
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

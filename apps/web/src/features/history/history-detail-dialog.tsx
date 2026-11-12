import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FEATURE_PERMISSION_CODES, type QueryLogDetail } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { fetchHistoryDetail } from './history-api';
import { CopyToClipboardButton } from './copy-to-clipboard-button';
import { HistoryDetailRelatedLinks } from './history-detail-related-links';
import { describeUserAgent } from './parse-user-agent';
import { isHistoryRecordId } from './history-record-id';
import { HistoryStatusBadge } from './history-status-badge';

interface HistoryDetailDialogProps {
  id: string | null;
  canViewAll: boolean;
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
export function HistoryDetailDialog({ id, canViewAll, onOpenChange }: HistoryDetailDialogProps) {
  const query = useQuery<QueryLogDetail>({
    queryKey: ['history-detail', id],
    queryFn: () => fetchHistoryDetail(id as string),
    enabled: isHistoryRecordId(id),
  });
  const notFound = (!!id && !isHistoryRecordId(id)) || (query.error instanceof ApiError && query.error.status === 404);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vi.history.detailTitle}</DialogTitle>
        </DialogHeader>
        {notFound && (
          <p role="alert" className="text-muted-foreground text-sm">
            {vi.history.detailNotFound}
          </p>
        )}
        {query.isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {query.isError && !notFound && (
          <p role="alert" className="text-destructive text-sm">
            {vi.adminCommon.genericError}
          </p>
        )}
        {query.data && <HistoryDetailBody detail={query.data} canViewAll={canViewAll} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryDetailBody({ detail, canViewAll }: { detail: QueryLogDetail; canViewAll: boolean }) {
  const canViewSensitive = useAuthStore((state) => state.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_VIEW_SENSITIVE));
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <Row label={vi.history.detailId}>
        <span className="font-mono text-xs break-all">{detail.id}</span>
        <CopyToClipboardButton value={detail.id} label={vi.history.detailId} />
      </Row>
      <Row label={vi.history.columnUser}>{detail.username}</Row>
      <Row label={vi.history.columnDatasource}>{detail.datasourceCode}</Row>
      <Row label={vi.history.columnTime}>{formatDateTime(detail.createdAt)}</Row>
      <Row label={vi.history.detailSummary}>{detail.querySummary ?? '—'}</Row>
      <Row label={vi.history.columnStatus}>
        <HistoryStatusBadge status={detail.status} statusCode={detail.statusCode} />
        {detail.statusCode != null && <span className="ml-2">HTTP {detail.statusCode}</span>}
      </Row>
      <Row label={vi.history.detailRecordCount}>{detail.recordCount ?? '—'}</Row>
      <Row label={vi.history.detailUpstreamRequestId}>
        {detail.upstreamRequestId ? (
          <>
            <span className="font-mono text-xs break-all">{detail.upstreamRequestId}</span>
            <CopyToClipboardButton value={detail.upstreamRequestId} label={vi.history.detailUpstreamRequestId} />
          </>
        ) : (
          '—'
        )}
      </Row>
      <Row label={vi.history.detailIp}>{detail.ip ?? '—'}</Row>
      <Row label={vi.history.detailUserAgent}>
        {describeUserAgent(detail.userAgent) ?? '—'}
        {detail.userAgent && <span className="text-muted-foreground block text-xs break-all">{detail.userAgent}</span>}
      </Row>
      <Row label={vi.history.detailDuration}>{vi.history.detailDurationMs(detail.durationMs)}</Row>
      <Row label={vi.history.detailErrorCode}>{detail.errorCode ?? '—'}</Row>
      <Row label={vi.history.detailError}>{detail.errorMessage ?? vi.history.detailNoError}</Row>
      <Row label={canViewSensitive ? vi.history.detailParamsFull : vi.history.detailParams}>
        <pre className="bg-muted max-h-48 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
          {JSON.stringify(detail.queryParams, null, 2)}
        </pre>
      </Row>
      <HistoryDetailRelatedLinks detail={detail} canViewAll={canViewAll} />
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

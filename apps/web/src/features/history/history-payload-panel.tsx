import { useQuery } from '@tanstack/react-query';
import type { QueryLogPayloadResponse } from '@shared/index';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { fetchHistoryPayload } from './history-api';
import { PayloadInputSections, PayloadOutputSections } from './payload-sections';

export type PayloadTab = 'input' | 'output';

/**
 * Body of the "Đầu vào"/"Đầu ra" tabs. Mounted only when one of those tabs is
 * open => the payload is fetched lazily; both tabs share one cache entry.
 */
export function HistoryPayloadPanel({ id, tab }: { id: string; tab: PayloadTab }) {
  const query = useQuery<QueryLogPayloadResponse>({
    queryKey: ['history-payload', id],
    queryFn: () => fetchHistoryPayload(id),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2" data-testid="payload-skeleton">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (query.error instanceof ApiError && query.error.status === 403) {
    return <p role="alert" className="text-destructive text-sm">{vi.history.payloadForbidden}</p>;
  }
  if (query.error instanceof ApiError && query.error.status === 404) {
    return <p role="alert" className="text-muted-foreground text-sm">{vi.history.detailNotFound}</p>;
  }
  if (query.isError || !query.data) {
    return <p role="alert" className="text-destructive text-sm">{vi.adminCommon.genericError}</p>;
  }
  const data = query.data;
  if (!data.captured) {
    return <p role="status" className="text-muted-foreground text-sm">{vi.history.payloadNotCaptured}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {data.masked && (
        <p role="note" className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">{vi.history.payloadMasked}</p>
      )}
      {data.capturedAt && <p className="text-muted-foreground text-xs">{vi.history.payloadCapturedAt(formatDateTime(data.capturedAt))}</p>}
      {tab === 'input' ? <PayloadInputSections data={data} id={id} /> : <PayloadOutputSections data={data} id={id} />}
    </div>
  );
}

import type { QueryLogPayloadResponse } from '@shared/index';
import { Badge } from '@/components/ui/badge';
import { vi } from '@/i18n/vi';
import { PayloadJsonViewer } from './payload-json-viewer';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="font-mono break-all">{children}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function statusVariant(code: number | null): 'default' | 'destructive' | 'secondary' {
  if (code === null) return 'secondary';
  return code >= 400 ? 'destructive' : 'default';
}

/** "Đầu vào": what the user submitted + what this API sent upstream. */
export function PayloadInputSections({ data, id }: { data: QueryLogPayloadResponse; id: string }) {
  const up = data.upstreamRequest;
  return (
    <div className="flex flex-col gap-4">
      <Group title={vi.history.payloadClientRequest}>
        <PayloadJsonViewer title={vi.history.payloadClientRequest} fileName={`${id}-client-request`} value={data.clientRequest} />
      </Group>
      <Group title={vi.history.payloadUpstreamRequest}>
        {up ? (
          <>
            <Field label={vi.history.payloadTransport}>{up.transport}</Field>
            <Field label={vi.history.payloadMethod}>{up.method ?? '—'}</Field>
            <Field label={vi.history.payloadUrl}>{up.url ?? '—'}</Field>
            <Field label={vi.history.payloadAttempt}>{up.attempt}</Field>
            <PayloadJsonViewer title={vi.history.payloadHeaders} fileName={`${id}-upstream-request-headers`} value={up.headers} />
            <PayloadJsonViewer title={vi.history.payloadBody} fileName={`${id}-upstream-request-body`} value={up.body} />
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{vi.history.payloadEmpty}</p>
        )}
      </Group>
    </div>
  );
}

/** "Đầu ra": upstream response + the exact response returned to the client. */
export function PayloadOutputSections({ data, id }: { data: QueryLogPayloadResponse; id: string }) {
  const res = data.upstreamResponse;
  return (
    <div className="flex flex-col gap-4">
      <Group title={vi.history.payloadUpstreamResponse}>
        {res ? (
          <>
            <Field label={vi.history.payloadStatus}>
              <Badge variant={statusVariant(res.statusCode)}>{res.statusCode ?? '—'}</Badge>
            </Field>
            <Field label={vi.history.payloadDuration}>{vi.history.detailDurationMs(res.durationMs)}</Field>
            {res.error && <Field label={vi.history.payloadError}>{res.error}</Field>}
            <PayloadJsonViewer title={vi.history.payloadBody} fileName={`${id}-upstream-response`} value={res.body} />
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{vi.history.payloadEmpty}</p>
        )}
      </Group>
      <Group title={vi.history.payloadClientResponse}>
        {data.clientResponse == null ? (
          <p className="text-muted-foreground text-xs">{vi.history.payloadEmpty}</p>
        ) : (
          <PayloadJsonViewer title={vi.history.payloadClientResponse} fileName={`${id}-client-response`} value={data.clientResponse} />
        )}
      </Group>
    </div>
  );
}

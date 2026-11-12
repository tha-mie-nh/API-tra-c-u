import type { UpstreamRequestSnapshot, UpstreamResponseSnapshot } from '@app/shared';

/** What was sent to / received from the upstream (secrets already redacted by the adapter). */
export interface UpstreamExchange {
  request: UpstreamRequestSnapshot;
  response: UpstreamResponseSnapshot;
}

/**
 * Thin, boring adapter contract (phase-04 Key Insight: `type` decides the
 * response shape/UI renderer, `transport.kind` decides how bytes are
 * fetched). Every transport kind (`mock`, `http`, `minio-pg`) implements
 * this same interface so `DatasourceRegistryService` never branches on kind.
 */
export interface AdapterExecuteInput {
  /** Already Zod-validated, keyed by the datasource's input field `name`s. */
  params: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}

/** One raw record, keyed by the UPSTREAM's own field names (pre-`from` mapping). */
export type RawRecord = Record<string, unknown>;

export interface AdapterExecuteResult {
  records: RawRecord[];
  total?: number;
  requestId?: string;
  /** I/O snapshot for the admin payload monitor. */
  exchange?: UpstreamExchange;
}

export interface DatasourceAdapter {
  execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult>;
  /**
   * Phase 05: point lookup by a single stable record id, used ONLY by
   * `ImageProxyService` to re-resolve one image's metadata server-side.
   * Optional because it only makes sense for `type:"image"` (minio-pg)
   * datasources — `info` adapters never implement it.
   */
  getRecordById?(recordId: string): Promise<RawRecord | null>;
  /** Optional resource cleanup (e.g. closing a pg Pool). Called on app shutdown. */
  close?(): Promise<void>;
}

import type { QueryLogStatus } from '@app/shared';

/** Row shape returned by HistoryListSqlRepository (raw SQL, camelCase aliases, status already lower-case text). */
export interface QueryLogRowView {
  id: string;
  userId: string | null;
  usernameSnapshot: string;
  datasourceCode: string;
  queryParams: unknown;
  querySummary: string | null;
  status: QueryLogStatus;
  statusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  recordCount: number | null;
  upstreamRequestId: string | null;
  durationMs: number | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/** Export batches also carry the full-precision timestamp text (JS Date truncates microseconds) for keyset paging. */
export interface QueryLogExportRow extends QueryLogRowView {
  createdAtRaw: string;
}

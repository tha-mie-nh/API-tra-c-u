/**
 * Phase 05 — types shared between `apps/api` (HistoryService/QueryLogService)
 * and `apps/web` (Phase 08 history screens) for `GET /api/v1/history[/:id]`.
 * See plans/260920-2200-app-tra-cuu-du-lieu/reference-database-erd.md
 * (`query_logs`) and reference-api-specification.md (History section).
 */

export type QueryLogStatus = 'success' | 'failed' | 'denied';

/** One row as rendered in the `GET /history` list — no raw upstream PII, only masked query conditions. */
export interface QueryLogListItem {
  id: string;
  userId: string | null;
  /** Denormalized snapshot — survives the acting user being deleted later. */
  username: string;
  datasourceCode: string;
  querySummary: string | null;
  status: QueryLogStatus;
  /** Real HTTP status code (200-599) this lookup resolved to — `null` for
   * rows written before this column existed. More granular than `status`
   * (e.g. 422 vs 504 are both `status: 'failed'`). */
  statusCode: number | null;
  errorCode: string | null;
  recordCount: number | null;
  durationMs: number | null;
  createdAt: string;
}

/** `GET /history/:id` — same fields plus the full (masked) query params and upstream trace id. */
export interface QueryLogDetail extends QueryLogListItem {
  queryParams: Record<string, unknown>;
  errorMessage: string | null;
  upstreamRequestId: string | null;
}

export interface HistoryListResponse {
  items: QueryLogListItem[];
  page: number;
  pageSize: number;
  total: number;
}

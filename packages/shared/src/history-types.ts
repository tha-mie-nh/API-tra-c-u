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
  ip: string | null;
  userAgent: string | null;
}

export interface HistoryListResponse {
  items: QueryLogListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type HistorySortField = 'createdAt' | 'durationMs' | 'recordCount';

/** `GET /history/summary` — same filter/scope as the list, so `total` equals list `total`. */
export interface HistorySummaryResponse {
  total: number;
  success: number;
  failed: number;
  denied: number;
  /** success AND record_count > 0 */
  answered: number;
  /** total - answered */
  gap: number;
  /** success AND COALESCE(record_count,0) <= 0 */
  empty: number;
  /** success / total; null when total = 0 */
  successRate: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
}

export const HISTORY_EXPORT_MAX_ROWS = 50_000;
export const HISTORY_MAX_OFFSET = 10_000;

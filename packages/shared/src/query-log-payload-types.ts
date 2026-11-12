/**
 * Request input/output capture for the admin monitor (`GET /history/:id/payload`).
 * One snapshot per `query_logs` row, stored in `app.query_log_payloads`.
 * Values are stored AS-IS (exact) and masked at read time by the viewer's
 * `history:view_sensitive` permission — same policy as `query_logs.query_params`.
 */

/** Marker replacing a part that exceeded QUERY_LOG_PAYLOAD_MAX_BYTES. */
export interface TruncatedMarker {
  $truncated: true;
  originalBytes: number;
  /** First ~2 KB of the serialized JSON, for context. */
  preview: string;
}

/** Marker replacing a base64 image value (kept out of the log: size + never useful as text). */
export interface ImagePlaceholder {
  $image: true;
  bytes: number;
  sha256: string;
  mime: string | null;
}

/** What this API sent to the upstream (secrets are never stored: header values listed in `redactedHeaders` are "[redacted]"). */
export interface UpstreamRequestSnapshot {
  transport: 'http' | 'mock' | 'minio-pg';
  method: string | null;
  /** Full URL without credentials in query string. */
  url: string | null;
  headers: Record<string, string>;
  body: unknown;
  /** 1-based attempt that produced the stored response (retries). */
  attempt: number;
}

/** What the upstream answered (or how the call failed). */
export interface UpstreamResponseSnapshot {
  /** HTTP status; null for network error/timeout/non-http transports. */
  statusCode: number | null;
  durationMs: number | null;
  /** Parsed JSON body when possible, else the raw text (capped). */
  body: unknown;
  /** Set when the call failed (network error, timeout, 4xx/5xx). */
  error: string | null;
}

export interface QueryLogPayloadParts {
  upstreamRequest: UpstreamRequestSnapshot | null;
  upstreamResponse: UpstreamResponseSnapshot | null;
  /** Exact JSON this API returned to the client: the envelope on success, `{error:{...}}` on failure/denied. */
  clientResponse: unknown | null;
}

/** `GET /history/:id/payload` (permission `history:view_payload`, audited). */
export interface QueryLogPayloadResponse extends QueryLogPayloadParts {
  queryLogId: string;
  /** false => nothing stored (row older than the feature, capture disabled, or purged by retention). */
  captured: boolean;
  /** ISO time the snapshot was stored; null when not captured. */
  capturedAt: string | null;
  /** The user's submitted input (`query_logs.query_params`), masked per viewer. */
  clientRequest: Record<string, unknown>;
  /** True when the viewer lacks `history:view_sensitive` and values were masked ("***"). */
  masked: boolean;
}

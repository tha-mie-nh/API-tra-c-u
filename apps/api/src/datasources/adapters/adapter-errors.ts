import type { UpstreamExchange } from './datasource-adapter.interface';

/**
 * Upstream failures must never leak a raw stack trace / upstream body to the
 * client (phase-04 Non-functional requirement + Security Considerations).
 * Adapters throw these; Phase 05's query controller maps them to
 * UPSTREAM_ERROR (502) / UPSTREAM_TIMEOUT (504).
 */
export class UpstreamError extends Error {
  readonly code = 'UPSTREAM_ERROR';
  constructor(
    message: string,
    readonly datasourceCode: string,
    override readonly cause?: unknown,
    /** What was sent/received before failing (kept server-side only; never sent to the client). */
    public exchange?: UpstreamExchange,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export class UpstreamTimeoutError extends Error {
  readonly code = 'UPSTREAM_TIMEOUT';
  constructor(
    message: string,
    readonly datasourceCode: string,
    public exchange?: UpstreamExchange,
  ) {
    super(message);
    this.name = 'UpstreamTimeoutError';
  }
}

import { Logger } from '@nestjs/common';
import { request } from 'undici';
import type { DatasourceEntry, TransportHttp, UpstreamRequestSnapshot, UpstreamResponseSnapshot } from '@app/shared';
import type { ResolvedHttpSecrets } from '../datasource-config.loader';
import type { AdapterExecuteInput, AdapterExecuteResult, DatasourceAdapter, RawRecord, UpstreamExchange } from './datasource-adapter.interface';
import { UpstreamError, UpstreamTimeoutError } from './adapter-errors';
import { buildExchange, parseBodyText, redactHeaders, safeUrl } from './upstream-exchange.util';
import { withTimeout } from './with-timeout.util';

/** Mutable holder for the latest attempt's exchange (read by `execute` when an attempt fails or times out). */
interface ExchangeTracker {
  last?: UpstreamExchange;
}

/** Reads a dotted path like "data.items" out of an arbitrary upstream JSON body. */
function getByPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Scaffold for the 3 real "citizen info" APIs — not exercised by
 * `config/config.json` yet (no real base URL/docs exist, see plan.md
 * "Biggest risk"). Wires request building (`method`/`path`/`auth` header),
 * `undici` + `AbortSignal.timeout`, bounded retry on network error/5xx/429
 * (never on 4xx), and `recordsPath`/`totalPath`/`requestIdPath` extraction —
 * so flipping a datasource's `transport.kind` from `mock` to `http` is a
 * config-only change once the real docs arrive.
 */
export class HttpInfoAdapter implements DatasourceAdapter {
  private readonly logger = new Logger(HttpInfoAdapter.name);
  private readonly transport: TransportHttp;

  constructor(
    private readonly datasource: DatasourceEntry,
    private readonly secrets: ResolvedHttpSecrets,
  ) {
    if (datasource.transport.kind !== 'http') {
      throw new Error(`HttpInfoAdapter requires transport.kind=http, got "${datasource.transport.kind}"`);
    }
    this.transport = datasource.transport;
  }

  async execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    const timeoutMs = this.transport.timeoutMs ?? 10_000;
    const tracker: ExchangeTracker = {};
    const startedAt = Date.now();
    try {
      return await withTimeout(this.runWithRetry(input, tracker), timeoutMs, this.datasource.code);
    } catch (err) {
      // Attach what was actually sent/received so QueryLogService can store it; the thrown error itself is unchanged.
      if (err instanceof UpstreamTimeoutError && tracker.last?.response.statusCode == null) {
        if (tracker.last) {
          tracker.last.response.error = err.message;
          tracker.last.response.durationMs = Date.now() - startedAt;
        }
      }
      if (err && typeof err === 'object' && tracker.last && !(err as { exchange?: unknown }).exchange) {
        (err as { exchange?: UpstreamExchange }).exchange = tracker.last;
      }
      throw err;
    }
  }

  private async runWithRetry(input: AdapterExecuteInput, tracker: ExchangeTracker): Promise<AdapterExecuteResult> {
    const attempts = Math.max(1, (this.transport.retry?.attempts ?? 0) + 1);
    const backoffMs = this.transport.retry?.backoffMs ?? 300;

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.callOnce(input, attempt, tracker);
      } catch (err) {
        lastError = err;
        // Never retry a 4xx (client error) — RetryableError below only thrown for network/5xx/429.
        if (!(err instanceof RetryableError) || attempt === attempts) break;
        this.logger.warn(`${this.datasource.code}: retrying after attempt ${attempt}/${attempts} failed: ${(err as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
      }
    }
    throw lastError instanceof RetryableError
      ? new UpstreamError(lastError.message, this.datasource.code, lastError.cause, tracker.last)
      : lastError;
  }

  private async callOnce(input: AdapterExecuteInput, attempt: number, tracker: ExchangeTracker): Promise<AdapterExecuteResult> {
    const url = new URL(this.transport.path, this.secrets.baseUrl);
    const body = this.buildUpstreamBody(input.params);
    const headers: Record<string, string> = { 'content-type': 'application/json', ...this.transport.headers };
    if (this.transport.auth?.kind === 'apiKeyHeader' && this.transport.auth.header && this.secrets.apiKeyValue) {
      headers[this.transport.auth.header] = this.secrets.apiKeyValue;
    } else if (this.transport.auth?.kind === 'bearer' && this.secrets.apiKeyValue) {
      headers.authorization = `Bearer ${this.secrets.apiKeyValue}`;
    }

    const sendsBody = this.transport.method === 'POST';
    const snapshot: UpstreamRequestSnapshot = {
      transport: 'http',
      method: this.transport.method,
      url: safeUrl(url),
      headers: redactHeaders(headers, this.transport.auth?.header ? [this.transport.auth.header] : []),
      body: sendsBody ? body : null,
      attempt,
    };
    const startedAt = Date.now();
    const record = (response: Partial<UpstreamResponseSnapshot>): UpstreamExchange =>
      (tracker.last = buildExchange(snapshot, { durationMs: Date.now() - startedAt, ...response }));
    // Placeholder in case the overall timeout fires while this attempt is still in flight.
    record({ error: 'no response received yet' });

    let response;
    try {
      response = await request(url, {
        method: this.transport.method,
        headers,
        body: sendsBody ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.transport.timeoutMs ?? 10_000),
      });
    } catch (err) {
      record({ error: `network error: ${(err as Error).message}` });
      throw new RetryableError(`network error calling ${this.datasource.code}`, err);
    }

    const text = await response.body.text().catch(() => null);
    const parsed = text === null ? null : parseBodyText(text);

    if (response.statusCode >= 500 || response.statusCode === 429) {
      record({ statusCode: response.statusCode, body: parsed, error: `upstream returned ${response.statusCode}` });
      throw new RetryableError(`upstream ${this.datasource.code} returned ${response.statusCode}`);
    }
    if (response.statusCode >= 400) {
      record({ statusCode: response.statusCode, body: parsed, error: `upstream returned ${response.statusCode}` });
      throw new UpstreamError(`upstream ${this.datasource.code} returned ${response.statusCode}`, this.datasource.code);
    }

    record({ statusCode: response.statusCode, body: parsed });
    if (text === null) throw new Error('failed to read upstream response body');
    const json = JSON.parse(text) as unknown; // invalid JSON on 2xx still throws SyntaxError like before
    const records = (getByPath(json, this.datasource.output.recordsPath) as RawRecord[] | undefined) ?? [];
    const total = getByPath(json, this.datasource.output.totalPath) as number | undefined;
    const requestId = getByPath(json, this.datasource.output.requestIdPath) as string | undefined;
    return { records, total, requestId, exchange: tracker.last };
  }

  private buildUpstreamBody(params: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const field of this.datasource.input.fields) {
      const value = params[field.name];
      if (value === undefined) continue;
      body[field.mapTo ?? field.name] = value;
    }
    return body;
  }
}

/** Internal marker distinguishing "retry me" failures (network/5xx/429) from terminal 4xx failures. */
class RetryableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

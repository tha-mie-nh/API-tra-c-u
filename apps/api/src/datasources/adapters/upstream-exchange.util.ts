import type { UpstreamRequestSnapshot, UpstreamResponseSnapshot } from '@app/shared';
import type { UpstreamExchange } from './datasource-adapter.interface';

export const REDACTED = '[redacted]';
/** Cap for raw text bodies kept in a snapshot (final per-part limit is applied again at write time). */
export const MAX_TEXT_BODY_CHARS = 64 * 1024;

const SECRET_HEADER_RE = /auth|api[-_]?key|token|secret|cookie|password|credential/i;

/** Copy of `headers` with every secret-looking header value (and any header named in `extraSecretHeaders`) replaced by "[redacted]". */
export function redactHeaders(headers: Record<string, string>, extraSecretHeaders: string[] = []): Record<string, string> {
  const extra = new Set(extraSecretHeaders.map((h) => h.toLowerCase()));
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, SECRET_HEADER_RE.test(k) || extra.has(k.toLowerCase()) ? REDACTED : v]),
  );
}

/** URL without credentials/query string (query values may carry API keys). */
export function safeUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

/** Best-effort body parse: JSON when possible, else capped text. */
export function parseBodyText(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.length > MAX_TEXT_BODY_CHARS ? `${text.slice(0, MAX_TEXT_BODY_CHARS)}...[cut]` : text;
  }
}

export function buildExchange(
  request: UpstreamRequestSnapshot,
  response: Partial<UpstreamResponseSnapshot>,
): UpstreamExchange {
  return {
    request,
    response: { statusCode: null, durationMs: null, body: null, error: null, ...response },
  };
}

/** Minimal exchange for non-network transports (mock / minio-pg). */
export function localExchange(
  transport: UpstreamRequestSnapshot['transport'],
  body: unknown,
  response: Partial<UpstreamResponseSnapshot> = {},
): UpstreamExchange {
  return buildExchange({ transport, method: null, url: null, headers: {}, body, attempt: 1 }, response);
}

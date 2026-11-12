import { DEFAULT_PAYLOAD_MAX_BYTES } from './query-log-payload-sanitizer.util';

export interface QueryLogPayloadConfig {
  enabled: boolean;
  maxBytes: number;
}

function toInt(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** QUERY_LOG_PAYLOAD_ENABLED (default true), _MAX_BYTES (default 2097152). */
export function readPayloadConfig(get: (key: string) => string | undefined): QueryLogPayloadConfig {
  const enabledRaw = get('QUERY_LOG_PAYLOAD_ENABLED')?.trim().toLowerCase();
  const maxBytes = toInt(get('QUERY_LOG_PAYLOAD_MAX_BYTES'), DEFAULT_PAYLOAD_MAX_BYTES);
  return {
    enabled: !(enabledRaw === 'false' || enabledRaw === '0' || enabledRaw === 'no'),
    maxBytes: maxBytes > 0 ? maxBytes : DEFAULT_PAYLOAD_MAX_BYTES,
  };
}

import { createHash } from 'node:crypto';
import type { DatasourceEntry, ImagePlaceholder, QueryLogPayloadParts, TruncatedMarker } from '@app/shared';
import { redactHeaders } from '../datasources/adapters/upstream-exchange.util';

export const DEFAULT_PAYLOAD_MAX_BYTES = 2_097_152;
const PREVIEW_CHARS = 2048;
const MAX_DEPTH = 64;
const DATA_IMAGE_RE = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]*)$/i;
const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;
/** An `image` field value shorter than this is an id/URL/short text, not an inline image. */
const MIN_RAW_BASE64_CHARS = 128;

export interface PayloadSanitizeOptions {
  maxBytes: number;
  /** Keys whose string value is an inline base64 image: output `name`s (client response) + `from`s (upstream response). */
  imageKeys: ReadonlySet<string>;
}

/** Output field keys of `type:"image"` for a datasource (name + upstream `from`). */
export function collectImageKeys(entry: DatasourceEntry | undefined): Set<string> {
  const keys = new Set<string>();
  for (const f of entry?.output.fields ?? []) {
    if (f.type !== 'image') continue;
    keys.add(f.name);
    if (f.from) keys.add(f.from);
  }
  return keys;
}

function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function toPlaceholder(base64: string, declaredMime: string | null): ImagePlaceholder {
  const buf = Buffer.from(base64.replace(/\s/g, ''), 'base64');
  return {
    $image: true,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    mime: declaredMime ?? sniffMime(buf),
  };
}

function replaceImages(value: unknown, key: string | null, imageKeys: ReadonlySet<string>, depth: number): unknown {
  if (typeof value === 'string') {
    const data = DATA_IMAGE_RE.exec(value);
    if (data) return toPlaceholder(data[2] ?? '', (data[1] ?? '').toLowerCase() || null);
    if (key !== null && imageKeys.has(key) && value.length >= MIN_RAW_BASE64_CHARS && BASE64_RE.test(value)) {
      return toPlaceholder(value, null);
    }
    return value;
  }
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => replaceImages(v, key, imageKeys, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = replaceImages(v, k, imageKeys, depth + 1);
  }
  return out;
}

function truncateIfOversized(value: unknown, maxBytes: number): unknown {
  if (value === null || value === undefined) return null;
  const json = JSON.stringify(value);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes <= maxBytes) return value;
  const marker: TruncatedMarker = { $truncated: true, originalBytes: bytes, preview: json.slice(0, PREVIEW_CHARS) };
  return marker;
}

/**
 * Produces what is actually persisted: auth/api-key header values redacted
 * (defence in depth — the adapter already does it), base64 images replaced by
 * placeholders, and any part above `maxBytes` replaced by a truncation marker.
 * Pure: never mutates its input.
 */
export function sanitizePayloadParts(parts: QueryLogPayloadParts, options: PayloadSanitizeOptions): QueryLogPayloadParts {
  const { maxBytes, imageKeys } = options;
  const request = parts.upstreamRequest
    ? { ...parts.upstreamRequest, headers: redactHeaders(parts.upstreamRequest.headers ?? {}) }
    : null;
  const clean = (part: unknown): unknown => truncateIfOversized(replaceImages(part, null, imageKeys, 0), maxBytes);
  return {
    upstreamRequest: clean(request) as QueryLogPayloadParts['upstreamRequest'],
    upstreamResponse: clean(parts.upstreamResponse) as QueryLogPayloadParts['upstreamResponse'],
    clientResponse: clean(parts.clientResponse),
  };
}

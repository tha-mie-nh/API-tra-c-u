import { isIP } from 'net';

/**
 * Parses env TRUST_PROXY for express `trust proxy`. Unset/''/'false' => false (request.ip = direct peer).
 * Accepted: 'true' (trusts EVERY hop => X-Forwarded-For spoofable; avoid), a hop count (integer), or a CSV of
 * express keywords (loopback, linklocal, uniquelocal) / valid IPs / CIDR subnets. Anything else (e.g. 'yes')
 * is rejected: `onInvalid` is called and the safe default (false) is returned, so a typo never crashes boot.
 */
const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidEntry(entry: string): boolean {
  if (KEYWORDS.has(entry.toLowerCase())) return true;
  const [addr, prefix, ...rest] = entry.split('/');
  const family = isIP(addr ?? '');
  if (!family || rest.length) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

export function parseTrustProxy(raw: string | undefined, onInvalid?: (value: string) => void): boolean | number | string {
  const v = raw?.trim();
  if (!v || v.toLowerCase() === 'false') return false;
  if (v.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  const entries = v.split(',').map((e) => e.trim());
  if (entries.every((e) => e && isValidEntry(e))) return v;
  onInvalid?.(v);
  return false;
}

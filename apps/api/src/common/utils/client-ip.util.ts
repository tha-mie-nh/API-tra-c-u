import { isIP } from 'net';
import { Prisma } from '@prisma/client';

const MAPPED_V4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * Normalises a raw client IP for storage in an `inet` column: invalid / garbage values
 * (e.g. a spoofed X-Forwarded-For token) => null, IPv4-mapped IPv6 ('::ffff:1.2.3.4') => plain IPv4.
 */
export function normalizeClientIp(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || isIP(v) === 0) return null;
  const m = MAPPED_V4.exec(v);
  return m ? m[1]! : v;
}

/**
 * All stored spellings of one host: legacy rows may hold '::ffff:x.x.x.x'. Using `ip = ANY(...)`
 * keeps the btree index usable (trade-off: two index probes instead of one, vs. a non-sargable expression).
 */
export function ipEquivalents(ip: string): string[] {
  const n = normalizeClientIp(ip) ?? ip;
  return isIP(n) === 4 ? [n, `::ffff:${n}`] : [n];
}

/** Display/grouping expression: legacy '::ffff:x' rows and plain IPv4 rows collapse to one group (not index-assisted; runs after WHERE). */
export const NORMALIZED_IP_SQL = Prisma.sql`regexp_replace(host(ip), '^::ffff:', '', 'i')`;

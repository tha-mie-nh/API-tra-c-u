const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses simple duration strings like "15m", "7d", "30s" into milliseconds.
 * Used for JWT/refresh-token TTLs and cookie `maxAge` (kept as plain strings
 * in `.env` because that is also what `@nestjs/jwt`'s `expiresIn` accepts
 * natively — this util is only needed where WE compute the raw ms value,
 * e.g. refresh-token expiry and cookie maxAge).
 */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${input}" (expected e.g. "15m", "7d")`);
  }
  const [, value, unit] = match;
  const multiplier = UNIT_MS[unit as string];
  if (multiplier === undefined) {
    throw new Error(`Invalid duration unit: "${unit}"`);
  }
  return Number(value) * multiplier;
}

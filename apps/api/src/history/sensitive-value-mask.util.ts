import type { DatasourceEntry } from '@app/shared';

/** Reveals only the last 4 characters; the rest is starred out. */
export function maskValue(raw: unknown): string {
  const value = String(raw);
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

/**
 * Builds the human-readable `query_summary` and a `params` projection from
 * raw query input, matching each param to its config `input.fields[].label`.
 * `mask: true` stars out any field whose NAME also appears as a
 * `sensitive:true` output field (e.g. `citizenId`) — same rule used both:
 * - at write-time no longer applies (query_logs now stores the real value —
 *   review feedback: an ADMIN must be able to see the real lookup id), and
 * - at read-time (`HistoryService`), for any caller without
 *   `history:view_sensitive`.
 */
export function summarizeQueryParams(
  entry: DatasourceEntry | undefined,
  params: Record<string, unknown>,
  options: { mask: boolean },
): { summary: string; params: Record<string, unknown> } {
  const sensitiveNames = new Set(getSensitiveInputFieldNames(entry));
  const outParams: Record<string, unknown> = {};
  const parts: string[] = [];

  for (const field of entry?.input.fields ?? []) {
    const value = params[field.name];
    if (value === undefined || value === null || value === '') continue;
    const shouldMask = options.mask && sensitiveNames.has(field.name);
    const display = shouldMask ? maskValue(value) : value;
    outParams[field.name] = display;
    parts.push(`${field.label}=${String(display)}`);
  }

  return { summary: parts.join('; '), params: outParams };
}

/** Names of input fields that are also `sensitive:true` output fields
 * (same rule as masking) — reused by anomaly detection of shared identities. */
export function getSensitiveInputFieldNames(entry: DatasourceEntry | undefined): string[] {
  const sensitive = new Set((entry?.output.fields ?? []).filter((f) => f.sensitive).map((f) => f.name));
  return (entry?.input.fields ?? []).map((f) => f.name).filter((n) => sensitive.has(n));
}

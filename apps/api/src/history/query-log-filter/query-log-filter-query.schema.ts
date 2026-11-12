import { z } from 'zod';
import { QUERY_LOG_NULL_TOKEN, vnDateStartIso, vnNextDateStartIso, type QueryLogOutcome, type QueryLogStatus } from '@app/shared';

/** Typed, validated filter. `undefined` = not filtered, `null` = `IS NULL`. */
export interface QueryLogFilter {
  from?: Date;
  /** Exclusive upper bound. */
  to?: Date;
  datasourceCode?: string;
  status?: QueryLogStatus[];
  outcome?: QueryLogOutcome;
  userId?: string | null;
  username?: string;
  statusCode?: number | null;
  errorCode?: string | null;
  ip?: string;
  durationMinMs?: number;
  durationMaxMs?: number;
  hasRecords?: boolean;
  upstreamRequestId?: string;
  offHours?: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['success', 'failed', 'denied'] as const;

/** Query strings may carry '' (cleared inputs) — treat as absent. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** Datetime with offset, or YYYY-MM-DD = 00:00 Asia/Ho_Chi_Minh (for `to`: start of the NEXT VN day => inclusive whole day). */
const dateField = (kind: 'from' | 'to') =>
  optional(
    z.string().transform((s, ctx) => {
      let d: Date;
      if (isValidDateOnly(s)) {
        d = new Date(kind === 'from' ? vnDateStartIso(s) : vnNextDateStartIso(s));
      } else if (z.iso.datetime({ offset: true }).safeParse(s).success) {
        d = new Date(s);
      } else {
        ctx.issues.push({ code: 'custom', message: `${kind} must be YYYY-MM-DD or ISO datetime with offset`, input: s });
        return z.NEVER;
      }
      return d;
    }),
  );

function isValidDateOnly(s: string): boolean {
  if (!DATE_ONLY.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const nullable = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal(QUERY_LOG_NULL_TOKEN).transform(() => null), schema]);

const intString = (min: number, max: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));

const statusField = optional(
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()))
    .pipe(z.array(z.enum(STATUSES)).min(1).max(3))
    .transform((arr) => [...new Set(arr)]),
);

/** Raw shape (before cross-field refine) — extend this for list/summary/export DTOs via `withQueryLogFilter`. */
export const queryLogFilterShape = {
  from: dateField('from'),
  to: dateField('to'),
  datasourceCode: optional(z.string().min(1).max(100)),
  status: statusField,
  outcome: optional(z.enum(['answered', 'empty', 'gap'])),
  userId: optional(nullable(z.uuid())),
  username: optional(z.string().min(1).max(100)),
  statusCode: optional(nullable(intString(100, 599))),
  errorCode: optional(nullable(z.string().regex(/^[A-Z0-9_]{1,100}$/i))),
  ip: optional(z.union([z.ipv4(), z.ipv6()])),
  durationMinMs: optional(intString(0, 2_147_483_647)),
  durationMaxMs: optional(intString(0, 2_147_483_647)),
  hasRecords: optional(z.enum(['true', 'false']).transform((v) => v === 'true')),
  upstreamRequestId: optional(z.string().min(1).max(255)),
  offHours: optional(z.literal('true').transform(() => true)),
};

function refineFilter(f: QueryLogFilter, ctx: z.RefinementCtx): void {
  if (f.from && f.to && f.from >= f.to) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'from must be earlier than to' });
  }
  if (f.durationMinMs !== undefined && f.durationMaxMs !== undefined && f.durationMinMs > f.durationMaxMs) {
    ctx.addIssue({ code: 'custom', path: ['durationMaxMs'], message: 'durationMinMs must be <= durationMaxMs' });
  }
}

/** Filter schema plus extra (non-filter) keys, e.g. page/sort/limit. Output = typed QueryLogFilter & extras. */
export function withQueryLogFilter<S extends z.ZodRawShape>(extra: S) {
  return z.object({ ...queryLogFilterShape, ...extra }).superRefine((v, ctx) => refineFilter(v as QueryLogFilter, ctx));
}

export const queryLogFilterQuerySchema = withQueryLogFilter({});

import { Prisma } from '@prisma/client';

/** Shared aggregate columns. `answered` = success AND record_count>0 (NULL => not answered). */
export const COUNTERS = Prisma.sql`
  COUNT(*)::int AS requests,
  (COUNT(*) FILTER (WHERE status = 'success' AND record_count > 0))::int AS answered,
  (COUNT(*) FILTER (WHERE status = 'success'))::int AS success,
  (COUNT(*) FILTER (WHERE status = 'failed'))::int AS failed,
  (COUNT(*) FILTER (WHERE status = 'denied'))::int AS denied,
  COALESCE(SUM(record_count), 0)::int AS records,
  ROUND(AVG(duration_ms))::int AS avg_duration_ms,
  COALESCE(SUM(duration_ms), 0)::float8 AS duration_sum_ms,
  COUNT(duration_ms)::int AS duration_count`;

/** Gap = not an answered success; NULL record_count counts as gap. Single definition for filter `outcome=gap` and top-users metric. */
export const GAP_SQL = Prisma.sql`NOT (status = 'success' AND COALESCE(record_count, 0) > 0)`;

/** p95 of duration_ms: continuous (linear interpolation), NULL durations ignored, NULL when no data. */
export const P95_DURATION_SQL = Prisma.sql`ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int`;

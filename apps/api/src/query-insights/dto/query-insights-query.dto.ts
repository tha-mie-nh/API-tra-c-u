import { z } from 'zod';
import { QUERY_INSIGHTS_RULES } from '@app/shared';
import { withQueryLogFilter, type QueryLogFilter } from '../../history/query-log-filter/query-log-filter-query.schema';

const withDefault = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema);
const DAY_MS = 86_400_000;

/**
 * Shared QueryLog filter + metric/limit. `from`/`to` are REQUIRED (half-open
 * [from,to), VN-time date-only allowed) and span at most `maxRangeDays` — keeps
 * jsonb/window scans bounded. Same filter keys as `/history`, so every number
 * can be cross-checked against the same filter there.
 */
export const queryInsightsQuerySchema = withQueryLogFilter({
  metric: withDefault(z.enum(['requests', 'failed', 'denied', 'gap']).default('requests')),
  limit: withDefault(z.coerce.number().int().min(1).max(QUERY_INSIGHTS_RULES.maxRowsPerList).default(20)),
}).superRefine((v, ctx) => {
  if (!v.from) ctx.addIssue({ code: 'custom', path: ['from'], message: 'from is required' });
  if (!v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to is required' });
  if (v.from && v.to && v.to.getTime() - v.from.getTime() > QUERY_INSIGHTS_RULES.maxRangeDays * DAY_MS) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: `range must be <= ${QUERY_INSIGHTS_RULES.maxRangeDays} days` });
  }
});

export type QueryInsightsQueryDto = z.infer<typeof queryInsightsQuerySchema> & QueryLogFilter;

export const csvTableSchema = z.object({
  table: z.enum([
    'top-users', 'top-errors', 'datasource-latency', 'anomalies-spikes',
    'anomalies-off-hours', 'anomalies-shared-identities', 'anomalies-shared-ips',
  ]),
});
export const exportQuerySchema = queryInsightsQuerySchema.and(csvTableSchema);
export const userIdParamSchema = z.object({ userId: z.uuid() });
export const ipParamSchema = z.object({ ip: z.union([z.ipv4(), z.ipv6()]) });

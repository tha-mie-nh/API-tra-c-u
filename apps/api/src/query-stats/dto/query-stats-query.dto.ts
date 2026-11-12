import { z } from 'zod';
import { QUERY_STATS_DEFAULT_PRESET, QUERY_STATS_MAX_RANGE_DAYS } from '@app/shared';

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((v) => {
    const [y = 0, m = 0, d = 0] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Invalid calendar date');

export const queryStatsQuerySchema = z
  .object({
    preset: z
      .enum([
        'today',
        'yesterday',
        'this_month',
        'this_year',
        'last_24h',
        'last_7d',
        'last_30d',
        'last_90d',
        'last_month',
        'custom',
      ])
      .default(QUERY_STATS_DEFAULT_PRESET as 'last_7d'),
    granularity: z.enum(['hour', 'day', 'month']).optional(),
    from: ymd.optional(),
    to: ymd.optional(),
  })
  .superRefine((q, ctx) => {
    if (q.preset !== 'custom') return;
    if (!q.from || !q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from and to are required when preset=custom' });
      return;
    }
    if (q.from > q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be <= to' });
      return;
    }
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 + 1;
    if (days > QUERY_STATS_MAX_RANGE_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `Range must be <= ${QUERY_STATS_MAX_RANGE_DAYS} days` });
    }
  });

export type QueryStatsQueryDto = z.infer<typeof queryStatsQuerySchema>;

export const datasourceCodeParamSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Invalid datasource code'),
});

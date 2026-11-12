import { z } from 'zod';
import { HISTORY_MAX_OFFSET } from '@app/shared';
import { withQueryLogFilter, type QueryLogFilter } from '../query-log-filter/query-log-filter-query.schema';

/** Query strings may carry '' (cleared inputs) — treat as absent so defaults apply. */
const withDefault = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema);

/**
 * `GET /history` = shared filter (query-log-filter) + sort + offset paging.
 * `userId/username/ip` are accepted at the wire level only — scope resolution
 * (resolveQueryLogScope + builder) decides whether they are honored; a
 * view_own caller's scope is forced server-side, never from the query string.
 */
export const listHistoryQuerySchema = withQueryLogFilter({
  sort: withDefault(z.enum(['createdAt', 'durationMs', 'recordCount']).default('createdAt')),
  order: withDefault(z.enum(['asc', 'desc']).default('desc')),
  page: withDefault(z.coerce.number().int().min(1).default(1)),
  pageSize: withDefault(z.coerce.number().int().min(1).max(100).default(20)),
}).superRefine((v, ctx) => {
  if (v.page * v.pageSize > HISTORY_MAX_OFFSET) {
    ctx.addIssue({
      code: 'custom',
      path: ['page'],
      message: `page * pageSize must be <= ${HISTORY_MAX_OFFSET}; narrow the filters or export CSV`,
    });
  }
});

export type ListHistoryQueryDto = z.infer<typeof listHistoryQuerySchema> & QueryLogFilter;

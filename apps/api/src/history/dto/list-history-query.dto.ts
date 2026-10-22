import { z } from 'zod';

/**
 * `GET /history` query filters (reference-api-specification.md: "Filters:
 * username, datasourceCode, from, to, status"). `username` (not `userId` —
 * review feedback: a UUID is not something an admin can type from memory)
 * is accepted here at the wire level ONLY — HistoryService is the sole
 * place that decides whether it is honored at all (Security Considerations:
 * a `history:view_own`-only caller's scope is still forcibly their own id,
 * never taken from the query string).
 */
export const listHistoryQuerySchema = z.object({
  username: z.string().min(1).optional(),
  datasourceCode: z.string().optional(),
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'from must be a valid date/datetime').optional(),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'to must be a valid date/datetime').optional(),
  status: z.enum(['success', 'failed', 'denied']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListHistoryQueryDto = z.infer<typeof listHistoryQuerySchema>;

import { z } from 'zod';

/**
 * Envelope-level body shape of `POST /query/:code` — `params` itself is
 * re-validated against the datasource's own cached Zod schema inside
 * `QueryService` (built at boot from config.json input fields), since its
 * shape is only known at runtime per-datasource.
 */
export const queryRequestSchema = z.object({
  params: z.record(z.string(), z.unknown()).default({}),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

export type QueryRequestDto = z.infer<typeof queryRequestSchema>;

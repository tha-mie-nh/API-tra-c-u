import { z } from 'zod';

/** `PATCH /admin/datasources/:code/enabled` body — the only hand-written
 * Zod schema in this module (phase-02 Key Insights: the AJV `config.schema.json`
 * is the source of truth for an entry's shape; duplicating it in Zod would
 * be a second DSL to keep in sync). */
export const setDatasourceEnabledSchema = z.object({
  enabled: z.boolean(),
});

export type SetDatasourceEnabledDto = z.infer<typeof setDatasourceEnabledSchema>;

import { z } from 'zod';

export const setRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

export type SetRolesDto = z.infer<typeof setRolesSchema>;

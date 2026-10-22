import { z } from 'zod';

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
});

export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;

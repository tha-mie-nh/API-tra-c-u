import { z } from 'zod';

export const createRoleSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Role code must be UPPER_SNAKE_CASE'),
  name: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;

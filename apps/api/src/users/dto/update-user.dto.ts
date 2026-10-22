import { z } from 'zod';

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;

import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(3).max(100),
  fullName: z.string().min(1).max(255),
  email: z.string().email().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  username: z.string().min(1, 'username is required'),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

import { z } from 'zod';

// Min length 12, no forced rotation/complexity rule — proposal pending
// confirmation from the leader (see phase-03 Unresolved Questions).
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(12, 'Password must be at least 12 characters'),
});

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

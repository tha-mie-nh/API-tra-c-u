import { z } from 'zod';
import { vi } from '@/i18n/vi';

/** Mirrors `apps/api/src/auth/dto/change-password.dto.ts` (min length 12). */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(12, vi.auth.passwordMinLength),
    confirmPassword: z.string().min(1, vi.auth.passwordMismatch),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: vi.auth.passwordMismatch,
    path: ['confirmPassword'],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

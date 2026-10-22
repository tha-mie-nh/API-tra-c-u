import { z } from 'zod';
import { vi } from '@/i18n/vi';

/** Client-side mirror of `apps/api/src/auth/dto/login.dto.ts` — UX only, the
 * server re-validates (see phase-06 Key Insights). */
export const loginFormSchema = z.object({
  username: z.string().min(1, vi.auth.usernameRequired),
  password: z.string().min(1, vi.auth.passwordRequired),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

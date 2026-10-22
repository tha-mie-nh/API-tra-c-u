import { z } from 'zod';
import { vi } from '@/i18n/vi';

/** Mirrors `apps/api/src/users/dto/create-user.dto.ts` / `update-user.dto.ts`. */
export const userFormSchema = z.object({
  username: z.string().min(3, vi.admin.users.usernameRequired).max(100),
  fullName: z.string().min(1, vi.admin.users.fullNameRequired).max(255),
  email: z.union([z.literal(''), z.string().email(vi.admin.users.emailInvalid)]),
  roleIds: z.array(z.string()),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

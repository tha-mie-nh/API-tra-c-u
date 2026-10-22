import { z } from 'zod';
import { vi } from '@/i18n/vi';

/** Mirrors `apps/api/src/roles/dto/create-role.dto.ts` / `update-role.dto.ts`. */
export const roleFormSchema = z.object({
  code: z
    .string()
    .min(2, vi.admin.roles.codeRequired)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, vi.admin.roles.codeRequired),
  name: z.string().min(1, vi.admin.roles.nameRequired).max(150),
  description: z.string().max(1000).optional(),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;

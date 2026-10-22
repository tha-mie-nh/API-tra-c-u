import { z } from 'zod';

export const setPermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1)),
});

export type SetPermissionsDto = z.infer<typeof setPermissionsSchema>;

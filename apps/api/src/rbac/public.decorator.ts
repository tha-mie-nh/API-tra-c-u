import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring authentication or permission checks
 * (bypasses both JwtAuthGuard and PermissionGuard entirely). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

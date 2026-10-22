import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permission(s) required for a route; ANY one of the given
 * codes is sufficient. Call with zero args to mark a route as
 * "authenticated only" (no specific permission needed) while still
 * satisfying the fail-closed PermissionGuard invariant: every non-@Public()
 * route MUST carry this decorator, even with an empty list — a route with
 * neither @Public() nor @RequirePermission() is denied (see PermissionGuard).
 */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

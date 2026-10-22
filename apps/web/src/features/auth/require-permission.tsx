import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuthStore } from '@/lib/auth-store';

interface RequirePermissionProps {
  /** Route renders if the user holds at least one of these permission codes. */
  anyOf: string[];
  children: ReactNode;
}

/**
 * FE-side permission gate — UX only, never the real security boundary (the
 * backend re-checks on every request per spec g). Unauthorized navigation
 * lands on `/403`, not a blank screen (phase-06 step 6). Always pass
 * permission codes imported from `@shared/index` (`packages/shared`), never a
 * `user.role === '...'` check (phase-06 Risk Assessment).
 */
export function RequirePermission({ anyOf, children }: RequirePermissionProps) {
  const hasAnyPermission = useAuthStore((state) => state.hasAnyPermission);
  if (!hasAnyPermission(anyOf)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}

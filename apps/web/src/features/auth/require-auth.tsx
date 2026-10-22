import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '@/lib/auth-store';
import { vi } from '@/i18n/vi';

/** Route guard: unauthenticated -> `/login` (preserving the attempted path);
 * `mustChangePassword` -> forced redirect to `/change-password`, blocking
 * every other route until resolved (phase-06 requirement). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (status === 'booting') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-muted-foreground text-sm">{vi.common.loading}</p>
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}

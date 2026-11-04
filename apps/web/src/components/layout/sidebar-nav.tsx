import { NavLink } from 'react-router';
import { Home, History, Users, KeyRound, ScrollText, Database } from 'lucide-react';
import { FEATURE_PERMISSION_CODES } from '@shared/index';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth-store';
import { useDatasources } from '@/features/datasources/use-datasources';
import { vi } from '@/i18n/vi';
import { DatasourceIcon } from './datasource-icon';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
    isActive ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

function SectionLabel({ children }: { children: string }) {
  return <p className="text-muted-foreground px-2.5 pt-4 pb-1 text-xs font-semibold uppercase">{children}</p>;
}

/**
 * Permission-driven sidebar (reference-screens-and-ux.md "Navigation
 * model"): built entirely from `GET /auth/me` permissions + `GET
 * /datasources` — no hardcoded menu, no `user.role === '...'` checks. A user
 * with no `api:*` permission sees no "Tra cứu" section at all.
 */
export function SidebarNav() {
  const hasAnyPermission = useAuthStore((state) => state.hasAnyPermission);
  const { data: datasources, isLoading } = useDatasources();

  const canViewHistory = hasAnyPermission([
    FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN,
    FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL,
  ]);
  const canViewUsers = hasAnyPermission([FEATURE_PERMISSION_CODES.ADMIN_USERS]);
  const canViewRoles = hasAnyPermission([FEATURE_PERMISSION_CODES.ADMIN_ROLES]);
  const canViewAudit = hasAnyPermission([FEATURE_PERMISSION_CODES.ADMIN_AUDIT]);
  const canViewDatasources = hasAnyPermission([FEATURE_PERMISSION_CODES.ADMIN_DATASOURCES]);
  const showAdminSection = canViewUsers || canViewRoles || canViewAudit || canViewDatasources;

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      <NavLink to="/" end className={linkClass}>
        <Home className="size-4" />
        {vi.nav.home}
      </NavLink>

      {isLoading && (
        <div className="flex flex-col gap-2 px-2.5 pt-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-full" />
        </div>
      )}

      {!isLoading && !!datasources?.length && (
        <>
          <SectionLabel>{vi.nav.lookupSection}</SectionLabel>
          {datasources.map((ds) => (
            <NavLink key={ds.code} to={`/tra-cuu/${ds.code}`} className={linkClass}>
              <DatasourceIcon code={ds.code} className="size-4" />
              {ds.name}
            </NavLink>
          ))}
        </>
      )}

      {canViewHistory && (
        <>
          <SectionLabel>{vi.nav.history}</SectionLabel>
          <NavLink to="/lich-su" className={linkClass}>
            <History className="size-4" />
            {vi.nav.history}
          </NavLink>
        </>
      )}

      {showAdminSection && (
        <>
          <SectionLabel>{vi.nav.adminSection}</SectionLabel>
          {canViewUsers && (
            <NavLink to="/quan-tri/nguoi-dung" className={linkClass}>
              <Users className="size-4" />
              {vi.nav.adminUsers}
            </NavLink>
          )}
          {canViewRoles && (
            <NavLink to="/quan-tri/vai-tro" className={linkClass}>
              <KeyRound className="size-4" />
              {vi.nav.adminRoles}
            </NavLink>
          )}
          {canViewAudit && (
            <NavLink to="/quan-tri/nhat-ky" className={linkClass}>
              <ScrollText className="size-4" />
              {vi.nav.adminAudit}
            </NavLink>
          )}
          {canViewDatasources && (
            <NavLink to="/quan-tri/nguon-du-lieu" className={linkClass}>
              <Database className="size-4" />
              {vi.nav.adminDatasources}
            </NavLink>
          )}
        </>
      )}
    </nav>
  );
}

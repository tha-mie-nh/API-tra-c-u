import { FEATURE_PERMISSION_CODES } from '@app/shared';
import type { JwtUser } from '../../rbac/jwt-user.interface';
import type { QueryLogScope } from './query-log-where-sql.builder';

export interface ResolvedQueryLogAccess {
  scope: QueryLogScope;
  canViewAll: boolean;
  canViewSensitive: boolean;
}

/** The ONLY place that decides row scope: no history:view_all => forced to caller's own rows. */
export function resolveQueryLogScope(user: Pick<JwtUser, 'id'>, permissions: ReadonlySet<string>): ResolvedQueryLogAccess {
  const canViewAll = permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL);
  return {
    scope: canViewAll ? {} : { forcedUserId: user.id },
    canViewAll,
    canViewSensitive: permissions.has(FEATURE_PERMISSION_CODES.HISTORY_VIEW_SENSITIVE),
  };
}

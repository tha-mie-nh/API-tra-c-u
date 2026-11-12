import { Suspense, lazy } from 'react';
import { Routes, Route, useParams } from 'react-router';
import { FEATURE_PERMISSION_CODES, apiPermissionCode } from '@shared/index';
import { RequireAuth } from '@/features/auth/require-auth';
import { RequirePermission } from '@/features/auth/require-permission';
import { AppShell } from '@/components/layout/app-shell';
import { vi } from '@/i18n/vi';
import { NotFoundPage } from './not-found-page';
import { HomePage } from './home-page';

// Route-level code splitting (phase-06 non-functional requirement) for the
// heavier/rarer-hit screens; HomePage/AppShell stay eager since they're on
// the main authenticated path.
const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/forgot-password-page').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ChangePasswordPage = lazy(() =>
  import('@/features/auth/change-password-page').then((m) => ({ default: m.ChangePasswordPage })),
);
const ForbiddenPage = lazy(() => import('@/features/auth/forbidden-page').then((m) => ({ default: m.ForbiddenPage })));
const QueryPage = lazy(() => import('@/features/query/query-page').then((m) => ({ default: m.QueryPage })));
// Phase 08 — admin & history screens, code-split like the rest of the rarer-hit routes.
const HistoryPage = lazy(() => import('@/features/history/history-page').then((m) => ({ default: m.HistoryPage })));
const UsersPage = lazy(() => import('@/features/admin/users/users-page').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('@/features/admin/roles/roles-page').then((m) => ({ default: m.RolesPage })));
const AuditLogPage = lazy(() =>
  import('@/features/admin/audit/audit-log-page').then((m) => ({ default: m.AuditLogPage })),
);
const DatasourcesAdminPage = lazy(() =>
  import('@/features/admin/datasources/datasources-admin-page').then((m) => ({ default: m.DatasourcesAdminPage })),
);
const QueryStatsOverviewPage = lazy(() =>
  import('@/features/admin/query-stats/query-stats-overview-page').then((m) => ({ default: m.QueryStatsOverviewPage })),
);
const QueryStatsDatasourceDetailPage = lazy(() =>
  import('@/features/admin/query-stats/query-stats-datasource-detail-page').then((m) => ({
    default: m.QueryStatsDatasourceDetailPage,
  })),
);

const QueryInsightsPage = lazy(() =>
  import('@/features/admin/query-insights/query-insights-page').then((m) => ({ default: m.QueryInsightsPage })),
);
const QueryInsightsUserActivityPage = lazy(() =>
  import('@/features/admin/query-insights/query-insights-user-activity-page').then((m) => ({
    default: m.QueryInsightsUserActivityPage,
  })),
);
const QueryInsightsIpActivityPage = lazy(() =>
  import('@/features/admin/query-insights/query-insights-ip-activity-page').then((m) => ({
    default: m.QueryInsightsIpActivityPage,
  })),
);

function RouteLoading() {
  return <div className="text-muted-foreground p-6 text-sm">{vi.common.loading}</div>;
}

/** `/tra-cuu/:code` — permission derived from the `:code` path param, exactly
 * like the backend's per-datasource enforcement (reference-api-specification.md
 * "Permission enforcement rule"). Phase 07: dynamic form + timeline/photo results. */
function DatasourceRoute() {
  const { code } = useParams<{ code: string }>();
  return (
    <RequirePermission anyOf={[apiPermissionCode(code ?? '')]}>
      <QueryPage />
    </RequirePermission>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="tra-cuu/:code" element={<DatasourceRoute />} />
          <Route
            path="lich-su"
            element={
              <RequirePermission
                anyOf={[FEATURE_PERMISSION_CODES.HISTORY_VIEW_OWN, FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]}
              >
                <HistoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/nguoi-dung"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.ADMIN_USERS]}>
                <UsersPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/vai-tro"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.ADMIN_ROLES]}>
                <RolesPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/nhat-ky"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.ADMIN_AUDIT]}>
                <AuditLogPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/nguon-du-lieu"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.ADMIN_DATASOURCES]}>
                <DatasourcesAdminPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/thong-ke"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.ADMIN_QUERY_STATS]}>
                <QueryStatsOverviewPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/thong-ke/:code"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.ADMIN_QUERY_STATS]}>
                <QueryStatsDatasourceDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/phan-tich-tra-cuu"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]}>
                <QueryInsightsPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/phan-tich-tra-cuu/nguoi-dung/:userId"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]}>
                <QueryInsightsUserActivityPage />
              </RequirePermission>
            }
          />
          <Route
            path="quan-tri/phan-tich-tra-cuu/ip/:ip"
            element={
              <RequirePermission anyOf={[FEATURE_PERMISSION_CODES.HISTORY_VIEW_ALL]}>
                <QueryInsightsIpActivityPage />
              </RequirePermission>
            }
          />
          <Route path="403" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

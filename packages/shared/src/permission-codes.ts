/**
 * Single source of truth for permission codes shared between `apps/api` and
 * `apps/web`. Two kinds (see reference-database-erd.md `permissions.kind`):
 *
 * - "feature" permissions: fixed set, seeded once by Phase 02 (`prisma/seed.ts`).
 * - "api" permissions: NOT hand-maintained — one is auto-synced at boot per
 *   `datasources[].code` in config.json (Phase 04). Never type an `api:*`
 *   string literal in a controller; always derive it from `apiPermissionCode`.
 */

/** Feature permission codes — seeded as DB rows, referenced by controllers/guards. */
export const FEATURE_PERMISSION_CODES = {
  HISTORY_VIEW_OWN: 'history:view_own',
  HISTORY_VIEW_ALL: 'history:view_all',
  /** Review feedback: history should show the real lookup identifier
   * (CCCD/passport/...) to an ADMIN, masked ("***") to everyone else —
   * separate from `HISTORY_VIEW_ALL` (which only controls whose rows you
   * see, not whether sensitive values in those rows are revealed). */
  /** Bulk CSV export of history/insights (ADMIN only via seed). */
  HISTORY_EXPORT: 'history:export',
  HISTORY_VIEW_SENSITIVE: 'history:view_sensitive',
  /** See the exact request input/output (upstream request/response + client response) of any query (ADMIN only via seed). */
  HISTORY_VIEW_PAYLOAD: 'history:view_payload',
  ADMIN_USERS: 'admin:users',
  ADMIN_ROLES: 'admin:roles',
  ADMIN_AUDIT: 'admin:audit',
  /** Phase 02 (admin datasource config live reload): CRUD + enable/disable
   * of `config.json` entries from the web UI. */
  ADMIN_DATASOURCES: 'admin:datasources',
  /** Query statistics dashboard (ADMIN only, not granted to AUDITOR). */
  ADMIN_QUERY_STATS: 'admin:query_stats',
} as const;

export type FeaturePermissionCode =
  (typeof FEATURE_PERMISSION_CODES)[keyof typeof FEATURE_PERMISSION_CODES];

/**
 * Derives the `permissions.code` for a datasource from its config.json `code`.
 * Must match `datasources[].permissionCode` in reference-config-schema.md
 * exactly (e.g. `CITIZEN_BASIC` -> `api:citizen_basic`).
 */
export function apiPermissionCode(datasourceCode: string): string {
  return `api:${datasourceCode.toLowerCase()}`;
}

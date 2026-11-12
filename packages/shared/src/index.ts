/**
 * @app/shared — types shared between apps/api and apps/web.
 *
 * Phase 01: placeholder exports only, to prove the `@shared/*` path alias +
 * pnpm workspace dependency resolves and compiles/runs in both apps.
 * Phase 04 fills in the real `DatasourceConfig`/`ClientDatasource` (config.json
 * DSL) shape and the `QueryEnvelope` (unified query response) shape — the
 * latter's producer (`ResponseMapperService`) is a Phase 04 deliverable per
 * phase-04's "Related Code Files", even though `POST /query/:code` itself
 * (Phase 05) is what will eventually return it over HTTP.
 * Phase 03 fills in the real `PermissionCode` union.
 */

/** Placeholder permission code union (see Phase 03). */
export type PermissionCode = string;

export * from './permission-codes';
export * from './auth-types';
export * from './datasource-config.types';
export * from './query-envelope.types';
export * from './history-types';
export * from './query-log-payload-types';
export * from './admin-types';
export * from './query-stats-types';
export * from './query-log-filter-types';
export * from './query-log-time-range';
export * from './query-insights-types';

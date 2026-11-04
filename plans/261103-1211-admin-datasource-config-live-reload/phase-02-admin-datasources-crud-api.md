# Phase 02 — Admin datasources API (CRUD, atomic write, audit)

## Context Links
- Pattern: `apps/api/src/roles/roles.controller.ts` (`@RequirePermission(FEATURE_PERMISSION_CODES.ADMIN_ROLES)` at class level, `@AuditAction`, `req.auditBefore`)
- `apps/api/src/rbac/permission.guard.ts` (global, fail-closed), `apps/api/src/audit/audit.interceptor.ts` (targetId from `params.id` or `result.id`), `audit.service.ts` (strips `/password|token|secret/i` keys)
- `packages/shared/src/permission-codes.ts`, `apps/api/prisma/seed.ts`
- Error envelope: `common/pipes/zod-validation.pipe.ts` -> `{error:{code,message,details:[{path,message}]}}` 422
- Phase 01 outputs

## Overview
- Priority: P1 · Status: done
- New `AdminDatasourcesModule` under `apps/api/src/admin-datasources/`, ADMIN-only, every mutation: lock -> read disk -> mutate copy -> dry-run build -> atomic write -> apply -> perm sync -> audit.

## Key Insights
- RBAC precedent = one FEATURE permission per admin area (`admin:users|roles|audit`), not role-name checks. Add `admin:datasources`; seed already grants all FEATURE perms to ADMIN (idempotent re-run).
- AJV schema is the source of truth for entry shape -> no Zod duplicate of the DSL. Controller accepts `unknown` body; only tiny Zod for `{enabled: boolean}` toggle.
- Secret-exfil risk: admin could set `auth.valueEnv=JWT_ACCESS_SECRET` + `baseUrl` to an attacker host -> app sends JWT secret as a header. Mitigate with env-NAME policy: `auth.valueEnv` must match `^[A-Z][A-Z0-9_]*_API_KEY$`; `${VAR}` in `baseUrl` must match `^[A-Z][A-Z0-9_]*_BASE_URL$` (matches every existing name in `.env.example`). Applied on admin writes only (hand-edited config untouched -> no boot regressions).
- Rename = orphaned permission + history rows -> `code` immutable after create; `permissionCode` always server-derived.

## Requirements
Endpoints (prefix `/admin/datasources`, class-level `@RequirePermission(ADMIN_DATASOURCES)`):
| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/` | — | full entries (incl. transport; config holds no secrets) + `envStatus` per ds (`valueEnv`/baseUrl var set? bool) |
| GET | `/env-refs` | — | `{apiKeyEnvNames[], baseUrlEnvNames[]}` names only matching policy suffixes, never values |
| GET | `/:code` | — | one entry |
| POST | `/` | entry (no `permissionCode`) | created entry (201); 409 duplicate code |
| PUT | `/:code` | entry (body `code` must equal path or be absent) | updated entry |
| PATCH | `/:code/enabled` | `{enabled}` | updated entry |
| DELETE | `/:code` | — | `{code}` |
- Validation failures -> 422 `{code:'DATASOURCE_CONFIG_INVALID', details:[{path,message}]}`, paths relative to the entry (strip `/datasources/<i>`), file untouched.
- Reject `transport.kind === 'minio-pg'` on write (UI offers mock/http only).
- Enabling a mock ds in prod -> 422 via Phase 01 builder (same rule as boot).
- Audit actions: `datasource.create|update|toggle|delete`, targetType `datasource`, before/after = full entries.

## Architecture
```
AdminDatasourcesController ─> AdminDatasourcesService
   service.mutate(fn):  mutex.run(async () => {
      raw  = loader.readRawFromDisk()             // picks up any hand edits
      next = fn(structuredClone(raw))             // create/update/toggle/delete
      assertEnvNamePolicy(next, touchedCode)
      snap = loader.buildSnapshot(next)           // 422 on failure
      ents = registry.buildEntries(snap)
      await atomicWriteJson(loader.getConfigPath(), next)   // tmp+fsync+rename, keep .bak
      loader.applySnapshot(snap); adapterFactory.retire(registry.swap(ents))
      await permissionSync.sync().catch(log)      // warn only; boot re-syncs
   })
```
- Mutex: ~15-line promise-chain class (`config-write-mutex.ts`), no dependency.
- Atomic write: `writeFile(tmp in SAME dir)` -> `fh.sync()` -> `copyFile(path, path+'.bak')` -> `rename(tmp, path)`; tmp unlinked on error. Same dir required (rename across mounts = EXDEV).
- AuditInterceptor: add `params.code` fallback for `targetId` (1-line change; keeps global pattern).

## Related Code Files
- Create: `apps/api/src/admin-datasources/admin-datasources.module.ts`, `admin-datasources.controller.ts`, `admin-datasources.service.ts`, `config-write-mutex.ts`, `atomic-json-file-writer.ts`, `datasource-env-name-policy.ts`, `dto/set-datasource-enabled.dto.ts`
- Modify: `apps/api/src/app.module.ts` (import module), `datasources/datasources.module.ts` (export `AdapterFactory`, `PermissionSyncService`), `audit/audit.interceptor.ts` (code fallback), `packages/shared/src/permission-codes.ts` (`ADMIN_DATASOURCES: 'admin:datasources'`), `packages/shared/src/admin-types.ts` (`AdminDatasource`, `DatasourceEnvRefs` types), `apps/api/prisma/seed.ts` (add permission literal)
- Delete: none

## Implementation Steps
1. Shared: add permission code + response types; build shared.
2. Seed: add `{ code: 'admin:datasources', name: 'Manage datasources' }`.
3. Write mutex + atomic writer (+ unit tests, Phase 05).
4. Env policy: walk entry -> collect `auth.valueEnv` + `${VAR}` in `baseUrl`; enforce suffix regex; reject raw secret-looking headers? -> no (YAGNI), just UI warning.
5. Service: `list/get/create/update/toggle/remove/envRefs`, all mutations via `mutate()`. Map `DatasourceConfigInvalidError` -> 422; unknown code -> 404 (`DATASOURCE_NOT_FOUND`, same code as existing); duplicate -> 409.
6. Controller: mirror roles controller; set `req.auditBefore` from `service.get(code)` for PUT/PATCH/DELETE.
7. AuditInterceptor fallback `request.params?.code`.
8. Swagger tags `Admin — Datasources`.
9. `pnpm --filter api build && pnpm --filter api lint`.

## Todo List
- [x] shared permission + types
- [x] seed row
- [x] mutex, atomic writer, env-name policy
- [x] service (mutate pipeline) + error mapping
- [x] controller + module wiring
- [x] audit interceptor `code` fallback
- [x] compile + lint

## Implementation Notes (post-completion)
- 8 routes implemented under `/admin/datasources`: `GET /`, `GET /env-refs`,
  `GET /:code`, `POST /`, `PUT /:code`, `PATCH /:code/enabled`,
  `DELETE /:code`, `POST /reload` (the plan's "reload from disk" escape
  hatch, Resolved #4).
- New files: `apps/api/src/admin-datasources/{admin-datasources.module,
  admin-datasources.controller,admin-datasources.service,config-write-mutex,
  atomic-json-file-writer,datasource-env-name-policy,
  admin-datasource-candidate-entry.builder,admin-datasource-projection.util}.ts`
  + `dto/set-datasource-enabled.dto.ts`. Split the candidate-entry-building
  and admin-projection logic out of the service into their own util files
  (not in the original file list) purely to keep every file under ~200
  lines — same responsibilities as planned, no behavior change.
- Deviation: `assertDatasourceEnvNamePolicy`/minio-pg rejection throw
  `UnprocessableEntityException` directly (not `DatasourceConfigInvalidError`)
  because they run BEFORE the write lock/`buildSnapshot`, so there is no
  later catch site to translate a plain error into the HTTP response.
  `buildSnapshot`/cross-field failures still flow through
  `DatasourceConfigInvalidError` -> caught once in
  `AdminDatasourcesService.buildSnapshotOrThrowHttp` and relativized via
  `/datasources/<touchedIndex>` prefix stripping.
- Deviation: `ConfigWriteMutex` is a 15-line promise-chain class as
  planned, but `run()` recovers from a REJECTED previous call too (not just
  resolved) — otherwise one failed admin write would permanently stall the
  queue for every subsequent request (confirmed by the "serializes two
  concurrent creates" test).
- Verified via `apps/api/src/admin-datasources/admin-datasources.service.spec.ts`
  (12 tests, real `DatasourceConfigLoaderService`/`DatasourceRegistryService`/
  `AdapterFactory` against a disposable tmp-dir fixture, fake
  `PermissionSyncService`): create/update/toggle/delete all go live in the
  registry with NO restart (asserted via `registry.get()` after the call,
  not just the HTTP/service return value); invalid candidate, duplicate
  code, `minio-pg`, and the `*_API_KEY` naming-policy violation all leave
  `config.json` byte-for-byte and mtime unchanged; two concurrent `create()`
  calls never interleave (`ConfigWriteMutex`) — both entries land in the
  final file; `reloadFromDisk()` picks up a hand edit without ever writing.
  Plus 3 pure-unit spec files for the mutex/atomic-writer/env-policy (13
  tests) and one e2e spec (`apps/api/test/admin-datasources.e2e-spec.ts`,
  4 tests) proving RBAC 401/403/200 through the REAL `AppModule` + guard +
  interceptor pipeline.
- **Important finding, now fixed**: `AppConfigModule`'s `ConfigModule.forRoot()`
  resolves `APP_CONFIG_PATH` from the parsed root `.env` FILE, not
  `process.env` (confirmed empirically — pre-setting
  `process.env.APP_CONFIG_PATH` before compiling a `Test.createTestingModule({imports:[AppModule]})`
  is silently ignored; `ConfigService.get('APP_CONFIG_PATH')` returns the
  `.env` file's value regardless). An earlier draft of the e2e spec relied
  on that override to redirect writes to a tmp fixture and did NOT catch
  that it silently fell through to the REAL `config/config.json` — two
  `POST /admin/datasources` calls in that draft actually wrote
  `E2E_CONC_A`/`E2E_CONC_B` into the real repo file before the mistake was
  caught (via the next unit-test run's boot log showing 13 datasources
  instead of 11). Recovered immediately with `git checkout -- config/config.json`
  (confirmed byte-identical after) and the stray `config/config.json.bak`
  was deleted. The e2e spec was rewritten to be GET-only/RBAC-only against
  the real file (never mutates); all mutation/live-reload/rejection/
  concurrency coverage instead lives in `admin-datasources.service.spec.ts`,
  which wires the exact same production classes against a disposable
  tmp-dir fixture with zero risk to the real file. This constraint matches
  Phase 01's own documented finding in `datasource-engine.e2e-spec.ts`
  ("`ConfigModule.forRoot()` call is baked in at class-definition time, so
  it cannot be re-pointed per test").
- **Known gap to flag for Phase 03/05**: the global `HttpExceptionFilter`
  (`apps/api/src/common/filters/http-exception.filter.ts`, not owned by
  this phase) normalizes every error response to `{error:{code,message,
  requestId}}` and silently DROPS any `details` array from the exception's
  original payload — this is PRE-EXISTING behavior affecting every route
  that uses `ZodValidationPipe` too (grepped: no existing test anywhere
  asserts `.error.details`). This phase's spec text promises `422
  {code:'DATASOURCE_CONFIG_INVALID', details:[{path,message}]}` — the
  `details` array IS correctly computed server-side (see
  `admin-datasources.service.spec.ts`'s direct exception assertions and
  `datasource-env-name-policy.spec.ts`), but it will NOT reach the actual
  HTTP response body until the filter is changed to forward `details`.
  Flagging for Phase 03 (web form needs per-field errors) and/or Phase 05 —
  not fixed here since `http-exception.filter.ts` is shared infra outside
  this phase's file ownership and changing it affects every other
  endpoint's error contract.
- `pnpm --filter api typecheck`, `lint`, `test` (68/68) all green; `test:e2e`
  run scoped to `admin-datasources.e2e-spec.ts` (4/4) — did not run the
  full e2e suite (Phase 01's report already notes 18 pre-existing unrelated
  failures: MinIO/`citizen_photos` table missing, `CITIZEN_BASIC`
  `enabled:false`).

## Success Criteria
- Non-`admin:datasources` user -> 403 on every route (fail-closed guard).
- Invalid payload -> 422 with entry-relative paths, `config.json` bytes + mtime unchanged.
- Valid create -> file updated, `GET /datasources` shows it immediately (for granted users), `api:<code>` permission row exists and ADMIN role holds it, audit row written.

## Risk Assessment
- Container can't write mount (`:ro`/ownership) -> `EROFS/EACCES` -> map to 500 with clear message "config dir not writable — see deployment-guide"; Phase 04 fixes mount.
- Write OK but perm sync fails -> datasource live but not grantable; logged warning, resolved at next write/boot.
- Two replicas -> divergence (accepted limitation).

## Security Considerations
- ADMIN-only feature permission; global JWT + PermissionGuard unchanged.
- Never accepts/stores secret values; env-name policy blocks exfil of core secrets; `env-refs` returns names only.
- SSRF: admin can point baseUrl anywhere — inherent to feature, admin trusted; documented.
- Audit before/after on every mutation.

## Next Steps
- Phase 03 consumes endpoints; Phase 04 makes mount writable.

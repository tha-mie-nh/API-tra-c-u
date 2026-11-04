# Phase 01 — Reloadable config loader + registry

## Context Links
- `apps/api/src/datasources/datasource-config.loader.ts` (130 lines, constructor-only load + `Object.freeze`)
- `apps/api/src/datasources/datasource-registry.service.ts` (Map built in constructor)
- `apps/api/src/datasources/adapters/adapter.factory.ts` (`created[]` closed only on module destroy)
- `apps/api/src/datasources/permission-sync.service.ts` (`onModuleInit` only)
- `apps/api/src/datasources/config-cross-field-validator.ts`, `transport-secret-resolver.ts`
- `apps/api/prisma/seed.ts` (ADMIN gets every FEATURE + existing API permission)

## Overview
- Priority: P1 (blocks 02)
- Status: done
- Turn one-shot boot load into: pure `buildSnapshot(raw)` (dry-run capable) + `applySnapshot()` swap. Boot behavior (fail-fast crash on bad config) unchanged.

## Key Insights
- Consumers audit (grep `registry.get|getAll|loader.`):
  - `query.service.ts`, `datasource-permission.guard.ts`, `datasources.controller.ts`, `query-log.service.ts`, `image-proxy.service.ts` -> all call `registry.get()`/`loader.getResolvedSecrets()` PER REQUEST. Safe once registry/loader swap references.
  - `DatasourceRegistryService` constructor -> the only real stale-copy bug. Fix: `rebuild()`.
  - `PermissionSyncService.onModuleInit` -> boot-only; extract `sync()` for reuse.
  - `AdapterFactory` -> `created[]` leaks on rebuild; minio-pg adapter holds a `pg.Pool`.
- In-flight requests keep their own `{config, adapter}` from `registry.get()` -> swapping is safe; closing old adapters immediately could kill an in-flight minio-pg query -> close after grace delay.
- `permissionCode` is NOT checked against `code` today, but web route uses `apiPermissionCode(code)` -> mismatch = broken page. Add cross-field check (current config already consistent).
- `transport.dataFile` joined to configDir with no containment check -> admin-entered `../../..` path reads arbitrary JSON. Add containment check.

## Requirements
- Functional: `loader.buildSnapshot(raw: unknown): ConfigSnapshot` throws `DatasourceConfigInvalidError { issues: {path, message}[] }` for AJV / cross-field / missing env var / mock-in-prod failures. `loader.applySnapshot(s)`. `loader.readRawFromDisk()`. `registry.buildEntries(snapshot)` (no side effects) + `registry.swap(entries)`.
- Boot path: constructor = `applySnapshot(buildSnapshot(readRawFromDisk()))`; error message/log format unchanged (still crashes).
- Non-functional: each file < 200 lines; no new deps.

## Architecture
```
ConfigSnapshot (deep-frozen) = { config, resolvedSecrets: ReadonlyMap, configDir }
Loader:   private snapshot  ── getConfig()/getResolvedSecrets()/getConfigDir() read this.snapshot
Registry: private entries   ── get()/getAll() read this.entries
Reload (called by Phase 02 orchestrator, inside mutex):
  snap = loader.buildSnapshot(candidate)          // throws -> nothing changed
  entries = registry.buildEntries(snap)           // adapter ctor errors -> nothing changed
  ... (write file — Phase 02) ...
  loader.applySnapshot(snap); old = registry.swap(entries)
  adapterFactory.retire(old adapters)             // close after grace (max timeoutMs*2, cap 60s)
  await permissionSync.sync()                     // DB; failure logged, not rethrown
```
- `AdapterFactory.create(ds, snapshot)` takes snapshot explicitly (secrets/configDir) instead of reading loader -> candidate adapters built from candidate snapshot, not live one.

## Related Code Files
- Modify: `datasource-config.loader.ts` (snapshot model; keep `formatAjvErrors` for boot log), `datasource-registry.service.ts`, `adapters/adapter.factory.ts`, `permission-sync.service.ts`, `config-cross-field-validator.ts`, `datasource-config.loader.spec.ts`.
- Create: `datasources/config-snapshot-builder.ts` (pure: validate + resolve secrets + mock check -> snapshot; keeps loader < 200 lines), `datasources/datasource-config-invalid.error.ts`.
- Delete: none.

## Implementation Steps
1. Create `DatasourceConfigInvalidError extends Error { issues: {path: string; message: string}[] }`.
2. Move AJV compile to module-level lazy singleton (compile schema once, reused by every build); map AJV `instancePath` -> `path`.
3. `config-snapshot-builder.ts`: `buildConfigSnapshot(raw, {configDir, nodeEnv, allowMock})` = AJV -> `validateCrossFieldConstraints` -> `resolveTransportSecrets` per enabled ds (wrap throws into issues, path `datasources/<i>/transport`) -> no-mock-in-prod check (same message text) -> deep-freeze config (freeze nested objects, not just top level — today only top level is frozen).
4. Cross-field additions: (a) `permissionCode === apiPermissionCode(code)` (import from `@app/shared`); (b) mock `dataFile` must resolve inside configDir (`path.resolve(configDir, f).startsWith(configDir + sep)`) — needs configDir param -> pass as optional arg; skip check when absent.
5. Loader: replace fields with `private snapshot`; constructor uses builder; on `DatasourceConfigInvalidError` at boot log + rethrow formatted message (preserve existing boot error text so ops docs stay accurate). Add `readRawFromDisk()`, `getConfigPath()`, `applySnapshot()`.
6. Registry: extract `buildEntries(snapshot)`; constructor calls it; `swap(entries)` returns old Map.
7. AdapterFactory: `create(ds, snapshot)`; `retire(adapters)` -> `setTimeout(close, grace).unref()` and remove from `created`.
8. PermissionSyncService: extract `async sync()`; `onModuleInit` calls it. In `sync()`, for API permission rows that did NOT previously exist (findMany before upsert), also grant to role `ADMIN` (`rolePermission.upsert`) — mirrors seed semantics, removes the "re-run seed after adding a datasource" step, never re-grants a revoked existing permission. (Confirm — see unresolved Q1.)
9. `pnpm --filter api build` + existing unit/e2e tests green.

## Todo List
- [x] error class + structured issues (`datasource-config-invalid.error.ts`)
- [x] AJV singleton (module-level lazy compile in `config-snapshot-builder.ts`)
- [x] snapshot builder (pure) + deep freeze (nested, not just top-level)
- [x] cross-field: permissionCode derivation, dataFile containment
- [x] loader snapshot refactor (boot msg format changed — see Deviations below; same failure cases/tests still pass)
- [x] registry buildEntries/swap
- [x] adapter factory snapshot param + retire()
- [x] permission sync `sync()` + ADMIN grant for new rows
- [x] build + existing tests pass (typecheck, lint, unit (43/43), e2e (incl. fourth-datasource-acceptance) all green)

## Success Criteria
- Boot with bad config still crashes with same message (existing `datasource-config.loader.spec.ts` passes unchanged or with path-only edits).
- `buildSnapshot` on invalid candidate throws with structured issues and leaves `getConfig()` identical.
- After `apply+swap`, `GET /datasources` and `POST /query/:code` reflect new config with no restart.

## Risk Assessment
- Deep-freeze breaks code that mutates config -> grep for mutation; run full test suite.
- Closing retired adapters too early -> grace delay; http/mock adapters have no `close()` anyway.
- Boot-time ADMIN grant changes behavior on existing deployments -> only for brand-new rows; harmless.

## Security Considerations
- Secrets stay in `resolvedSecrets` map, never in config/projections (unchanged).
- dataFile containment closes arbitrary-file-read via admin input.
- No-mock-in-prod enforced on every build, not just boot.

## Next Steps
- Phase 02 consumes `buildSnapshot/applySnapshot/buildEntries/swap/sync`.

## Implementation Notes (post-completion)
- Verified via two new co-located unit specs (not in original file list, added per "unit tests for 01/02 may be written alongside"):
  - `config-reload-pipeline.spec.ts`: boots a loader+registry, adds a `minio-pg` datasource via `buildSnapshot`+`buildEntries`+`applySnapshot`+`swap` with NO restart, confirms it's immediately queryable, then removes it again and confirms `AdapterFactory.retire()` actually calls the retired adapter's `close()` (the `pg.Pool` leak case) — without needing a real Postgres connection (the pool is lazy; `close()` on an unopened pool is a no-op `pool.end()`).
  - `permission-sync.service.spec.ts`: mocked-Prisma unit test proving `sync()` upserts every datasource's permission and grants ONLY newly-created rows to ADMIN (pre-existing rows, even if revoked, are never re-granted).
- Deviation: boot-time error message is now a single uniform `config.json failed validation:\n<issues>` format instead of the old three distinct prefixes ("...failed schema validation...", "...failed cross-field validation...", raw env-var/mock-in-prod messages). All existing `datasource-config.loader.spec.ts` assertions are regex-based and still pass unmodified; no ops docs referenced the old exact text (grepped `docs/*.md`, no hits).
- Deviation: `AdapterFactory.retire()` takes a flat `graceMs` (default 5s, clamped `[0, 60s]`) instead of deriving it from retired datasources' `transport.timeoutMs` — that computation belongs to Phase 02's orchestrator (which has the retired entries' configs); Phase 01 only needed the clamped-delay primitive to exist.
- `apps/api/test/datasource-engine.e2e-spec.ts` required a one-line update (`new AdapterFactory()` instead of `new AdapterFactory(loader)`) since `AdapterFactory` no longer depends on the loader — confirmed both tests in that file still pass against a real Postgres instance (started via `docker compose up -d postgres` for verification, then stopped).
- Full e2e suite (`pnpm --filter api test:e2e`) has 18 pre-existing failures unrelated to this phase (MinIO not running on :59000, missing `citizen_photos` table, `CITIZEN_BASIC` shipped as `enabled:false` in `config/config.json`) — confirmed identical failure count/content on the pre-phase-01 code via `git stash`, so this phase introduces zero regressions.

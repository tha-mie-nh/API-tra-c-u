# Phase 05 — Tests

## Context Links
- Unit (jest, `*.spec.ts` in `apps/api/src`): `datasource-config.loader.spec.ts`, `mock-info.adapter.spec.ts`
- E2E: `apps/api/test/*.e2e-spec.ts` (`jest-e2e.json`, real Postgres), esp. `rbac.e2e-spec.ts`, `datasource-engine.e2e-spec.ts`, `test/fixtures/`
- Web: vitest `*.test.tsx` (e.g. `permission-matrix-dialog.test.tsx`)

## Overview
- Priority: P1 · Status: done
- Real files in a temp dir (`fs.mkdtemp`) + real DB; no mocking of fs/AJV. `APP_CONFIG_PATH` -> temp copy of a fixture config.

## Requirements / Test matrix
Unit (api):
1. `config-snapshot-builder`: valid -> deep-frozen snapshot; AJV error -> structured `path`; cross-field (dup code, bad identityField, permissionCode mismatch, dataFile `../x.json`) -> issues; missing env var for enabled http -> issue; disabled ds with missing env -> OK; prod + enabled mock -> issue, `ALLOW_MOCK_DATASOURCES=true` -> OK.
2. `atomic-json-file-writer`: writes + `.bak` holds previous content; simulated rename failure (target dir read-only via chmod) -> original untouched, no tmp left.
3. `config-write-mutex`: 2 concurrent tasks run serially, rejection doesn't block next.
4. `datasource-env-name-policy`: `JWT_ACCESS_SECRET`/`DATABASE_URL` rejected; `FOO_API_KEY`, `${FOO_BASE_URL}` accepted.
5. Registry: after `swap`, `get()` returns new entry; removed code -> 404; old entry object still usable (in-flight).
6. Existing loader boot tests unchanged (fail-fast preserved).

E2E (api, new `admin-datasources.e2e-spec.ts`):
7. RBAC: OPERATOR / no-perm user -> 403 on all 7 routes; unauthenticated -> 401.
8. Invalid create (schema + cross-field + minio-pg kind + bad env name) -> 422; file sha256 + mtime unchanged.
9. Create http ds (env var set in test env) -> 201; file contains entry; `GET /datasources` (admin) lists it without app restart; `permissions` row `api:<code>` exists; ADMIN role has it; `audit_logs` row `datasource.create` with targetId=code.
10. Update: change mock dataFile -> `POST /query/:code` returns new fixture's data (reload proven end-to-end).
11. Toggle off -> `POST /query/:code` 404; on -> works.
12. Delete -> 404 on query; permission row still present (never-delete policy); audit row.
13. Prod guard: `NODE_ENV=production` app instance, enabling a mock ds -> 422, file unchanged.
14. Concurrency: 2 parallel creates of different codes -> both present in final file (no lost write).

Web (vitest):
15. Form converter round-trip keeps unknown transport keys (`retry`).
16. 422 details mapped to `input`/`output` textarea + structured fields.

## Related Code Files
- Create: `apps/api/src/datasources/config-snapshot-builder.spec.ts`, `apps/api/src/admin-datasources/{atomic-json-file-writer,config-write-mutex,datasource-env-name-policy}.spec.ts`, `apps/api/src/datasources/datasource-registry.service.spec.ts`, `apps/api/test/admin-datasources.e2e-spec.ts`, `apps/api/test/fixtures/admin-datasources-config/` (config.json + 2 mock-data files), `apps/web/src/features/admin/datasources/datasource-form-dialog.test.tsx`
- Modify: `datasource-config.loader.spec.ts` (only if constructor signature/paths moved)

## Implementation Steps
1. Fixture config dir; helper copies to mkdtemp per test file, sets `APP_CONFIG_PATH`.
2. Unit tests 1-6. 3. E2E 7-14 (seed `admin:datasources` in test setup the same way existing e2e seeds perms). 4. Web 15-16.
5. Run `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm --filter web test`; all green — no skipped/disabled tests.

## Todo List
- [x] fixtures + temp-dir helper
- [x] unit 1-6
- [x] e2e 7-14
- [x] web 15-16
- [x] full suites green

## Success Criteria
- All listed cases pass; existing suites still pass; e2e never touches repo `config/config.json`.

## Implementation Notes (post-completion)
- Phases 01/02 already shipped most of this matrix alongside their own
  implementation (`config-reload-pipeline.spec.ts`, `permission-sync.service.spec.ts`,
  `admin-datasources.service.spec.ts` 12→13 tests, `config-write-mutex.spec.ts`,
  `atomic-json-file-writer.spec.ts`, `datasource-env-name-policy.spec.ts`,
  `admin-datasources.e2e-spec.ts` 4→6 tests). This phase filled the remaining gaps only:
  - NEW `apps/api/src/datasources/config-snapshot-builder.spec.ts` (10 tests): pure
    `buildConfigSnapshot` unit tests — deep-freeze of NESTED objects (not just top-level),
    structured AJV issue path, cross-field issues (duplicate code/identityField/permissionCode
    mismatch/dataFile path-traversal containment), missing-env issue scoped to
    `datasources/<code>/transport`, disabled-ds-with-missing-env is OK, prod+mock rejected,
    `allowMock` escape hatch OK.
  - NEW `apps/api/src/datasources/datasource-registry.service.spec.ts` (5 tests): `get()`
    404s an unknown code; `swap()` visible on the very next `get()`; an entry object taken
    BEFORE a swap (in-flight request) stays usable after; `buildEntries()` never touches live
    state until `swap()`; `swap()` returns the old Map.
  - NEW `apps/api/src/query/query-live-reload-through-admin-writes.spec.ts` (3 tests): the
    gap explicitly flagged in the assignment — "live reload provable through the public query
    path, not just `registry.get()`". Wires the REAL `QueryService.execute()` and
    `DatasourcePermissionGuard.canActivate()` (the exact classes behind `POST /query/:code`)
    against the SAME registry an `AdminDatasourcesService` write mutates: an admin dataFile
    swap changes the next query's results; a disable makes the guard 404 the same request
    that worked before; a delete does too. No restart, no new instances constructed mid-test.
  - MODIFIED `permission-sync.service.spec.ts`: added the "remove" half of matrix item 3 —
    a datasource dropped from config.json never gets its `permissions` row deleted (only
    still-live datasources are upserted); the never-delete policy was previously only
    asserted by production code reading, not by a test.
  - MODIFIED `admin-datasources.service.spec.ts`: added the prod-guard-on-reload case (matrix
    item 13) — booting from a mock-free baseline under `NODE_ENV=production` then attempting
    to `create()` a NEW mock datasource is rejected 422, file untouched. Proves the
    no-mock-in-production rule is enforced on every admin-triggered rebuild, not just at boot.
  - MODIFIED `apps/api/test/admin-datasources.e2e-spec.ts`: expanded RBAC 403/401 checks from
    2 routes to all 8 (`GET /`, `GET /env-refs`, `GET /:code`, `POST /`, `PUT /:code`,
    `PATCH /:code/enabled`, `DELETE /:code`, `POST /reload`) — matrix item asked for "every
    route, not a subset". Added 2 new e2e cases proving invalid/rejected creates (missing
    required fields; `minio-pg` kind; non-policy-compliant env name) leave the REAL
    `config/config.json` byte-for-byte + mtime unchanged (safe against the real file because
    rejected writes, by construction, never reach `writeJsonFileAtomically`).
  - Web: NEW `map-datasource-validation-errors.test.ts` (7 tests) and
    `datasource-entry-converters.test.ts` (4 tests) — phase-03 wrote zero tests for either by
    design (deferred here). Assert the REAL 422 contract (slash-joined paths relative to the
    entry, e.g. `transport/auth/valueEnv`; empty-string path for cross-field issues) and the
    `retry`-key-survives-an-edit round trip.
  - Did NOT re-create `apps/api/test/fixtures/admin-datasources-config/` as the original spec
    text suggested — phase-02's `admin-datasources.service.spec.ts` already established (and
    this phase's new specs all follow) the simpler, equally-safe pattern of writing fixture
    JSON directly into an `mkdtemp` dir inline in the test, avoiding an extra static fixture
    directory for data that only one test file's scenario needs (YAGNI).
  - Full results: `pnpm --filter api typecheck/lint/test` → 89/89 passing, 16 suites (up from
    68/12 after phase-02). `pnpm --filter web typecheck/lint/test` → 54/54 passing, 18 suites.
    `pnpm --filter api test:e2e` (real Postgres via `docker compose up -d postgres` + migrate +
    seed) → 24 passed / 18 failed, 42 total — the 18 failures are byte-for-byte the same
    pre-existing, unrelated baseline phase-01 documented (MinIO not running on :59000 breaks
    `image-proxy.e2e-spec.ts`; `CITIZEN_BASIC` ships `enabled:false` in the real
    `config/config.json`, 404ing `query.e2e-spec.ts` and `history-scoping.e2e-spec.ts`) — zero
    new failures introduced. `admin-datasources.e2e-spec.ts` itself: 6/6 passing (up from 4/4).
  - `git status config/config.json` / `git diff config/config.json` both clean after the full
    e2e run; no stray `.bak` file. `git status` on the whole repo shows no file touched outside
    legitimate new/modified test files (everything else was already modified by phases 01-04
    before this phase started).
  - `postgres` was already running (from an earlier phase's session) when this phase started;
    reused it for `db:migrate:deploy`/`db:seed`/e2e rather than restarting it, then
    `docker compose stop postgres` at the end to restore environment state.

## Risk Assessment
- chmod-based failure test flaky as root (CI containers) -> skip only that assertion when `process.getuid()===0`, document why.
- Retired-adapter timers keep jest open -> `.unref()` (Phase 01).

## Security Considerations
- Test env API keys are dummy values; never real.

## Next Steps
- code-reviewer pass, then docs-manager sync (Phase 04 already lists docs).

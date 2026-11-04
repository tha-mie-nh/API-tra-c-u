---
title: "Admin-UI datasource config with live reload (no restart)"
description: "ADMIN CRUD + enable/disable of config.json datasources from the web UI; validated atomic write + in-process hot reload"
status: done
priority: P2
effort: 21h
branch: main
tags: [datasources, config, admin, hot-reload, rbac, audit]
created: 2026-11-03
---

# Admin datasource config + live reload

Dynamic lookup UI already exists (`dynamic-search-form.tsx` renders from `input.fields`) — NOT replanned.
New work = (a) in-process reload of `config.json`, (b) ADMIN-only CRUD API that writes `config.json` atomically, (c) admin screen, (d) infra/docs.

## Locked decisions (from user — do not relitigate)
1. Storage stays `config/config.json`; API writes it (validated, atomic rename), then reloads in-process. Multi-replica propagation = documented known limitation.
2. Secrets stay in env vars; UI only references an EXISTING env var NAME (`auth.valueEnv`, `${VAR}` baseUrl). New env var => DevOps adds to `.env.prod` + one restart first.
3. Scope: full CRUD + enable/disable toggle.

## Key design choices (this plan)
- **Snapshot + swap**: loader builds an immutable snapshot `{config, secrets, configDir}`; registry builds a new `Map`; both swapped by single reference assignment. Every consumer already reads per-request via `registry.get()` -> no stale refs once registry stops being constructor-only.
- **Dry-run before write**: AJV + cross-field + secret resolution + no-mock-in-prod + adapter construction all run on the CANDIDATE in memory. File written only if all pass -> a write can never produce a config that crashes the next boot.
- **Permission**: new feature permission `admin:datasources` (same pattern as `admin:roles`), auto-granted to ADMIN via seed.
- **Frontend**: structured form for simple fields + JSON textareas for `input`/`output`; server is the only validator (no client AJV, no schema copy in web bundle). "Copy from existing" for create.
- **Concurrency**: in-process promise-chain mutex; base config re-read from disk inside lock.
- **Audit**: existing `@AuditAction` + global `AuditInterceptor` (before/after), not hand-written calls.

## Phases
| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 01 | [Reloadable config loader + registry](phase-01-reloadable-config-loader-and-registry.md) | 4h | done |
| 02 | [Admin datasources API (CRUD, atomic write, audit)](phase-02-admin-datasources-crud-api.md) | 5h | done |
| 03 | [Admin datasources screen (web)](phase-03-admin-datasources-web-screen.md) | 6h | done |
| 04 | [Infra (rw mount), deploy-check sync, docs](phase-04-infra-deploy-check-and-docs.md) | 2h | done |
| 05 | [Tests](phase-05-tests.md) | 4h | done |

Order: 01 -> 02 -> (03 ‖ 04) -> 05 (unit tests for 01/02 may be written alongside).

## Key dependencies / findings that differ from the brief
- `docker-compose.prod.yml` mounts `./config:/repo/config:ro` — read-only IS enforced. Must change to rw + host dir writable by container uid 1000 (`USER node`). Phase 04.
- `minio-pg` transport is NOT removed from code: still in `config.schema.json`, cross-field validator, secret resolver, `AdapterFactory`, `minio-pg-image.adapter.ts`, `image-proxy.service.ts`, shared types. No current config entry uses it. Plan: admin API rejects `minio-pg` on write; removal left out of scope (see unresolved Qs).
- No Prisma migration needed (no new model). Only a new feature permission row via idempotent seed.
- `AdapterFactory.created[]` grows forever if adapters are rebuilt -> must close + drop old adapters on reload (Phase 01).

## Resolved (planner's unresolved questions)
1. Auto-grant newly-created `api:*` permissions to ADMIN on BOTH boot and reload — yes, matches existing seed behavior.
2. `minio-pg` removal — out of scope, stays dead code, admin API rejects it on write only (per plan).
3. `*_API_KEY`/`*_BASE_URL` naming rule — admin-UI saves only, not boot-time hand-edited config (per plan).
4. Add a "reload from disk" endpoint (ADMIN-only, no payload) reusing the same validated-swap path — yes, cheap escape hatch for hand edits.
5. `GET /admin/datasources/env-refs` — yes, names only, never values.
6. Host `./config` ownership — docs: `chown -R 1000:1000 ./config` (matches container's `node` user) as the primary instruction, with a one-line fallback note for hosts that can't chown to a specific uid (make the dir group-writable, `chmod g+w`, add the deploy user to that group).

## Known limitations (document, don't solve)
- >1 api replica: write applies only to the instance that handled it; others need restart.
- First admin write re-serialises `config.json` (`JSON.stringify(…, 2)`) — one-time formatting diff.
- No optimistic locking between two admins editing the same entry (last write wins; mutex only prevents torn/interleaved writes).
- `defaults` block not editable from UI (YAGNI).

## Follow-up (2026-11-04, frontend-only, zero backend changes)
Phase 03's raw-JSON `input`/`output` textareas replaced with a structured,
row-based visual field builder (same request shape sent to the API as
before). See phase-03.md's "Follow-up" section for file list + verification.

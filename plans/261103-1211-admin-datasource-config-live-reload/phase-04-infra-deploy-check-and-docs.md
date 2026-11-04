# Phase 04 — Infra (writable config mount), deploy-check sync, docs

## Context Links
- `docker-compose.prod.yml` line ~149: `- ./config:/repo/config:ro`; header comment line ~12 says "bind-mounted read-only"
- `docker/api.Dockerfile` (`USER node`, uid 1000)
- `docs/deployment-guide.md` ("Biến môi trường", "4 API thật — cách bật", "Xử lý sự cố"), `docs/codebase-summary.md`, `docs/security-checklist.md`
- Mirror: `deploy-check/docker-compose.prod.yml`, `deploy-check/deployment-guide.md` (currently identical to docs/), `deploy-check/config/config.schema.json`

## Overview
- Priority: P2 · Status: done
- Make config dir writable by the api container; document the admin-UI workflow; mirror into `deploy-check/`.

## Implementation Notes (post-completion)
- `config/config.schema.json` was NOT touched by Phase 01/02 (verified: `git diff HEAD --
  config/config.schema.json` empty, no entry in `git status`) — the `permissionCode`
  cross-field rule added in Phase 01/02 is a code-level check
  (`config-cross-field-validator.ts`), not a schema change. Nothing to sync to
  `deploy-check/config/config.schema.json` — confirmed still byte-identical.
- `docker-compose.prod.yml` + `docker-compose.yml` (dev): `./config:/repo/config:ro` -> rw on
  both (dev compose also runs `api` under `profiles: ['full']` with the same `USER node`
  uid-1000 image, so it hits the same `EROFS` otherwise). Header/inline comments updated with
  the chown prerequisite and reload-vs-restart framing. `deploy-check/docker-compose.prod.yml`
  synced via `cp` + `diff -q` (byte-identical) — same method as `deployment-guide.md`.
- `docker compose -f docker-compose.prod.yml config` and `-f docker-compose.yml config` both
  parse clean (checked against the real `.env.prod` already in the repo root); rendered output
  confirms the `api` volume now has no `read_only: true`.
- `docs/deployment-guide.md`: new "## Quản lý nguồn dữ liệu trên giao diện quản trị" section
  (chown prereq + fallback, where/who, create-new-datasource env-var precondition +
  one-time-restart rule, permission auto-grant, reload escape hatch, `.bak` rollback, known
  limitations verbatim from plan.md). Updated "4 API thật" step 4 (ADMIN auto-granted on
  boot/reload now, no more "re-run seed" instruction for that). Added troubleshooting entry.
  Mirrored to `deploy-check/deployment-guide.md` via `cp` + `diff -q` clean.
- `docs/codebase-summary.md`: added `admin-datasources/` to the module tree + a paragraph on
  the reload flow (snapshot+swap, dry-run-before-write, 2 reload triggers).
- `docs/security-checklist.md`: 3 new rows (env-name policy / no-raw-secrets, mock `dataFile`
  containment re-verified for admin writes, rw-mount blast-radius tradeoff + chown doc link).
- `README.md`: updated the dev-compose paragraph (was describing `:ro`) + linked the new doc
  section.
- No `deploy-check.zip` found anywhere in the repo (checked root + `deploy-check/`) — nothing
  to re-zip; no zip script/convention found in git history either.
- Files NOT touched (out of this phase's scope, confirmed no scope creep): `apps/web/`,
  `apps/api/src/**` (except reading, never editing).

## Key Insights
- `:ro` is enforced at mount level today -> admin writes fail `EROFS` until changed.
- Atomic rename needs WRITE on the DIRECTORY (tmp + `.bak` created there), not just the file -> mount the dir (already), ensure host `./config` owned/writable by uid 1000.
- Mount stays a directory (not single-file) — single-file bind mounts break `rename` (EBUSY).
- `config.schema.json` changes? None required (minio-pg kept, see plan). If Phase 01 changes schema, copy to `deploy-check/config/`.

## Requirements
- Compose: `./config:/repo/config` (rw) in both root and `deploy-check/` copies; update header comment.
- Docs (VN, for leader/DevOps):
  - New section "Quản lý nguồn dữ liệu trên giao diện quản trị": where (menu Quản trị -> Nguồn dữ liệu), who (`admin:datasources`, ADMIN by default; re-run `seed` once after upgrade to get the new permission), what's live (create/edit/toggle/delete, no restart), what's NOT (new env var => edit `.env.prod` + `up -d api` first; naming must end `_API_KEY` / `_BASE_URL`).
  - Prereq step: `sudo chown -R 1000:1000 config` (or `chmod -R g+w` + group) on host.
  - Rollback: `config/config.json.bak` = previous version; restore + `restart api`.
  - Known limitations: single replica, formatting diff on first write, last-write-wins.
  - Keep "edit config.json + restart api" as alternative path (still valid).
  - Update "4 API thật" step 4: seed re-run no longer needed for ADMIN grant of NEW datasources (if Q1 accepted).
  - Troubleshooting entry: "Lưu nguồn dữ liệu báo lỗi không ghi được config" -> ownership/`:ro`.
- `docs/codebase-summary.md`: new module + reload flow. `docs/security-checklist.md`: env-name policy, dataFile containment.

## Related Code Files
- Modify: `docker-compose.prod.yml`, `deploy-check/docker-compose.prod.yml`, `docs/deployment-guide.md`, `deploy-check/deployment-guide.md`, `docs/codebase-summary.md`, `docs/security-checklist.md`, `README.md` (one line feature mention, if feature list exists)
- Create/Delete: none

## Implementation Steps
1. Edit compose files (both), comments included.
2. Write docs sections; copy `docs/deployment-guide.md` -> `deploy-check/deployment-guide.md` verbatim (`diff -q` must be clean).
3. If schema touched: `cp config/config.schema.json deploy-check/config/`.
4. Verify `docker compose -f docker-compose.prod.yml config` parses.

## Todo List
- [x] compose rw mount x2
- [x] deployment-guide new section + troubleshooting + rollback
- [x] mirror to deploy-check (diff clean)
- [x] codebase-summary + security-checklist
- [x] compose config check

## Success Criteria
- On a fresh deploy following the guide, admin save succeeds inside container; `.bak` appears on host.
- `diff -q docs/deployment-guide.md deploy-check/deployment-guide.md` silent.

## Risk Assessment
- Host ownership varies (WSL/root deploys) -> document both chown and verification command (`docker compose exec api touch /repo/config/.w && rm`).
- rw mount widens blast radius of an api RCE (can rewrite config) -> acceptable; config holds no secrets, mock blocked in prod.

## Security Considerations
- Never commit `.env.prod`/`deploy-check/.env.prod` (gitignored — verified).
- `.bak` contains no secrets (config never does).

## Next Steps
- Phase 05 e2e uses temp config dir, not repo `config/`.

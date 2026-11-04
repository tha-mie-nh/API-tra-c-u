# APP Tra cứu dữ liệu

Internal (~50 user) config-driven lookup portal. Backend proxies 3 upstream "citizen info" APIs
plus a MinIO/Postgres image store. Input/output fields of each upstream API are defined in an
independent `config/config.json` — adding a new API is a config change, not a code change. See
[`plans/260920-2200-app-tra-cuu-du-lieu/plan.md`](plans/260920-2200-app-tra-cuu-du-lieu/plan.md)
for the full design and [`plans/260920-2200-app-tra-cuu-du-lieu/reference-config-schema.md`](plans/260920-2200-app-tra-cuu-du-lieu/reference-config-schema.md)
for the config DSL contract.

## Stack

- Backend: NestJS 11 (Node/TypeScript), Prisma + Postgres 16, AJV (config validation) + Zod
  (per-request dynamic validation)
- Frontend: React 19 + TypeScript + Vite, Tailwind, shadcn/ui, TanStack Query/Table
- Object storage: MinIO (citizen photos)
- Monorepo: pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`)

## Repo layout

```
apps/
  api/                 # NestJS 11 backend
  web/                 # Vite + React 19 frontend
packages/
  shared/              # Types shared between api and web (@shared/* alias, @app/shared package)
config/
  config.json          # Datasource definitions (empty until Phase 04)
  config.schema.json   # JSON Schema validating config.json at api boot
docker/
  api.Dockerfile
  web.Dockerfile
docker-compose.yml     # postgres + minio (dev) + api + web (profile "full")
```

## Prerequisites

- Node.js >=22.19.0 (Active LTS "Jod") — required by `undici@8` (the HTTP datasource adapter's
  dependency); see `docker/api.Dockerfile` for details
- pnpm (`corepack enable`, or `npm install -g pnpm`; version pinned via `packageManager` in
  `package.json`)
- Docker + Docker Compose (for Postgres/MinIO)

## Getting started

```bash
cp .env.example .env        # fill in real values for anything beyond local dev defaults
pnpm install
docker compose up -d postgres minio   # starts Postgres 16 + MinIO with healthchecks
pnpm dev                    # runs apps/api (watch) + apps/web (vite) in parallel
```

- API: http://localhost:3000/api/v1/health
- Web: http://localhost:5173
- MinIO console: http://localhost:9001 (creds: `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

## Scripts (root)

| Script | Description |
|---|---|
| `pnpm dev` | Run api + web dev servers in parallel |
| `pnpm build` | Build `packages/shared`, `apps/api`, `apps/web` |
| `pnpm lint` | ESLint (shared flat config at repo root) across all workspaces |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |
| `pnpm test` | Run test suites across all workspaces |

## Environment variables

See [`.env.example`](.env.example) for the full, current list (app, Postgres, JWT/auth, MinIO,
image DB, and per-upstream-API base URL/key placeholders). Never commit `.env` — only
`.env.example` with obvious placeholder values is tracked in git.

## Docker (dev, full stack)

```bash
docker compose --profile full up -d --build
```

Builds and runs `api` (NestJS) and `web` (static build served by nginx) alongside Postgres/MinIO.
`config/` is bind-mounted read-write into the api container — datasources can be managed live from
the admin UI (`/quan-tri/nguon-du-lieu`, ADMIN-only), or `config.json` can still be hand-edited +
container restarted; neither path ever needs an image rebuild. See
[`docs/deployment-guide.md`](docs/deployment-guide.md) for the admin-UI workflow and the host
directory permission prerequisite (`chown -R 1000:1000 ./config`).

## Docker (production)

See [`docs/deployment-guide.md`](docs/deployment-guide.md) for the full runbook (env vars, first-time
setup incl. bootstrap admin, rollback, backup/restore, adding a datasource without a rebuild) and
[`docs/security-checklist.md`](docs/security-checklist.md) for how each spec security/deploy
requirement is implemented. Short version:

```bash
cp .env.example .env.prod && chmod 600 .env.prod   # edit real values first
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

`docker-compose.prod.yml` adds pinned image tags, healthchecks, a one-shot `migrate` service (runs
before `api` ever starts), and keeps Postgres/MinIO off any public interface. `web`'s nginx is the
single entry point (serves the SPA, reverse-proxies `/api/v1/*` to `api`) — plain HTTP, no TLS of
its own; see `docs/deployment-guide.md` for where TLS is expected to come from.

## Status

Phases 01–09 complete — see
[`plans/260920-2200-app-tra-cuu-du-lieu/plan.md`](plans/260920-2200-app-tra-cuu-du-lieu/plan.md) for
the full phased plan and status table.

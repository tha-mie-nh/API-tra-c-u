# Multi-stage production build for apps/api (NestJS 11).
# Phase 09: hardened for deploy — non-root runtime user, tini as PID 1,
# HEALTHCHECK wired to GET /api/v1/health, prod-only deps, minimal layers.
#
# Base is Debian slim (glibc), NOT alpine (musl): `argon2`'s native addon
# ships no prebuilt binary for THIS package version on any platform (verified
# — it goes straight to a node-gyp source compile even on glibc), and on
# alpine that compile needs Node headers from unofficial-builds.nodejs.org
# (musl builds aren't on the official CDN), which was empirically
# unreachable/timing out from inside this Docker build network specifically
# (verified reachable fine from the host directly — a Docker-network gap, not
# a real outage). On glibc, node-gyp instead fetches headers from the
# official, reliably-reachable nodejs.org CDN, so the compile itself (still
# needed — see the `deps`/`runtime` stages below) no longer depends on that
# unreliable host. Slightly larger base than alpine but still well within
# budget for a NestJS API image.
#
# Node 22, not 20: `undici@8.10.2` (apps/api's HTTP datasource adapter
# dependency — see reference-config-schema.md's transport.kind: "http")
# requires Node >=22.19.0 (its package.json `engines.node`) and crashes at
# require-time on Node 20 with "webidl.util.markAsUncloneable is not a
# function" — caught only by actually running the built image (local test
# runs never hit this: this machine's own Node is v22, masking it). Node 22
# is Active LTS ("Jod"), so this is a straightforward re-pin, not a
# regression — see root package.json's `engines.node` and .github/ci.yml,
# updated to match.
FROM node:22-bookworm-slim AS base
WORKDIR /repo
RUN corepack enable
# openssl: Prisma's engine needs libssl at runtime; ca-certificates: needed
# for HTTPS calls to the 3 upstream APIs once transport.kind flips to "http".
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: install full workspace (needed for pnpm workspace symlinks) ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# BuildKit cache mount: persists pnpm's content-addressable store across
# builds (survives even a failed RUN, unlike a regular layer), so a flaky
# registry connection only ever re-downloads what didn't finish last time
# instead of the whole tree from zero.
# python3/make/g++: argon2's node-gyp compile needs them (see `base` stage
# comment) — purged again in the same layer so this throwaway stage's
# toolchain never lingers (irrelevant for final image size anyway since
# `runtime` is built FROM base, not FROM deps/build, but keeps this stage
# minimal for local `docker build --target deps` debugging too).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && pnpm config set fetch-retries 5 && pnpm config set fetch-retry-maxtimeout 60000 \
  && pnpm install --frozen-lockfile \
  && apt-get purge -y --auto-remove python3 make g++ && rm -rf /var/lib/apt/lists/*

# ---- build: compile shared package then api ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @app/shared run build
# `prisma generate` is NOT triggered automatically here: @prisma/client's own
# postinstall is blocked by pnpm (only `@prisma/engines`/`prisma`/`argon2` are
# in pnpm-workspace.yaml's onlyBuiltDependencies — see that file's comment).
# Run it explicitly before `nest build`, matching local dev (`prisma:generate`
# script) — otherwise `nest build`'s type-check of `PrismaClient` model
# delegates (e.g. `prisma.user.findMany`) fails against the un-generated stub.
# DATABASE_URL only needs to be well-formed here (schema.prisma requires the
# env var to resolve) — generate does not connect to a real database.
# NOTE: `pnpm --filter api exec` runs with cwd already inside apps/api, so
# the --schema path is relative to THAT (not the repo root) — unlike the
# `migrate` one-shot service in docker-compose.prod.yml, which invokes prisma
# directly from /repo and therefore needs the apps/api/-prefixed path.
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=app" \
  pnpm --filter api exec prisma generate --schema=prisma/schema.prisma
RUN pnpm --filter api run build

# ---- runtime: prod deps only + compiled dist, non-root, tini PID 1 ----
FROM base AS runtime
ENV NODE_ENV=production
# tini: reaps zombie processes and forwards signals correctly to `node`
# (Node itself is not a proper PID 1) — required for `docker stop`/compose
# `SIGTERM` to shut the app down promptly instead of waiting for the 10s
# force-kill timeout.
RUN apt-get update && apt-get install -y --no-install-recommends tini curl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# See the `deps` stage comment above re: argon2 needing python3/make/g++ to
# compile its native addon — same requirement here since this is a separate
# --prod install, not something inherited from `deps`/`build`.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && pnpm config set fetch-retries 5 && pnpm config set fetch-retry-maxtimeout 60000 \
  && pnpm install --frozen-lockfile --prod --filter api... \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/* /root/.cache/node /root/.cache/node-gyp \
  && chown -R node:node /repo
# This --prod install is a SEPARATE node_modules tree from the `build` stage
# (never copied across stages), so @prisma/client here is still un-generated
# — regenerate against this stage's own environment. Schema + migrations are
# also required at runtime: the one-shot `migrate` service
# (docker-compose.prod.yml) reuses this same image and runs
# `prisma migrate deploy --schema=apps/api/prisma/schema.prisma` directly —
# without this COPY that command has no schema file to find.
COPY --chown=node:node apps/api/prisma apps/api/prisma
# See the `build` stage note above re: --filter exec's cwd already being
# apps/api.
RUN DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=app" \
  pnpm --filter api exec prisma generate --schema=prisma/schema.prisma \
  && chown -R node:node apps/api/node_modules/.prisma apps/api/node_modules/@prisma 2>/dev/null || true
COPY --from=build --chown=node:node /repo/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist

# The official node:*-bookworm-slim base bundles its own global `npm` CLI
# (and npm's own vendored copies of tar/pacote/sigstore etc — see
# /usr/local/lib/node_modules/npm) purely for `npm install` convenience.
# Nothing in this image ever runs npm/npx at runtime — build-time installs
# use pnpm (corepack), and CMD invokes `node` directly — so this is dead
# weight that Trivy still flags (confirmed: every "tar"/"pacote"/"sigstore"
# HIGH/CRITICAL finding in this image traces to that npm-bundled tree, not
# to anything in our own pnpm-lock.yaml).
# corepack itself is removed too, for the same reason (all pnpm-driven
# installs are done by this point). Also purge /root/.cache/node — the
# `deps`/`build`/prod-install RUN steps already clean this once, but the
# `prisma generate` RUN a few lines up invokes `pnpm exec` again, which
# makes corepack re-fetch+extract its full pnpm distribution (including
# ITS OWN vendored tar/glob/minimatch/brace-expansion/ip-address, at
# whatever old pinned versions ship inside that specific pnpm release) into
# /root/.cache/node/corepack — confirmed via `trivy image --format json`'s
# PkgPath, every remaining tar/glob/minimatch/brace-expansion/ip-address/
# pnpm HIGH/CRITICAL finding traced to that path, not to any real installed
# package. Nothing at runtime needs this cache (corepack itself is gone).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/lib/node_modules/corepack /usr/local/bin/corepack /root/.cache/node

# The official `node` image ships a pre-created, unprivileged `node` user
# (uid/gid 1000) on every variant (alpine and debian alike) — reuse it
# instead of adding a new one. Ownership is set inline in the layers above
# (COPY --chown / chown inside the install RUN) rather than a trailing
# `RUN chown -R /repo`, which would otherwise duplicate the entire
# node_modules tree into a new layer (~350MB) just to flip ownership bits.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/v1/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]

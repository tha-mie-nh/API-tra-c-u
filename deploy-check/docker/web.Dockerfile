# Multi-stage production build for apps/web (Vite + React 19).
# Phase 09: hardened for deploy — nginx runs as its unprivileged built-in
# user on a non-privileged port, HEALTHCHECK, SPA fallback + caching via
# docker/nginx.conf.
# Debian slim (glibc), not alpine — see docker/api.Dockerfile's `base` stage
# comment: `pnpm install` here resolves the FULL workspace lockfile (needed
# for pnpm's workspace symlinks even though only web's own code gets built),
# which includes apps/api's `argon2` — no prebuilt binary for this package
# version on any platform, so it always compiles via node-gyp. On glibc that
# compile fetches Node headers from the reliable official nodejs.org CDN
# (vs. musl's unofficial-builds host, which was unreachable from this Docker
# build network — see docker/api.Dockerfile for the full story).
# Node 22, not 20 — see docker/api.Dockerfile's `base` stage comment
# (undici@8.10.2 requires Node >=22.19.0; this stage installs the full
# workspace lockfile too, so it needs to match).
FROM node:22-bookworm-slim AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# See docker/api.Dockerfile for why this cache mount + retry config, and the
# python3/make/g++ (argon2's node-gyp compile), exist.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && pnpm config set fetch-retries 5 && pnpm config set fetch-retry-maxtimeout 60000 \
  && pnpm install --frozen-lockfile \
  && apt-get purge -y --auto-remove python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @app/shared run build
RUN pnpm --filter web run build

FROM nginx:1.27-alpine AS runtime
# Pull in Alpine's latest patched package builds (libssl3/libcrypto3/c-ares
# etc — Trivy-flagged HIGH/CRITICAL CVEs already fixed upstream in this same
# Alpine release branch, just newer than what's baked into the base image
# tag) without bumping the nginx version itself.
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

# Official nginx:alpine image ships an unprivileged `nginx` user (uid 101)
# plus the standard runtime dirs it needs write access to — re-point the pid
# file into a location that user can write, then drop root.
RUN sed -i 's/^pid .*/pid \/tmp\/nginx.pid;/' /etc/nginx/nginx.conf \
  && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /etc/nginx/conf.d

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

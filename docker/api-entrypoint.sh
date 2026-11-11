#!/bin/sh
# Container entrypoint (runs under tini as PID 1's child).
#
# Why this exists: the admin-UI datasource API atomically rewrites
# /repo/config/config.json (tmp file + .bak + rename inside that dir), but the
# directory is a host bind mount that is often owned by root (fresh clone,
# `sudo` checkout, a deploy dir created as root) while the app runs as the
# unprivileged `node` user (uid 1000) — every "Lưu" then fails with
# `EACCES: permission denied, open '/repo/config/.<n>.tmp'`.
#
# Fix: start as root ONLY long enough to chown that one directory, then drop
# to `node` before executing the real command. The app process itself never
# runs as root. When already non-root (e.g. `user: 1000:1000` in compose or a
# restricted orchestrator) the chown is skipped and the command just runs.
set -e

CONFIG_DIR="${APP_CONFIG_DIR:-/repo/config}"

if [ "$(id -u)" = "0" ]; then
  if [ -d "$CONFIG_DIR" ]; then
    # Best-effort: some mounts (NFS root_squash, read-only) refuse chown. The
    # app still starts; only admin-UI saves would fail, as before this fix.
    chown -R node:node "$CONFIG_DIR" 2>/dev/null \
      || echo "[entrypoint] warning: could not chown $CONFIG_DIR — admin-UI config saves may fail with EACCES" >&2
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"

#!/usr/bin/env bash
# Restores a gzip'd pg_dump (from backup-postgres.sh) into a SCRATCH database
# for verification — never overwrites the live DB directly.
#
# Usage: ./scripts/restore-postgres.sh <path-to-backup.sql.gz> [scratch_db_name]
#
# What it proves: the backup file is structurally valid and can be replayed
# end to end (phase-09 success criteria: "restore script reconstitutes it
# into a scratch database", not just "a backup file exists").
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
BACKUP_FILE="${1:?Usage: $0 <path-to-backup.sql.gz> [scratch_db_name]}"
SCRATCH_DB="${2:-restore_verify_$(date +%s)}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found (run from the repo root)." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

echo "[restore] creating scratch database '${SCRATCH_DB}'"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE \"${SCRATCH_DB}\";"

echo "[restore] replaying ${BACKUP_FILE} into '${SCRATCH_DB}'"
gunzip -c "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${SCRATCH_DB}" -v ON_ERROR_STOP=1

# Excludes pg_catalog/information_schema (system) — NOT restricted to
# 'public' alone: the app's real tables live in the 'app' schema (see
# apps/api/prisma/schema.prisma's `schemas = ["app"]`), while Prisma's own
# `_prisma_migrations` bookkeeping table lands in 'public'. Counting only
# 'public' would let this check pass on that one bookkeeping table alone
# even if every real app.* table failed to restore — caught by actually
# restoring a real dump and inspecting what came back, not by reasoning
# about it.
TABLE_COUNT=$(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${SCRATCH_DB}" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');" | tr -d '[:space:]')

echo "[restore] scratch DB now has ${TABLE_COUNT} table(s) across all non-system schemas."
if [[ "${TABLE_COUNT}" -lt 1 ]]; then
  echo "ERROR: restore produced 0 tables — treat the backup as broken." >&2
  exit 1
fi

echo "[restore] OK. Dropping scratch database '${SCRATCH_DB}' (verification only, not kept)."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE \"${SCRATCH_DB}\";"

echo "[restore] done — backup verified restorable."

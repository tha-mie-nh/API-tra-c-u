#!/usr/bin/env bash
# Nightly Postgres backup for the prod stack (docker-compose.prod.yml).
# Usage: ./scripts/backup-postgres.sh [retention_days]
# Intended to run via host cron, e.g.:
#   0 2 * * * cd /opt/app-tra-cuu-du-lieu && ./scripts/backup-postgres.sh 14 >> /var/log/app-backup.log 2>&1
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${1:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/postgres-${TIMESTAMP}.sql.gz"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found (run from the repo root)." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

echo "[backup] dumping database '${POSTGRES_DB}' -> ${OUT_FILE}"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --clean --if-exists \
  | gzip > "${OUT_FILE}"

if [[ ! -s "${OUT_FILE}" ]]; then
  echo "ERROR: backup file is empty, dump likely failed." >&2
  rm -f "${OUT_FILE}"
  exit 1
fi

echo "[backup] OK: $(du -h "${OUT_FILE}" | cut -f1) written."

echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name 'postgres-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

echo "[backup] done."

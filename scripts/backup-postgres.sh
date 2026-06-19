#!/bin/bash
# Hermes OS — PostgreSQL backup script
#
# Targets the Linux container / VPS environment. Do NOT run on Windows directly.
# Run on the VPS: ./scripts/backup-postgres.sh
# Or via npm: npm run db:backup (calls this script via bash)
#
# Produces timestamped, gzip-compressed SQL dumps.
# Automatically deletes backups older than BACKUP_RETENTION_DAYS (default: 30).

set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
BACKUP_FILE="${BACKUP_DIR}/hermes_${TIMESTAMP}.sql.gz"
CONTAINER="${POSTGRES_CONTAINER:-hermes-postgres-1}"
DB_NAME="${POSTGRES_DB:-hermes_db}"
DB_USER="${POSTGRES_USER:-hermes}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting backup → ${BACKUP_FILE}"

docker exec "${CONTAINER}" \
  pg_dump -U "${DB_USER}" --no-password "${DB_NAME}" \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: ${BACKUP_FILE} (${SIZE})"

# Prune old backups
DELETED=$(find "${BACKUP_DIR}" -name "hermes_*.sql.gz" -type f \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l)
if [[ "${DELETED}" -gt 0 ]]; then
  echo "[$(date -Iseconds)] Pruned ${DELETED} backup(s) older than ${BACKUP_RETENTION_DAYS} days"
fi

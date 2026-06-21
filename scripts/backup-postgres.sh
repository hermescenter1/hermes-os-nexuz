#!/bin/bash
# Hermes OS — PostgreSQL backup script (Phase 45)
#
# Targets the Linux container / VPS environment. Do NOT run on Windows directly.
# Run on the VPS: ./scripts/backup-postgres.sh
# Or via npm: npm run db:backup (calls this script via bash)
#
# Produces timestamped custom-format dumps (.dump) suitable for pg_restore.
# Custom format enables partial restore, parallel restore, and pg_restore --list
# verification without a full restore.
# Automatically deletes backups older than BACKUP_RETENTION_DAYS (default: 30).

set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
BACKUP_FILE="${BACKUP_DIR}/hermes_${TIMESTAMP}.dump"
CONTAINER="${POSTGRES_CONTAINER:-hermes-postgres-1}"
DB_NAME="${POSTGRES_DB:-hermes_db}"
DB_USER="${POSTGRES_USER:-hermes}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting backup → ${BACKUP_FILE}"

docker exec "${CONTAINER}" \
  pg_dump -U "${DB_USER}" --no-password \
    --format=custom \
    --no-acl \
    --no-owner \
    "${DB_NAME}" \
  > "${BACKUP_FILE}"

if [[ $? -ne 0 ]]; then
  echo "[$(date -Iseconds)] ERROR: pg_dump failed" >&2
  rm -f "${BACKUP_FILE}"
  exit 1
fi

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: ${BACKUP_FILE} (${SIZE})"

# Run verification immediately after backup
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "${SCRIPT_DIR}/verify-backup.sh" ]]; then
  echo "[$(date -Iseconds)] Running backup verification..."
  "${SCRIPT_DIR}/verify-backup.sh" "${BACKUP_FILE}" "${CONTAINER}" "${DB_USER}"
else
  echo "[$(date -Iseconds)] WARNING: verify-backup.sh not found — skipping verification"
fi

# Prune old backups (custom format .dump files)
DELETED=$(find "${BACKUP_DIR}" -name "hermes_*.dump" -type f \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l)
if [[ "${DELETED}" -gt 0 ]]; then
  echo "[$(date -Iseconds)] Pruned ${DELETED} backup(s) older than ${BACKUP_RETENTION_DAYS} days"
fi

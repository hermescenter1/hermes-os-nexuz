#!/bin/bash
# Hermes OS — PostgreSQL restore script (Phase 45)
#
# Targets the Linux container / VPS environment. Do NOT run on Windows directly.
# DESTRUCTIVE: drops and recreates the target database from a custom-format dump.
#
# Usage: ./scripts/restore-postgres.sh <backup-file>
# Example: ./scripts/restore-postgres.sh /backups/postgres/hermes_20260101_120000.dump

set -euo pipefail

BACKUP_FILE="${1:-}"
CONTAINER="${POSTGRES_CONTAINER:-hermes-postgres-1}"
DB_NAME="${POSTGRES_DB:-hermes_db}"
DB_USER="${POSTGRES_USER:-hermes}"

# ── Validate arguments ────────────────────────────────────────────────────────
if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Error: no backup file specified." >&2
  echo "Usage: $0 <path-to-backup.dump>" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

# Verify the dump is valid before destructive operations
echo "[$(date -Iseconds)] Verifying backup integrity..."
docker exec -i "${CONTAINER}" pg_restore --list - < "${BACKUP_FILE}" > /dev/null 2>&1 || {
  echo "Error: backup file is corrupt or not a valid custom-format dump." >&2
  exit 1
}
echo "[$(date -Iseconds)] Backup integrity OK."

# ── Safety countdown ──────────────────────────────────────────────────────────
echo ""
echo "WARNING: This will DROP and recreate the database '${DB_NAME}'."
echo "   Container : ${CONTAINER}"
echo "   Backup    : ${BACKUP_FILE}"
echo ""
echo "Press Ctrl+C within 10 seconds to cancel..."
sleep 10

# ── Stop the app to prevent writes during restore ─────────────────────────────
echo "[$(date -Iseconds)] Stopping hermes-web to prevent writes during restore..."
docker stop hermes-web 2>/dev/null || true

# ── Drop and recreate the database ───────────────────────────────────────────
echo "[$(date -Iseconds)] Terminating active connections to '${DB_NAME}'..."
docker exec "${CONTAINER}" psql -U "${DB_USER}" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"
docker exec "${CONTAINER}" psql -U "${DB_USER}" -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec "${CONTAINER}" psql -U "${DB_USER}" -c "CREATE DATABASE ${DB_NAME};"

# ── Restore via pg_restore (custom format) ────────────────────────────────────
echo "[$(date -Iseconds)] Restoring from ${BACKUP_FILE}..."
docker exec -i "${CONTAINER}" \
  pg_restore \
    --no-acl \
    --no-owner \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    - < "${BACKUP_FILE}"

echo "[$(date -Iseconds)] Restore complete."

# ── Restart the app ───────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Restarting hermes-web..."
docker start hermes-web 2>/dev/null || echo "Note: could not restart hermes-web — start it manually."

echo "[$(date -Iseconds)] Done. Run migrations if the backup predates the current schema:"
echo "  docker-compose -f docker-compose.prod.yml exec hermes-web npx prisma migrate deploy"

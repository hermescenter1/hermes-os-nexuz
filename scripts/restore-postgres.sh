#!/bin/bash
# Hermes OS — PostgreSQL restore from an ENCRYPTED backup (Phase 45 → Phase 98).
#
# Targets the Linux container / VPS environment. Do NOT run on Windows directly.
# DESTRUCTIVE: drops and recreates the target database from a decrypted dump.
#
# Usage: ./scripts/restore-postgres.sh <artifact.hbk>
# Example: ./scripts/restore-postgres.sh /backups/postgres/hermes_postgres_20260101_120000.hbk
#
# Phase 98 gate order — EVERY check passes BEFORE any destructive command, and the
# GCM tag is authenticated BEFORE the database is touched (decrypt to a private
# temp file first; unauthenticated bytes never stream into pg_restore):
#   1. validate the .hbk envelope + supported format version (hbk.mjs header);
#   2. obtain the key via HERMES_BACKUP_KEY_FILE;
#   3. authenticate + decrypt fully into a private temp plaintext (hbk.mjs decrypt);
#   4. verify the decrypted custom-format dump (pg_restore --list + essential tables);
#   5. require the exact target-specific confirmation (fail-closed);
#   6. only then drop/create/restore; then remove the temp plaintext.

set -euo pipefail
umask 077

BACKUP_FILE="${1:-}"                                   # the ENCRYPTED .hbk artifact
CONTAINER="${POSTGRES_CONTAINER:-hermes-postgres-1}"
WEB_CONTAINER="${HERMES_WEB_CONTAINER:-hermes-hermes-web-1}"
DB_NAME="${POSTGRES_DB:-hermes_db}"
DB_USER="${POSTGRES_USER:-hermes}"
KEY_FILE="${HERMES_BACKUP_KEY_FILE:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HBK="node ${SCRIPT_DIR}/dr/hbk.mjs"

# ── Validate arguments ────────────────────────────────────────────────────────
if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Error: no backup artifact specified." >&2
  echo "Usage: $0 <path-to-artifact.hbk>" >&2
  exit 1
fi
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: backup artifact not found: ${BACKUP_FILE}" >&2
  exit 1
fi
if [[ -z "${KEY_FILE}" || ! -f "${KEY_FILE}" ]]; then
  echo "Error: HERMES_BACKUP_KEY_FILE must point to the decryption key (fail-closed)." >&2
  exit 2
fi

# 1. Validate the envelope framing + supported version WITHOUT decrypting.
echo "[$(date -Iseconds)] Validating encrypted envelope..."
${HBK} header --in "${BACKUP_FILE}" >/dev/null || {
  echo "Error: not a valid Hermes .hbk artifact or unsupported format version (fail-closed)." >&2
  exit 1
}

# Private temp dir for the decrypted plaintext.
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hermes-restore.XXXXXX")"
PLAIN="${TMP_DIR}/restore.dump"
cleanup() { rm -f "${PLAIN}" 2>/dev/null || true; rm -rf "${TMP_DIR}" 2>/dev/null || true; }
trap cleanup EXIT

# 3. Authenticate + decrypt FULLY into the private temp file. hbk.mjs verifies the
#    GCM tag and the plaintext digest; a wrong key or any corruption fails here,
#    before the database is touched. Unauthenticated bytes never reach pg_restore.
echo "[$(date -Iseconds)] Authenticating + decrypting backup..."
${HBK} decrypt --in "${BACKUP_FILE}" --out "${PLAIN}" --key-file "${KEY_FILE}" --type postgres || {
  echo "Error: authenticated decryption failed — wrong key or corrupted artifact (fail-closed)." >&2
  exit 1
}
chmod 600 "${PLAIN}"

# 4. Verify the decrypted custom-format dump before any destructive operation.
echo "[$(date -Iseconds)] Verifying decrypted dump integrity..."
docker exec -i "${CONTAINER}" pg_restore --list < "${PLAIN}" > /dev/null 2>&1 || {
  echo "Error: decrypted dump is corrupt or not a valid custom-format dump." >&2
  exit 1
}
echo "[$(date -Iseconds)] Decrypted dump integrity OK."

# ── 5. Fail-closed target-specific confirmation (Phase 93, preserved) ─────────
# A destructive DROP DATABASE runs ONLY on an explicit, target-specific
# confirmation embedding the exact target DB, so a confirmation intended for one
# database cannot authorise a restore against another.
REQUIRED_CONFIRM="restore ${DB_NAME}"
echo ""
echo "WARNING: This will DROP and recreate the database '${DB_NAME}'."
echo "   Container : ${CONTAINER}"
echo "   Artifact  : ${BACKUP_FILE}"
echo ""
if [[ -n "${RESTORE_CONFIRM:-}" ]]; then
  if [[ "${RESTORE_CONFIRM}" != "${REQUIRED_CONFIRM}" ]]; then
    echo "Error: RESTORE_CONFIRM must equal '${REQUIRED_CONFIRM}'. Refusing (fail-closed)." >&2
    exit 3
  fi
  echo "[$(date -Iseconds)] Confirmed via RESTORE_CONFIRM."
elif [[ -t 0 ]]; then
  read -r -p "Type '${REQUIRED_CONFIRM}' to proceed: " REPLY_CONFIRM
  if [[ "${REPLY_CONFIRM}" != "${REQUIRED_CONFIRM}" ]]; then
    echo "Confirmation mismatch. Aborting (fail-closed)." >&2
    exit 3
  fi
else
  echo "Error: destructive restore requires confirmation. Set RESTORE_CONFIRM='${REQUIRED_CONFIRM}'" >&2
  echo "       or run interactively. Refusing (fail-closed)." >&2
  exit 3
fi

# ── Stop the app to prevent writes during restore ─────────────────────────────
echo "[$(date -Iseconds)] Stopping ${WEB_CONTAINER} to prevent writes during restore..."
docker stop "${WEB_CONTAINER}" 2>/dev/null || true

# ── 6. Drop and recreate the database, then restore ───────────────────────────
echo "[$(date -Iseconds)] Terminating active connections to '${DB_NAME}'..."
docker exec "${CONTAINER}" psql -U "${DB_USER}" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"
docker exec "${CONTAINER}" psql -U "${DB_USER}" -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec "${CONTAINER}" psql -U "${DB_USER}" -c "CREATE DATABASE ${DB_NAME};"

echo "[$(date -Iseconds)] Restoring from decrypted dump..."
docker exec -i "${CONTAINER}" \
  pg_restore \
    --no-acl \
    --no-owner \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    < "${PLAIN}"

# Remove the decrypted plaintext promptly.
rm -f "${PLAIN}"

echo "[$(date -Iseconds)] Restore complete."

# ── Restart the app ───────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Restarting ${WEB_CONTAINER}..."
docker start "${WEB_CONTAINER}" 2>/dev/null || echo "Note: could not restart ${WEB_CONTAINER} — start it manually."

echo "[$(date -Iseconds)] Done. Run migrations if the backup predates the current schema:"
echo "  docker compose -p hermes -f docker-compose.prod.yml exec hermes-web npx prisma migrate deploy"

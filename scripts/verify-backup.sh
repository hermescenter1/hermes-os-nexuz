#!/bin/bash
# Hermes OS — Backup integrity verification (Phase 45)
#
# Verifies a custom-format PostgreSQL dump without performing a full restore.
# Two-stage check:
#   1. pg_restore --list parses the TOC — validates every byte of the dump file
#   2. Checks that essential tables are present in the TOC
#
# Writes result to ${BACKUP_DIR}/.last-verification.json for /api/admin/system.
#
# Usage: ./scripts/verify-backup.sh <backup-file> [container] [db-user]
# Called automatically by backup-postgres.sh after each backup.

set -euo pipefail

BACKUP_FILE="${1:-}"
CONTAINER="${2:-${POSTGRES_CONTAINER:-hermes-postgres-1}}"
DB_USER="${3:-${POSTGRES_USER:-hermes}}"
BACKUP_DIR="$(dirname "${BACKUP_FILE}")"
VERIFICATION_STATE="${BACKUP_DIR}/.last-verification.json"

ESSENTIAL_TABLES=("Organization" "User" "IndustrialSite" "IndustrialAsset")

# ── Validate arguments ────────────────────────────────────────────────────────
if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Error: no backup file specified." >&2
  echo "Usage: $0 <path-to-backup.dump> [container] [db-user]" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

FILENAME="$(basename "${BACKUP_FILE}")"
TIMESTAMP="$(date -Iseconds)"

write_result() {
  local status="$1"
  local reason="${2:-}"
  cat > "${VERIFICATION_STATE}" << EOF
{"status":"${status}","timestamp":"${TIMESTAMP}","file":"${FILENAME}","reason":"${reason}"}
EOF
}

echo "[${TIMESTAMP}] Verifying ${FILENAME}..."

# Stage 1: pg_restore --list — parse the entire TOC (validates all bytes).
#
# PHASE 93.1 — listing a dump's TOC does NOT open a database connection, so no
# `-U <db-user>` is needed. The dump is streamed on STDIN via `docker exec -i`
# and pg_restore reads stdin when given NO file argument. The previous command
# passed a trailing `-` which pg_restore treats as an input FILENAME named "-"
# (→ `could not open input file "-"`), so verification always failed. Read from
# stdin only — no `-U`, no trailing `-`.
TOC_OUTPUT=$(docker exec -i "${CONTAINER}" \
  pg_restore --list < "${BACKUP_FILE}" 2>&1) || {
  echo "[$(date -Iseconds)] FAILED: pg_restore --list failed — dump is corrupt or invalid" >&2
  write_result "failed" "pg_restore --list failed"
  exit 1
}

# Stage 2: Check essential tables are present in the TOC.
#
# PHASE 93.2 — MUST use a here-string, NOT `echo "${TOC_OUTPUT}" | grep -q …`.
# Under `set -o pipefail`, `grep -q` closes the pipe on its first match, so on a
# large TOC the `echo` producer receives SIGPIPE (exit 141); pipefail then makes
# the whole pipeline non-zero and the check falsely reports the table missing
# (confirmed: PRODUCER_EXIT=141, GREP_EXIT=0). A here-string has no producer
# process, so there is no SIGPIPE and pipefail cannot corrupt the result. Do NOT
# reintroduce a producer→`grep -q` pipeline and do NOT mask it with `|| true`.
for TABLE in "${ESSENTIAL_TABLES[@]}"; do
  if ! grep -q "TABLE DATA.*${TABLE}" <<< "${TOC_OUTPUT}"; then
    echo "[$(date -Iseconds)] FAILED: essential table '${TABLE}' not found in dump TOC" >&2
    write_result "failed" "missing table: ${TABLE}"
    exit 1
  fi
done

echo "[$(date -Iseconds)] Verification PASSED: all ${#ESSENTIAL_TABLES[@]} essential tables present."
write_result "verified" ""
exit 0

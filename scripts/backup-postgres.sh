#!/bin/bash
# Hermes OS — PostgreSQL ENCRYPTED backup (Phase 45 → hardened in Phase 98).
#
# Targets the Linux container / VPS environment. Do NOT run on Windows directly.
# Run on the VPS: ./scripts/backup-postgres.sh   (or: npm run db:backup)
#
# Phase 98 changes the DURABLE artifact from a plaintext .dump to an AES-256-GCM
# authenticated-encryption envelope (.hbk). The sequence is fail-closed:
#   1. acquire a backup-process lock;
#   2. identify the canonical database/service;
#   3. create a PRIVATE temporary directory (umask 077);
#   4. pg_dump custom-format PLAINTEXT only inside that private temp dir;
#   5. verify the plaintext dump (verify-backup.sh — pg_restore --list + tables);
#   6. encrypt it with authenticated encryption (scripts/dr/hbk.mjs);
#   7. authenticate/verify the encrypted artifact (hbk.mjs verify);
#   8. compute the transport SHA-256 over the final encrypted artifact;
#   9. atomically publish: <name>.hbk.partial → <name>.hbk;
#  10. write a safe verification record (sidecar .meta.json, no secrets);
#  11. remove the temporary plaintext (removed, NOT cryptographically erased);
#  12. only then mark the backup complete + apply retention.
#
# The encryption key is provided as a FILE (owner-only), never on the command line
# or in the environment value. Nothing secret is echoed.
#
# Required: HERMES_BACKUP_KEY_FILE (path), HERMES_BACKUP_KEY_ID (non-secret id).

set -euo pipefail

# Phase 93 — restrictive umask so every created file/dir is owner-only (0600/0700),
# inherited by the verify-backup.sh child process.
umask 077

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
CONTAINER="${POSTGRES_CONTAINER:-hermes-postgres-1}"
DB_NAME="${POSTGRES_DB:-hermes_db}"
DB_USER="${POSTGRES_USER:-hermes}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_MIN_VERIFIED_COPIES="${BACKUP_MIN_VERIFIED_COPIES:-3}"
KEY_FILE="${HERMES_BACKUP_KEY_FILE:-}"
KEY_ID="${HERMES_BACKUP_KEY_ID:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HBK="node ${SCRIPT_DIR}/dr/hbk.mjs"

# ── Fail closed on missing key material ───────────────────────────────────────
if [[ -z "${KEY_FILE}" || -z "${KEY_ID}" ]]; then
  echo "Error: HERMES_BACKUP_KEY_FILE and HERMES_BACKUP_KEY_ID are required (fail-closed)." >&2
  exit 2
fi
if [[ ! -f "${KEY_FILE}" ]]; then
  echo "Error: backup key file not found: ${KEY_FILE} (fail-closed)." >&2
  exit 2
fi

# ── Fail closed if the verifier is unavailable (Phase 98: no silent skip) ──────
# BACKUP_VERIFIER_MISSING = FAIL. A backup can never be called verified when its
# verifier cannot run. Detect by EXISTENCE (`-f`), not the executable bit (`-x`),
# and invoke it later via `bash` so it never depends on the executable mode.
if [[ -f "${SCRIPT_DIR}/verify-backup.sh" ]]; then
  echo "[$(date -Iseconds)] Backup verifier present."
else
  echo "Error: verify-backup.sh not found — refusing to produce an unverifiable backup (fail-closed)." >&2
  exit 2
fi

mkdir -p "${BACKUP_DIR}"
# Enforce owner-only on the durable backup directory even if it pre-existed.
chmod 700 "${BACKUP_DIR}" 2>/dev/null || true

# ── Backup-process lock (no two concurrent backups corrupt each other) ────────
LOCK_DIR="${BACKUP_DIR}/.backup.lock"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  echo "Error: another backup is in progress (${LOCK_DIR} exists). Refusing." >&2
  exit 4
fi
# Private temp dir for the PLAINTEXT dump — never written to the durable dir.
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hermes-bk.XXXXXX")"
cleanup() {
  rm -f "${BACKUP_FILE:-}" 2>/dev/null || true
  rm -rf "${TMP_DIR}" 2>/dev/null || true
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

BACKUP_FILE="${TMP_DIR}/hermes_${TIMESTAMP}.dump"          # plaintext (temporary)
ENC_FINAL="${BACKUP_DIR}/hermes_postgres_${TIMESTAMP}.hbk" # encrypted (durable)
ENC_PARTIAL="${ENC_FINAL}.partial"
META_FINAL="${ENC_FINAL}.meta.json"

echo "[$(date -Iseconds)] Starting backup of '${DB_NAME}' → ${ENC_FINAL}"

# 4. pg_dump PLAINTEXT into the private temp dir.
docker exec "${CONTAINER}" \
  pg_dump -U "${DB_USER}" --no-password \
    --format=custom \
    --no-acl \
    --no-owner \
    "${DB_NAME}" \
  > "${BACKUP_FILE}"

# Enforce owner-only on the plaintext dump (defense in depth beyond umask).
chmod 600 "${BACKUP_FILE}"

# 5. Verify the PLAINTEXT dump before encrypting (fail-closed).
echo "[$(date -Iseconds)] Verifying plaintext dump..."
bash "${SCRIPT_DIR}/verify-backup.sh" "${BACKUP_FILE}" "${CONTAINER}" "${DB_USER}"

# 6. Encrypt with authenticated encryption → .partial.
echo "[$(date -Iseconds)] Encrypting (AES-256-GCM)..."
${HBK} encrypt \
  --in "${BACKUP_FILE}" \
  --out "${ENC_PARTIAL}" \
  --key-file "${KEY_FILE}" \
  --key-id "${KEY_ID}" \
  --type postgres \
  --created "$(date -Iseconds)"

# 7. Authenticate/verify the encrypted artifact (proves the tag + digest).
echo "[$(date -Iseconds)] Verifying encrypted artifact..."
${HBK} verify --in "${ENC_PARTIAL}" --key-file "${KEY_FILE}" --type postgres >/dev/null

# 8. Transport SHA-256 over the final encrypted artifact.
TRANSPORT_SHA256="$(${HBK} sha256 --in "${ENC_PARTIAL}" | sed -n 's/^TRANSPORT_SHA256=//p')"
if [[ -z "${TRANSPORT_SHA256}" ]]; then
  echo "Error: could not compute transport checksum (fail-closed)." >&2
  exit 5
fi

# 9. Atomically publish .partial → final.
chmod 600 "${ENC_PARTIAL}"
mv -f "${ENC_PARTIAL}" "${ENC_FINAL}"

# 10. Safe verification record sidecar (no secrets; key NAME/ID only).
NOW_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
cat > "${META_FINAL}" << EOF
{"artifactType":"postgres","verified":true,"partial":false,"encrypted":true,"keyId":"${KEY_ID}","transportSha256":"${TRANSPORT_SHA256}","createdAtMs":${NOW_MS},"file":"$(basename "${ENC_FINAL}")"}
EOF
chmod 600 "${META_FINAL}"

# 11. Remove the temporary plaintext (removed, not cryptographically erased on
#     SSD/CoW storage — see the DR runbook).
rm -f "${BACKUP_FILE}"

SIZE=$(du -sh "${ENC_FINAL}" | cut -f1)
echo "[$(date -Iseconds)] Backup complete + verified: ${ENC_FINAL} (${SIZE})"

# 12. Retention — verification-aware, never prunes the last verified copy.
BACKUP_DIR="${BACKUP_DIR}" \
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS}" \
BACKUP_MIN_VERIFIED_COPIES="${BACKUP_MIN_VERIFIED_COPIES}" \
  node "${SCRIPT_DIR}/dr/apply-retention.mjs"

echo "[$(date -Iseconds)] Done."

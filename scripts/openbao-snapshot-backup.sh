#!/usr/bin/env sh
# Hermes OS — OpenBao STAGING encrypted Raft snapshot backup (PHASE 94D0G).
#
# Runs on the OpenBao host over the loopback TLS endpoint. Takes a Raft snapshot,
# encrypts it with `age` (recipient public key ONLY — the private identity is
# NEVER required here), writes a mode-600 `.snap.age` plus a SHA-256 sidecar with
# an atomic rename, and prunes old encrypted backups. The raw snapshot lives only
# in a tmpfs path and is removed via a guaranteed trap. No root token is required
# or handled; nothing sensitive is printed. Fails closed if any prerequisite is
# missing.
#
# Required env:
#   BAO_TOKEN                         short-lived operator token (NEVER printed)
#   BAO_ADDR                          https loopback/private address
#   BAO_CACERT                        readable CA cert path
#   OPENBAO_BACKUP_AGE_RECIPIENT      age recipient string, OR
#   OPENBAO_BACKUP_AGE_RECIPIENT_FILE readable file of age recipients
# Optional env:
#   OPENBAO_BACKUP_DIR                default /backups/openbao
#   OPENBAO_BACKUP_RETENTION          days, default 14
#   OPENBAO_BACKUP_ALLOW_PRIVATE      "1" to allow an RFC1918 host (else loopback only)

set -eu
umask 077

fail() { printf '[openbao-snapshot-backup] FAILED %s\n' "$1" >&2; exit 1; }

# ── prerequisites ───────────────────────────────────────────────────────────
command -v bao >/dev/null 2>&1 || fail BAO_CLI_MISSING
command -v age >/dev/null 2>&1 || fail AGE_CLI_MISSING
if command -v sha256sum >/dev/null 2>&1; then :
elif command -v shasum >/dev/null 2>&1; then :
else fail SHA256_TOOL_MISSING
fi

[ -n "${BAO_TOKEN:-}" ]  || fail BAO_TOKEN_MISSING
[ -n "${BAO_ADDR:-}" ]   || fail BAO_ADDR_MISSING
[ -n "${BAO_CACERT:-}" ] || fail BAO_CACERT_MISSING
[ -r "${BAO_CACERT}" ]   || fail BAO_CACERT_UNREADABLE

# ── endpoint safety: HTTPS + loopback (private only if explicitly allowed) ───
case "$BAO_ADDR" in
  https://*) : ;;
  *) fail BAO_ADDR_NOT_HTTPS ;;
esac
rest="${BAO_ADDR#https://}"
hostport="${rest%%/*}"
case "$hostport" in
  \[*\]* ) host="${hostport%%]*}]" ;;
  *      ) host="${hostport%%:*}" ;;
esac
is_loopback() { case "$1" in 127.0.0.1|localhost|::1|"[::1]") return 0 ;; *) return 1 ;; esac; }
is_private()  { case "$1" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) return 0 ;; *) return 1 ;; esac; }
if is_loopback "$host"; then :
elif [ "${OPENBAO_BACKUP_ALLOW_PRIVATE:-0}" = "1" ] && is_private "$host"; then :
else fail BAO_ADDR_NOT_LOOPBACK_OR_PRIVATE
fi

# ── recipient (public key only) ─────────────────────────────────────────────
if [ -n "${OPENBAO_BACKUP_AGE_RECIPIENT:-}" ]; then
  REC_MODE=r
elif [ -n "${OPENBAO_BACKUP_AGE_RECIPIENT_FILE:-}" ]; then
  [ -r "${OPENBAO_BACKUP_AGE_RECIPIENT_FILE}" ] || fail AGE_RECIPIENT_FILE_UNREADABLE
  REC_MODE=R
else
  fail AGE_RECIPIENT_MISSING
fi

# ── tmpfs scratch for the plaintext snapshot + guaranteed cleanup ────────────
if [ -d /dev/shm ] && [ -w /dev/shm ]; then TMPROOT=/dev/shm; else TMPROOT="${TMPDIR:-/tmp}"; fi
TMPD="$(mktemp -d "${TMPROOT}/openbao-snap.XXXXXX")" || fail TMP_CREATE_FAILED
RAW="${TMPD}/raft.snap"
# Best-effort removal of the plaintext snapshot — NOT cryptographic/secure erasure.
cleanup() { rm -rf "$TMPD" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# ── take the snapshot (uses BAO_ADDR/BAO_CACERT/BAO_TOKEN from env) ──────────
bao operator raft snapshot save "$RAW" >/dev/null 2>&1 || fail SNAPSHOT_SAVE_FAILED
[ -s "$RAW" ] || fail SNAPSHOT_EMPTY

# ── encrypt BEFORE it reaches the backup directory ──────────────────────────
BACKUP_DIR="${OPENBAO_BACKUP_DIR:-/backups/openbao}"
mkdir -p "$BACKUP_DIR" || fail BACKUP_DIR_UNWRITABLE
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="hermes-openbao-staging_${TS}.snap.age"
FINAL="${BACKUP_DIR}/${BASE}"
ENC_TMP="${FINAL}.tmp.$$"

if [ "$REC_MODE" = r ]; then
  age -r "$OPENBAO_BACKUP_AGE_RECIPIENT" -o "$ENC_TMP" "$RAW" >/dev/null 2>&1 || fail ENCRYPT_FAILED
else
  age -R "$OPENBAO_BACKUP_AGE_RECIPIENT_FILE" -o "$ENC_TMP" "$RAW" >/dev/null 2>&1 || fail ENCRYPT_FAILED
fi
chmod 600 "$ENC_TMP" 2>/dev/null || true
[ -s "$ENC_TMP" ] || fail ENCRYPT_EMPTY

# ── checksum over the ENCRYPTED artifact + atomic finalize ──────────────────
if command -v sha256sum >/dev/null 2>&1; then
  SUM_LINE="$(sha256sum "$ENC_TMP")"
else
  SUM_LINE="$(shasum -a 256 "$ENC_TMP")"
fi
SUM="${SUM_LINE%% *}"
[ -n "$SUM" ] || fail CHECKSUM_FAILED

mv -f "$ENC_TMP" "$FINAL"
SUM_TMP="${FINAL}.sha256.tmp.$$"
printf '%s  %s\n' "$SUM" "$BASE" > "$SUM_TMP"
chmod 600 "$SUM_TMP" 2>/dev/null || true
mv -f "$SUM_TMP" "${FINAL}.sha256"

# ── retention: only after a successful backup; never delete the newest ──────
RETENTION="${OPENBAO_BACKUP_RETENTION:-14}"
find "$BACKUP_DIR" -type f -name 'hermes-openbao-staging_*.snap.age' -mtime "+${RETENTION}" 2>/dev/null | while IFS= read -r old; do
  [ "$old" = "$FINAL" ] && continue
  rm -f "$old" "${old}.sha256" 2>/dev/null || true
done

# Non-sensitive completion line — no token, recipient or snapshot content.
printf '[openbao-snapshot-backup] OK wrote %s (+ .sha256)\n' "$BASE"

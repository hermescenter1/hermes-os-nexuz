#!/usr/bin/env sh
# Hermes OS — OpenBao STAGING encrypted snapshot RESTORE-TEST (PHASE 94D0G).
#
# This is a restore-TEST against a SEPARATE throwaway OpenBao target — NOT a
# disaster overwrite of the running staging service. It verifies the encrypted
# artifact's checksum, decrypts it (age private identity, which must live only on
# this isolated restore host and OUTSIDE the repo) into a tmpfs path, restores it
# into a separately initialized throwaway target WITHOUT -force (seal-key
# consistency is preserved), and only reports success if the target is healthy
# and unsealed afterwards. It never stops or overwrites the main staging service,
# never deletes the staging volume, and prints no token, unseal material or
# decrypted content.
#
# Usage:
#   OPENBAO_RESTORE_CONFIRM=RESTORE-TO-THROWAWAY \
#   OPENBAO_RESTORE_TARGET_IS_THROWAWAY=1 \
#   OPENBAO_RESTORE_ADDR=https://127.0.0.1:8299 \
#   OPENBAO_RESTORE_CACERT=/path/ca.crt \
#   OPENBAO_RESTORE_TOKEN=<throwaway operator token> \
#   OPENBAO_RESTORE_AGE_IDENTITY_FILE=/secure/outside/repo/age.key \
#   scripts/openbao-snapshot-restore.sh /backups/openbao/<file>.snap.age

set -eu
umask 077

fail() { printf '[openbao-snapshot-restore] FAILED %s\n' "$1" >&2; exit 1; }

# ── explicit confirmations / throwaway markers ──────────────────────────────
[ "${OPENBAO_RESTORE_CONFIRM:-}" = "RESTORE-TO-THROWAWAY" ] || fail CONFIRM_REQUIRED
[ "${OPENBAO_RESTORE_TARGET_IS_THROWAWAY:-0}" = "1" ]       || fail THROWAWAY_MARKER_REQUIRED

# ── prerequisites ───────────────────────────────────────────────────────────
command -v bao >/dev/null 2>&1 || fail BAO_CLI_MISSING
command -v age >/dev/null 2>&1 || fail AGE_CLI_MISSING
if command -v sha256sum >/dev/null 2>&1; then :
elif command -v shasum >/dev/null 2>&1; then :
else fail SHA256_TOOL_MISSING
fi

SNAP="${1:-}"
[ -n "$SNAP" ] || fail SNAPSHOT_ARG_REQUIRED
[ -r "$SNAP" ] || fail SNAPSHOT_UNREADABLE
SUMFILE="${SNAP}.sha256"
[ -r "$SUMFILE" ] || fail CHECKSUM_SIDECAR_MISSING

# ── throwaway target: HTTPS, trusted CA, token, and NOT the main staging ─────
[ -n "${OPENBAO_RESTORE_ADDR:-}" ]   || fail RESTORE_ADDR_MISSING
case "$OPENBAO_RESTORE_ADDR" in https://*) : ;; *) fail RESTORE_ADDR_NOT_HTTPS ;; esac
[ "${OPENBAO_RESTORE_ADDR}" = "${BAO_ADDR:-}" ] && fail RESTORE_TARGET_IS_MAIN_STAGING
[ -n "${OPENBAO_RESTORE_CACERT:-}" ] || fail RESTORE_CACERT_MISSING
[ -r "${OPENBAO_RESTORE_CACERT}" ]   || fail RESTORE_CACERT_UNREADABLE
[ -n "${OPENBAO_RESTORE_TOKEN:-}" ]  || fail RESTORE_TOKEN_MISSING   # never printed

# ── age private identity: required, and OUTSIDE the repository ───────────────
[ -n "${OPENBAO_RESTORE_AGE_IDENTITY_FILE:-}" ] || fail AGE_IDENTITY_MISSING
[ -r "${OPENBAO_RESTORE_AGE_IDENTITY_FILE}" ]   || fail AGE_IDENTITY_UNREADABLE
repo_root="$(cd "$(dirname "$0")/.." && pwd -P)"
id_dir="$(cd "$(dirname "${OPENBAO_RESTORE_AGE_IDENTITY_FILE}")" 2>/dev/null && pwd -P)" || fail AGE_IDENTITY_UNREADABLE
case "${id_dir}/" in "${repo_root}"/*) fail AGE_IDENTITY_INSIDE_REPO ;; esac

# ── verify checksum BEFORE decrypting ───────────────────────────────────────
EXPECT="$(cut -d' ' -f1 "$SUMFILE")"
[ -n "$EXPECT" ] || fail CHECKSUM_SIDECAR_EMPTY
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_LINE="$(sha256sum "$SNAP")"
else
  ACTUAL_LINE="$(shasum -a 256 "$SNAP")"
fi
ACTUAL="${ACTUAL_LINE%% *}"
[ "$EXPECT" = "$ACTUAL" ] || fail CHECKSUM_MISMATCH

# ── tmpfs decrypt + guaranteed cleanup ──────────────────────────────────────
if [ -d /dev/shm ] && [ -w /dev/shm ]; then TMPROOT=/dev/shm; else TMPROOT="${TMPDIR:-/tmp}"; fi
TMPD="$(mktemp -d "${TMPROOT}/openbao-restore.XXXXXX")" || fail TMP_CREATE_FAILED
PLAIN="${TMPD}/raft.snap"
cleanup() { rm -rf "$TMPD" 2>/dev/null || true; }   # best-effort, not secure erasure
trap cleanup EXIT INT TERM

age -d -i "${OPENBAO_RESTORE_AGE_IDENTITY_FILE}" -o "$PLAIN" "$SNAP" >/dev/null 2>&1 || fail DECRYPT_FAILED
[ -s "$PLAIN" ] || fail DECRYPT_EMPTY

# ── restore into the throwaway target (NO -force; seal-key consistency kept) ─
BAO_ADDR="$OPENBAO_RESTORE_ADDR" BAO_CACERT="$OPENBAO_RESTORE_CACERT" BAO_TOKEN="$OPENBAO_RESTORE_TOKEN" \
  bao operator raft snapshot restore "$PLAIN" >/dev/null 2>&1 || fail RESTORE_FAILED

# ── post-restore gate: target must be healthy AND unsealed ──────────────────
BAO_ADDR="$OPENBAO_RESTORE_ADDR" BAO_CACERT="$OPENBAO_RESTORE_CACERT" \
  bao status >/dev/null 2>&1 || fail POST_RESTORE_SEALED_OR_UNHEALTHY

printf '[openbao-snapshot-restore] OK restore-test passed on throwaway target\n'

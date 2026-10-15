#!/usr/bin/env bash
#
# DA-1 — judge whether the newest encrypted backup is fresh enough, and whether
# its verification record is internally consistent.
#
# WHY A SCRIPT AND NOT INLINE YAML. The judgement has a dozen branches and the
# cases that matter — a future mtime, a record naming a different file, a
# createdAtMs that disagrees with the file, a limit set to zero — cannot be
# exercised by reading the workflow's text. Here they can be driven against
# real files.
#
# PRIVILEGE STAYS WHERE IT IS. The artifact and its record are root-owned
# (`umask 077`, `chmod 600`). The caller does the privileged reads through its
# existing `sudo -n` rules and passes the VALUES in; this script reads only the
# record it is handed and never needs privilege of its own.
#
# WHAT "AGE" MEANS HERE, and what it does not.
#
#   `createdAtMs` is written into the record by `scripts/backup-postgres.sh`
#   when it finishes. `mtime` is filesystem metadata. NEITHER is a
#   cryptographic proof of when the artifact was created: the record is plain
#   JSON written by a script, and anyone who can write the file can `touch` it.
#   They are claims by a trusted producer, not attestations.
#
#   So both are used, and the STRICTER answer wins: an artifact is fresh only
#   if the record says so AND the file says so. Using either alone would let
#   the other be the way past. They are also cross-checked: a record whose
#   createdAtMs is far from the file's mtime describes a different file, or a
#   file that was touched, and that is a refusal rather than a judgement call.
#
# Usage:
#   check-backup-freshness.sh <artifact-name> <mtime-epoch> <actual-sha256> \
#                             <meta-file> [max-age-hours] [now-epoch]
#
# Prints FRESHNESS key=value lines; exits 0 only on result=FRESH.
set -uo pipefail

ARTIFACT="${1:-}"
MTIME="${2:-}"
ACTUAL_SHA="${3:-}"
META_FILE="${4:-}"
MAX_AGE_HOURS="${5:-30}"
NOW="${6:-$(date +%s)}"

# A record and a file may disagree by this much and still plausibly describe
# the same backup: the script writes the record moments after sealing the
# artifact. Beyond it, something has been copied, touched or hand-edited.
CONSISTENCY_TOLERANCE_SECONDS="${CONSISTENCY_TOLERANCE_SECONDS:-3600}"

emit() { printf 'FRESHNESS %s\n' "$1"; }
refuse() {
  emit "result=$1"
  [ -n "${2:-}" ] && echo "Refusing: $2" >&2
  exit 1
}

is_uint() { case "${1:-}" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# ── The limit itself ─────────────────────────────────────────────────────────
# Checked before anything else: a limit of 0, a negative one or a non-number
# must never be read as "no limit".
if ! is_uint "${MAX_AGE_HOURS}"; then
  refuse "BAD_LIMIT" "the maximum age must be a whole number of hours, got '${MAX_AGE_HOURS}'"
fi
if [ "${MAX_AGE_HOURS}" -lt 1 ] || [ "${MAX_AGE_HOURS}" -gt 72 ]; then
  refuse "BAD_LIMIT" "a maximum age of ${MAX_AGE_HOURS}h is outside 1..72; a wider window is not a freshness bound"
fi
emit "max_age_hours=${MAX_AGE_HOURS}"

[ -n "${ARTIFACT}" ] || refuse "NO_ARTIFACT" "no artifact name was given"
emit "artifact=${ARTIFACT}"

if ! is_uint "${MTIME}"; then
  refuse "BAD_MTIME" "the artifact's modification time is not a whole number of seconds: '${MTIME}'"
fi

# ── The record ───────────────────────────────────────────────────────────────
[ -n "${META_FILE}" ] && [ -f "${META_FILE}" ] || refuse "NO_META" "no verification record at '${META_FILE}'"
META="$(cat -- "${META_FILE}")" || refuse "NO_META" "cannot read the verification record"

field() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" <<<"${META}"; }
numfield() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" <<<"${META}"; }
flag() { grep -q "\"$1\"[[:space:]]*:[[:space:]]*true" <<<"${META}"; }

META_FILE_NAME="$(field file)"
[ -n "${META_FILE_NAME}" ] || refuse "META_INCOMPLETE" "the record names no file"
if [ "${META_FILE_NAME}" != "${ARTIFACT}" ]; then
  refuse "META_MISMATCH" "the record names '${META_FILE_NAME}', not '${ARTIFACT}'"
fi

flag verified  || refuse "NOT_VERIFIED" "the record does not say verified:true"
flag encrypted || refuse "NOT_ENCRYPTED" "the record does not say encrypted:true"
if ! grep -q '"partial"[[:space:]]*:[[:space:]]*false' <<<"${META}"; then
  refuse "PARTIAL" "the record does not say partial:false"
fi

RECORDED_SHA="$(field transportSha256)"
[ -n "${RECORDED_SHA}" ] || refuse "META_INCOMPLETE" "the record carries no transportSha256"
[ -n "${ACTUAL_SHA}" ] || refuse "NO_HASH" "no computed hash was given to compare"
if [ "${RECORDED_SHA}" != "${ACTUAL_SHA}" ]; then
  refuse "HASH_MISMATCH" "the artifact's hash does not match the record"
fi

CREATED_MS="$(numfield createdAtMs)"
is_uint "${CREATED_MS}" || refuse "META_INCOMPLETE" "the record carries no usable createdAtMs"
CREATED="$(( CREATED_MS / 1000 ))"
emit "created_epoch=${CREATED}"
emit "mtime_epoch=${MTIME}"

# ── Time ─────────────────────────────────────────────────────────────────────
# A future timestamp is not freshness. It is a clock problem or a forged value,
# and either way it must not pass as "just taken".
if [ "${CREATED}" -gt "${NOW}" ] || [ "${MTIME}" -gt "${NOW}" ]; then
  refuse "FUTURE_DATED" "the artifact or its record is dated in the future"
fi

DRIFT=$(( CREATED > MTIME ? CREATED - MTIME : MTIME - CREATED ))
emit "drift_seconds=${DRIFT}"
if [ "${DRIFT}" -gt "${CONSISTENCY_TOLERANCE_SECONDS}" ]; then
  refuse "TIME_INCONSISTENT" \
    "the record's createdAtMs and the file's mtime are ${DRIFT}s apart; they do not describe the same backup"
fi

MAX_AGE_SECONDS=$(( MAX_AGE_HOURS * 3600 ))
AGE_BY_RECORD=$(( NOW - CREATED ))
AGE_BY_FILE=$(( NOW - MTIME ))
# The STRICTER of the two, so neither can be the way past the other.
AGE=$(( AGE_BY_RECORD > AGE_BY_FILE ? AGE_BY_RECORD : AGE_BY_FILE ))
emit "age_hours=$(( AGE / 3600 ))"

if [ "${AGE}" -ge "${MAX_AGE_SECONDS}" ]; then
  refuse "STALE" \
    "the newest backup is $(( AGE / 3600 ))h old, at or over the ${MAX_AGE_HOURS}h limit (system RPO is 24h). Take a fresh verified backup through scripts/backup-postgres.sh before releasing."
fi

emit "result=FRESH"
echo "Backup freshness: ${ARTIFACT} is $(( AGE / 3600 ))h old (limit ${MAX_AGE_HOURS}h), record and file agree within ${DRIFT}s."

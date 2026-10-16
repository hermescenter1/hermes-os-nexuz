#!/usr/bin/env bash
#
# DA-1 — DECIDE, on the runner, out of the checkout of the target SHA.
#
# Reads the framed measurement block that scripts/deploy/collect-backup-
# evidence.sh produced on the production host, and turns it into one verdict.
# It runs on the RUNNER, not on the host, for one reason: the host's working
# tree is still the PREVIOUSLY deployed commit at this point in the release.
# Judging a release with the previous release's rules — or with a helper that
# may not exist there at all — is how a gate silently stops being the gate the
# change intended. The helper it calls comes from the same checkout as this
# file.
#
# It has no privilege, touches no host and writes no file.
#
# FRAMING IS LOAD-BEARING. Without BOTH markers the evidence is treated as
# absent, so a truncated transfer, a killed collector or a dropped SSH session
# cannot be mistaken for a clean measurement. Unknown keys are ignored;
# malformed lines are refused.
#
# Usage:  evaluate-backup-evidence.sh < evidence.txt
#   REQUIRE_ADOPTION=true    also demand documents_data cutover evidence
#   BACKUP_MAX_AGE_HOURS=30  passed through to the freshness helper
#
# Prints EVIDENCE key=value lines, then the helper's own FRESHNESS lines.
# Exit 0 only when every check passed.
set -uo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRESHNESS_HELPER="${HERE}/check-backup-freshness.sh"

emit() { printf 'EVIDENCE %s\n' "$1"; }
refuse() {
  emit "result=$1"
  echo "Refusing: $2" >&2
  exit 1
}

# ── The flag, again ─────────────────────────────────────────────────────────
# The workflow refuses on this BEFORE it collects anything, which is where it
# belongs: an unauthorised release should not reach a privileged read. It is
# re-checked here so the rule is executable and testable rather than living
# only in YAML, and so this script cannot be reused somewhere that forgot it.
# An ABSENT flag refuses too: the default must not be the permissive one.
case "${RELEASE_BACKUP_EVIDENCE_REQUIRED:-}" in
  true) ;;
  *) refuse "EVIDENCE_NOT_REQUIRED" "backup evidence is mandatory for every production release; RELEASE_BACKUP_EVIDENCE_REQUIRED was not true" ;;
esac

[ -f "${FRESHNESS_HELPER}" ] || refuse "NO_HELPER" "the freshness helper is missing from this checkout: ${FRESHNESS_HELPER}"

RAW="$(cat)"

# ── Framing ─────────────────────────────────────────────────────────────────
grep -qx 'EVIDENCE_BEGIN' <<<"${RAW}" || refuse "NO_EVIDENCE" "the collector produced no evidence block (the host was unreachable, the privileged read was refused, or the collector died before it could report)"
grep -qx 'EVIDENCE_END'   <<<"${RAW}" || refuse "TRUNCATED_EVIDENCE" "the evidence block has no end marker — the measurement did not complete"

BODY="$(sed -n '/^EVIDENCE_BEGIN$/,/^EVIDENCE_END$/p' <<<"${RAW}" | sed '1d;$d')"

declare -A EV=()
while IFS= read -r line; do
  [ -n "${line}" ] || continue
  # The offending prefix is named so a malformed block can be diagnosed
  # without re-running the collector. Truncated to 40 characters: the block
  # carries no secret, but there is no reason to echo a whole base64 record.
  [[ "${line}" =~ ^[a-z0-9_]+=.*$ ]] \
    || refuse "MALFORMED_EVIDENCE" "the evidence block contains a line that is not key=value: '${line:0:40}'"
  EV["${line%%=*}"]="${line#*=}"
done <<<"${BODY}"

get() { printf '%s' "${EV[$1]:-}"; }

[ "$(get evidence_version)" = "1" ] || refuse "UNKNOWN_EVIDENCE_VERSION" "this evaluator understands evidence_version=1 only"

# ── The artifact itself ─────────────────────────────────────────────────────
[ "$(get artifact_present)" = "1" ] || refuse "NO_ARTIFACT" "no encrypted backup (.hbk) found in $(get backup_dir)"

NAME="$(get artifact_name)"
MTIME="$(get artifact_mtime)"
SHA="$(get artifact_sha256)"
[[ "${NAME}" =~ ^[A-Za-z0-9._-]+\.hbk$ ]] || refuse "BAD_ARTIFACT_NAME" "the measured artifact name is not canonical"
[[ "${MTIME}" =~ ^[0-9]+$ ]]             || refuse "BAD_MTIME" "the measured modification time is not a whole number of seconds"
[[ "${SHA}" =~ ^[0-9a-f]{64}$ ]]         || refuse "BAD_HASH" "the measured SHA-256 is not 64 hex characters"
emit "artifact=${NAME}"
emit "owner=$(get artifact_owner)"
emit "mode=$(get artifact_mode)"

[ "$(get partial_present)" = "0" ] || refuse "PARTIAL_SIBLING" "${NAME} has a .partial sibling — the atomic publish never completed"
[ "$(get meta_present)" = "1" ]    || refuse "NO_META" "no verification record beside ${NAME}"

META_JSON="$(printf '%s' "$(get meta_b64)" | base64 -d 2>/dev/null)" \
  || refuse "MALFORMED_EVIDENCE" "the verification record did not survive transport"
[ -n "${META_JSON}" ] || refuse "NO_META" "the verification record arrived empty"

# The record must describe THIS artifact and claim a complete, verified,
# encrypted backup. The freshness helper re-checks these from the record it is
# handed; they are asserted here too so the refusal names the right thing.
grep -qF "\"file\":\"${NAME}\"" <<<"${META_JSON}" || refuse "META_MISMATCH" "the verification record does not name ${NAME}"
grep -q '"verified":true'  <<<"${META_JSON}" || refuse "NOT_VERIFIED"  "${NAME} is not marked verified"
grep -q '"partial":false'  <<<"${META_JSON}" || refuse "PARTIAL"       "${NAME} is not marked complete"
grep -q '"encrypted":true' <<<"${META_JSON}" || refuse "NOT_ENCRYPTED" "${NAME} is not marked encrypted"

RECORDED_SHA="$(sed -n 's/.*"transportSha256":"\([0-9a-f]\{64\}\)".*/\1/p' <<<"${META_JSON}")"
[ -n "${RECORDED_SHA}" ] || refuse "META_INCOMPLETE" "the verification record carries no transport SHA-256"
[ "${RECORDED_SHA}" = "${SHA}" ] || refuse "HASH_MISMATCH" "backup integrity check failed for ${NAME}"

# ── documents_data cutover evidence, only for a migration-bearing release ───
if [ "${REQUIRE_ADOPTION:-false}" = "true" ]; then
  [ "$(get adoption_present)" = "1" ] || refuse "NO_ADOPTION" "no documents_data adoption evidence in $(get backup_dir)"
  ADOPTION_JSON="$(printf '%s' "$(get adoption_b64)" | base64 -d 2>/dev/null)" \
    || refuse "MALFORMED_EVIDENCE" "the adoption evidence did not survive transport"
  grep -q '"integrityVerified": *true' <<<"${ADOPTION_JSON}" \
    || refuse "ADOPTION_NOT_VERIFIED" "documents_data adoption evidence does not prove integrity"
  emit "adoption=verified"
fi

# ── The one freshness judgement ─────────────────────────────────────────────
# From THIS checkout, which is the target SHA's, with the record on stdin.
if ! printf '%s' "${META_JSON}" \
     | bash "${FRESHNESS_HELPER}" "${NAME}" "${MTIME}" "${SHA}" - "${BACKUP_MAX_AGE_HOURS:-30}"; then
  emit "result=NOT_FRESH"
  echo "Refusing: the newest backup did not pass the freshness and consistency check." >&2
  exit 1
fi

emit "result=PASS"
echo "Release backup evidence verified: ${NAME} complete, verified, hash-intact and recent."

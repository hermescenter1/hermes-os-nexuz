#!/usr/bin/env bash
#
# DA-1 — MEASURE the production backup evidence. Decide nothing.
#
# This runs ON THE PRODUCTION HOST, sent there on stdin by the deploy
# workflow's read-only evidence step. It reads, it reports, and it never
# judges: there is exactly one place that decides FRESH / STALE / FAIL, and it
# is scripts/deploy/check-backup-freshness.sh, reached through
# scripts/deploy/evaluate-backup-evidence.sh on the RUNNER, out of the
# checkout of the target SHA. Duplicating selection or freshness logic here
# would create a second implementation that drifts.
#
# WHY IT IS NOT RUN UNDER `sudo bash`. Running this whole script as root
# would ASK for a shell through sudo, which is the largest grant there is.
# Each read goes through `sudo -n -- <binary>` instead, exactly as the
# previous inline gate did, and this script adds no sudoers rule of its own.
#
# THAT IS A STATEMENT ABOUT THIS SCRIPT, NOT ABOUT THE HOST. Checked on the
# production host on 2026-10-16, the deploy account holds NOPASSWD:ALL
# (finding DEPLOY_USER_NOPASSWD_ALL, docs/security/deploy-privilege-findings
# -2026-10.md). So the narrow form below is a property of the CALLER, not a
# limit the system imposes: today it could have run anything. Writing it
# narrowly is still worth doing — it is what makes a restricted wrapper
# possible later, and it keeps the audit trail honest about what the release
# path actually needs — but nothing here may be described as least-privileged
# until that finding is closed.
#
# WHAT LEAVES THE HOST. Measurements, and the verification record — which is
# metadata about the artifact (`verified`, `partial`, `encrypted`, a key
# IDENTIFIER, a SHA-256, a timestamp, a filename). Never the artifact's
# contents, never a key, never anything the key file holds. The record is
# base64-encoded for transport so a newline, a space or a quote inside it can
# neither break the framing nor be re-interpreted by a shell.
#
# WHAT IT WRITES. Nothing. No file is created, copied, moved or removed on the
# host; the only state it touches is its own stdout.
#
# Output: a framed key=value block.
#
#   EVIDENCE_BEGIN
#   evidence_version=1
#   ...
#   EVIDENCE_END
#
# Framing is load-bearing: a reader that does not see BOTH markers must treat
# the evidence as absent. A truncated transfer, a killed process or an SSH
# failure therefore cannot be mistaken for a clean measurement.
#
# Exit 0 only when a complete block was emitted.
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
# Canonical artifact names only. The producer (scripts/backup-postgres.sh)
# writes `hermes_postgres_<date>_<time>.hbk`; anything whose BASENAME is not
# plain [A-Za-z0-9._-] is refused rather than measured. That closes newline,
# space and quote injection through a crafted filename, and it means the name
# carried in the output can never be re-read as shell.
NAME_PATTERN='^[A-Za-z0-9._-]+\.hbk$'

emit() { printf '%s\n' "$1"; }
die() {
  # No EVIDENCE_END, deliberately: an incomplete measurement must not read as
  # a clean one. The reason goes to stderr, where the evaluator surfaces it.
  echo "collector: $*" >&2
  exit 1
}
priv() { sudo -n -- "$@"; }

command -v base64 >/dev/null 2>&1 || die "base64 is not available on this host"

emit "EVIDENCE_BEGIN"
emit "evidence_version=1"
emit "backup_dir=${BACKUP_DIR}"

# ── The newest artifact ──────────────────────────────────────────────────────
# `%f` is the BASENAME: no directory component can appear in the parsed line.
# `-type f` excludes symlinks, so what is hashed is what was listed. This is
# also the first privileged call, so a missing sudoers rule stops here.
LISTING="$(priv find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.hbk' -printf '%T@ %f\n')" \
  || die "cannot list ${BACKUP_DIR} through 'sudo -n' (missing directory, or no NOPASSWD rule for the read-only checks; no TTY is available)"

CANDIDATES=0
NEWEST_EPOCH=""
NEWEST_NAME=""
while IFS= read -r line; do
  [ -n "${line}" ] || continue
  CANDIDATES=$(( CANDIDATES + 1 ))
  stamp="${line%% *}"
  name="${line#* }"
  # A filename containing a newline would arrive as a line that fails this
  # pattern. Refusing is the point: a name that cannot be described safely is
  # not a candidate, and silently skipping it could change which artifact is
  # "newest".
  [[ "${stamp}" =~ ^[0-9]+(\.[0-9]+)?$ ]] || die "unparseable timestamp in the listing"
  [[ "${name}" =~ ${NAME_PATTERN} ]] || die "artifact name is not canonical: refusing to measure it"
  secs="${stamp%%.*}"
  if [ -z "${NEWEST_EPOCH}" ] || [ "${secs}" -gt "${NEWEST_EPOCH}" ]; then
    NEWEST_EPOCH="${secs}"
    NEWEST_NAME="${name}"
  fi
done <<<"${LISTING}"

emit "candidate_count=${CANDIDATES}"
if [ -z "${NEWEST_NAME}" ]; then
  # A measurable, reportable fact — not a verdict. The evaluator decides what
  # "no artifact" means for a release.
  emit "artifact_present=0"
  emit "EVIDENCE_END"
  exit 0
fi

NEWEST_PATH="${BACKUP_DIR}/${NEWEST_NAME}"
emit "artifact_present=1"
emit "artifact_name=${NEWEST_NAME}"
emit "artifact_mtime=${NEWEST_EPOCH}"

# ── Ownership and mode, measured not assumed ────────────────────────────────
OWNERSHIP="$(priv find "${NEWEST_PATH}" -maxdepth 0 -printf '%U:%G %m\n')" \
  || die "cannot stat ${NEWEST_NAME} through sudo -n"
emit "artifact_owner=${OWNERSHIP%% *}"
emit "artifact_mode=${OWNERSHIP##* }"

# ── A .partial sibling means the atomic publish never completed ─────────────
# Asked as a listing so a denied sudo fails here rather than reading "absent".
PARTIAL="$(priv find "${BACKUP_DIR}" -maxdepth 1 -name "${NEWEST_NAME}.partial" -print)" \
  || die "cannot check ${BACKUP_DIR} for a .partial sibling through sudo -n"
if [ -n "${PARTIAL}" ]; then emit "partial_present=1"; else emit "partial_present=0"; fi

# ── The verification record ─────────────────────────────────────────────────
META_PATH="${NEWEST_PATH}.meta.json"
META_FOUND="$(priv find "${META_PATH}" -maxdepth 0 -type f -print 2>/dev/null)" || META_FOUND=""
if [ "${META_FOUND}" != "${META_PATH}" ]; then
  emit "meta_present=0"
else
  META_JSON="$(priv cat -- "${META_PATH}")" \
    || die "the verification record beside ${NEWEST_NAME} is unreadable through sudo -n"
  emit "meta_present=1"
  emit "meta_b64=$(printf '%s' "${META_JSON}" | base64 | tr -d '\n')"
fi

# ── The artifact's real hash ────────────────────────────────────────────────
HASH_LINE="$(priv sha256sum -- "${NEWEST_PATH}")" \
  || die "cannot hash ${NEWEST_NAME} through sudo -n"
emit "artifact_sha256=${HASH_LINE%% *}"

# ── documents_data adoption evidence, only when asked for ───────────────────
# It is evidence about a MIGRATION cutover. Whether to require it is the
# evaluator's decision; whether it exists is a measurement.
if [ "${COLLECT_ADOPTION:-false}" = "true" ]; then
  ADOPTION_PATH="${BACKUP_DIR}/documents-adoption.json"
  ADOPTION_FOUND="$(priv find "${ADOPTION_PATH}" -maxdepth 0 -type f -print 2>/dev/null)" || ADOPTION_FOUND=""
  if [ "${ADOPTION_FOUND}" != "${ADOPTION_PATH}" ]; then
    emit "adoption_present=0"
  else
    ADOPTION_JSON="$(priv cat -- "${ADOPTION_PATH}")" \
      || die "the adoption evidence is unreadable through sudo -n"
    emit "adoption_present=1"
    emit "adoption_b64=$(printf '%s' "${ADOPTION_JSON}" | base64 | tr -d '\n')"
  fi
fi

emit "EVIDENCE_END"

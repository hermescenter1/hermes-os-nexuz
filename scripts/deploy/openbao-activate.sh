#!/usr/bin/env bash
# PHASE 95 — OpenBao activation + rollback, RUNTIME-VERIFIABLE.
#
# Called by .github/workflows/deploy.yml on the production host AFTER the pinned
# SHA is checked out, running as the NON-ROOT deploy user (which is NOT a member
# of the runtime secret group). A stable root-owned marker decides whether this
# deploy activates the OpenBao overlay:
#   marker absent  → base compose only (backend disabled)
#   marker present → strictly validated, then base + overlay; on ANY failure it
#                    rolls back to base compose and PROVES the backend is disabled.
#
# All privileged reads use `sudo -n` (passwordless), so a missing sudo, a
# permission error, or an unreadable marker FAILS CLOSED — never mistaken for
# "marker absent". The marker is never `source`d/`eval`d. No credential value,
# marker value, or private IP is ever printed.
#
# Extracted into its own script so it is unit-testable with shimmed sudo/docker/
# stat (see scripts/deploy/__tests__/openbao-activate.behaviour.test.ts); every
# external command is invoked by name, and compose commands are LITERAL (not
# array-expanded) so the Gate 0D-A static checker can validate them.

set -uo pipefail

MARKER="${OPENBAO_MARKER:-/etc/hermes-openbao/activation.env}"
REPO_ROOT="${OPENBAO_REPO_ROOT:-/opt/hermes-os-nexuz}"

log() { echo "[openbao-activate] $*"; }
err() { echo "[openbao-activate] $*" >&2; }

cid=""
cid_rb=""

# ── privilege ────────────────────────────────────────────────────────────────
# Passwordless sudo is REQUIRED to validate root-owned activation state. Prove it
# up front so a later `sudo -n test` returning non-zero can only mean the checked
# condition failed — never that sudo itself was denied.
if ! sudo -n true 2>/dev/null; then
  err "Refusing: passwordless sudo (sudo -n) is unavailable — cannot validate root-owned activation state."
  exit 1
fi

# ── health helper ────────────────────────────────────────────────────────────
wait_healthy() {
  cid_w="$1"; i=0
  while [ "$i" -lt 60 ]; do
    st="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid_w" 2>/dev/null || echo error)"
    [ "$st" = healthy ] && return 0
    [ "$st" = unhealthy ] && return 1
    i=$((i + 1)); sleep 5
  done
  return 1
}

# ── base (disabled) deploy ───────────────────────────────────────────────────
deploy_base_disabled() {
  docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
}

# ── marker presence (privileged, unambiguous) ────────────────────────────────
# sudo is already proven, so `sudo -n test -e` returning 1 is a GENUINE absence;
# anything else (>1) is an unexpected error → fail closed.
marker_present() {
  # Capture the probe's exit status DIRECTLY (a following `$?` after an `if` would
  # read the `if` compound's status, not the probe's).
  sudo -n test -e "$MARKER"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  if [ "$rc" -eq 1 ]; then
    return 1
  fi
  err "Refusing: could not determine marker state (privilege/read error)."
  exit 1
}

# ── path helpers ─────────────────────────────────────────────────────────────
check_regular_outside() {
  p="$1"
  case "$p" in /*) : ;; *) err "Refusing: credential path is not absolute."; exit 1;; esac
  case "$p" in "$REPO_ROOT" | "$REPO_ROOT"/*) err "Refusing: credential path is inside the repository."; exit 1;; esac
  sudo -n test ! -L "$p" || { err "Refusing: credential path is a symlink."; exit 1; }
  sudo -n test -f "$p" || { err "Refusing: credential path is not a regular file."; exit 1; }
}

check_role_secret() {
  check_regular_outside "$1"
  [ "$(sudo -n stat -c '%U' -- "$1")" = root ] || { err "Refusing: credential is not owned by root."; exit 1; }
  [ "$(sudo -n stat -c '%g' -- "$1")" = "$RUNTIME_GID" ] || { err "Refusing: credential group is not the runtime GID."; exit 1; }
  [ "$(sudo -n stat -c '%a' -- "$1")" = 440 ] || { err "Refusing: credential mode is not exactly 0440."; exit 1; }
}

# ── active verification (backend ENABLED) ────────────────────────────────────
verify_host_mapping() {
  # Prove `openbao` maps to EXACTLY the private IP, from the container's actual
  # /etc/hosts, comparing on the HOST. Never prints the IP; never passes it into
  # the container. Reads hosts into a variable (no pipefail-masked pipe).
  hosts="$(docker exec "$cid" cat /etc/hosts 2>/dev/null)" || return 1
  awk -v ip="$PRIVATE_IP" '$1 == ip { for (i = 2; i <= NF; i++) if ($i == "openbao") f = 1 } END { exit(f ? 0 : 1) }' <<< "$hosts"
}

verify_active() {
  [ -n "$cid" ] || return 1
  docker exec "$cid" sh -c '[ "${OT_SECRET_BACKEND:-}" = openbao ]' || return 1
  docker exec "$cid" sh -c '[ -f /run/secrets/openbao_role_id ] && [ -r /run/secrets/openbao_role_id ]' || return 1
  docker exec "$cid" sh -c '[ -f /run/secrets/openbao_secret_id ] && [ -r /run/secrets/openbao_secret_id ]' || return 1
  docker exec "$cid" sh -c '[ -f /run/secrets/openbao_ca ] && [ -r /run/secrets/openbao_ca ]' || return 1
  verify_host_mapping || return 1
  wait_healthy "$cid" || return 1
  return 0
}

# ── rollback (prove backend DISABLED) ────────────────────────────────────────
verify_rollback_disabled() {
  [ -n "$cid_rb" ] || return 1
  docker exec "$cid_rb" sh -c '[ "${OT_SECRET_BACKEND:-}" != openbao ]' || return 1
  docker exec "$cid_rb" sh -c '[ ! -e /run/secrets/openbao_role_id ]' || return 1
  docker exec "$cid_rb" sh -c '[ ! -e /run/secrets/openbao_secret_id ]' || return 1
  docker exec "$cid_rb" sh -c '[ ! -e /run/secrets/openbao_ca ]' || return 1
  # The final container must carry NO OpenBao bind mounts (built from base compose).
  mounts="$(docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$cid_rb" 2>/dev/null)" || return 1
  case "$mounts" in *"/run/secrets/openbao_"*) return 1;; esac
  wait_healthy "$cid_rb" || return 1
  return 0
}

rollback_base() {
  err "Activation failed — rolling back to base compose (backend disabled)."
  cid_rb=""
  if ! docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web; then
    err "ROLLBACK_UNVERIFIED: base 'up' failed."
    return 1
  fi
  cid_rb="$(docker compose -p hermes -f docker-compose.prod.yml ps -q hermes-web)"
  if verify_rollback_disabled; then
    err "Rollback complete: backend disabled, mounts absent, hermes-web healthy."
    return 0
  fi
  err "ROLLBACK_UNVERIFIED: could not prove the backend is disabled after rollback."
  return 1
}

# ── main ─────────────────────────────────────────────────────────────────────
if ! marker_present; then
  log "Activation marker absent — deploying BASE compose (backend disabled)."
  deploy_base_disabled
  cid_base="$(docker compose -p hermes -f docker-compose.prod.yml ps -q hermes-web)"
  wait_healthy "$cid_base" || { err "base hermes-web did not become healthy."; exit 1; }
  log "Base deploy healthy (OpenBao disabled)."
  exit 0
fi

log "Activation marker present — validating (fail closed)."

# Marker integrity — privileged, regular file, not a symlink, root:root, no 'other'.
sudo -n test -f "$MARKER" || { err "Refusing: marker is not a regular file."; exit 1; }
sudo -n test ! -L "$MARKER" || { err "Refusing: marker is a symlink."; exit 1; }
[ "$(sudo -n stat -c '%U:%G' -- "$MARKER")" = "root:root" ] || { err "Refusing: marker is not owned root:root."; exit 1; }
mmode="$(sudo -n stat -c '%a' -- "$MARKER")" || { err "Refusing: cannot stat marker."; exit 1; }
while [ "${#mmode}" -lt 3 ]; do mmode="0$mmode"; done
[ "$((0$mmode & 007))" -eq 0 ] || { err "Refusing: marker grants 'other' permissions."; exit 1; }

# Read the marker CONTENT once via sudo, checking the read status; parse in the
# CURRENT shell via a here-string (no source/eval, no process-substitution error
# masking, no temp copy). The content is non-secret (paths/GID/IP).
marker_content="$(sudo -n cat -- "$MARKER")" || { err "Refusing: cannot read marker (privilege/read error)."; exit 1; }

ROLE_ID_HOST_FILE=""; SECRET_ID_HOST_FILE=""; CA_HOST_FILE=""; PRIVATE_IP=""; RUNTIME_GID=""
seen=" "
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  case "$line" in *[!A-Za-z0-9._/=-]*) err "Refusing: illegal character in marker."; exit 1;; esac
  case "$line" in *=*) : ;; *) err "Refusing: marker line is not KEY=VALUE."; exit 1;; esac
  key="${line%%=*}"; val="${line#*=}"
  case "$val" in *=*) err "Refusing: marker value contains '='."; exit 1;; esac
  [ -n "$key" ] && [ -n "$val" ] || { err "Refusing: empty marker key/value."; exit 1; }
  case " OPENBAO_ROLE_ID_HOST_FILE OPENBAO_SECRET_ID_HOST_FILE OPENBAO_CA_HOST_FILE OPENBAO_PRIVATE_IP OPENBAO_RUNTIME_GID " in
    *" $key "*) : ;;
    *) err "Refusing: unknown marker key."; exit 1;;
  esac
  case "$seen" in *" $key "*) err "Refusing: duplicate marker key."; exit 1;; esac
  seen="$seen$key "
  case "$key" in
    OPENBAO_ROLE_ID_HOST_FILE) ROLE_ID_HOST_FILE="$val";;
    OPENBAO_SECRET_ID_HOST_FILE) SECRET_ID_HOST_FILE="$val";;
    OPENBAO_CA_HOST_FILE) CA_HOST_FILE="$val";;
    OPENBAO_PRIVATE_IP) PRIVATE_IP="$val";;
    OPENBAO_RUNTIME_GID) RUNTIME_GID="$val";;
  esac
done <<< "$marker_content"

if [ -z "$ROLE_ID_HOST_FILE" ] || [ -z "$SECRET_ID_HOST_FILE" ] || [ -z "$CA_HOST_FILE" ] || [ -z "$PRIVATE_IP" ] || [ -z "$RUNTIME_GID" ]; then
  err "Refusing: marker is missing a required key."; exit 1
fi

case "$RUNTIME_GID" in *[!0-9]* | '') err "Refusing: OPENBAO_RUNTIME_GID is not numeric."; exit 1;; esac
if [ "$RUNTIME_GID" -lt 1 ] || [ "$RUNTIME_GID" -gt 65535 ]; then
  err "Refusing: OPENBAO_RUNTIME_GID out of range."; exit 1
fi

case "$PRIVATE_IP" in *[!0-9.]*) err "Refusing: OPENBAO_PRIVATE_IP is not IPv4."; exit 1;; esac
oIFS="$IFS"; IFS=.; set -- $PRIVATE_IP; IFS="$oIFS"
[ "$#" -eq 4 ] || { err "Refusing: OPENBAO_PRIVATE_IP is not a dotted quad."; exit 1; }
for o in "$@"; do
  case "$o" in '' | *[!0-9]*) err "Refusing: bad IPv4 octet."; exit 1;; esac
  [ "$o" -le 255 ] || { err "Refusing: IPv4 octet > 255."; exit 1; }
done
ip_a="$1"; ip_b="$2"; priv=0
[ "$ip_a" -eq 10 ] && priv=1
[ "$ip_a" -eq 192 ] && [ "$ip_b" -eq 168 ] && priv=1
[ "$ip_a" -eq 172 ] && [ "$ip_b" -ge 16 ] && [ "$ip_b" -le 31 ] && priv=1
[ "$priv" -eq 1 ] || { err "Refusing: OPENBAO_PRIVATE_IP is not a private-range address."; exit 1; }

check_role_secret "$ROLE_ID_HOST_FILE"
check_role_secret "$SECRET_ID_HOST_FILE"

check_regular_outside "$CA_HOST_FILE"
camode="$(sudo -n stat -c '%a' -- "$CA_HOST_FILE")" || { err "Refusing: cannot stat CA."; exit 1; }
while [ "${#camode}" -lt 3 ]; do camode="0$camode"; done
[ "$((0$camode & 022))" -eq 0 ] || { err "Refusing: CA file is group/other writable."; exit 1; }
ca_g="$(sudo -n stat -c '%g' -- "$CA_HOST_FILE")" || { err "Refusing: cannot stat CA group."; exit 1; }
if [ "$((0$camode & 004))" -eq 0 ] && ! { [ "$ca_g" = "$RUNTIME_GID" ] && [ "$((0$camode & 040))" -ne 0 ]; }; then
  err "Refusing: CA file is not readable by the runtime (need o+r, or group=runtime with g+r)."; exit 1
fi

export OPENBAO_ROLE_ID_HOST_FILE="$ROLE_ID_HOST_FILE"
export OPENBAO_SECRET_ID_HOST_FILE="$SECRET_ID_HOST_FILE"
export OPENBAO_CA_HOST_FILE="$CA_HOST_FILE"
export OPENBAO_PRIVATE_IP="$PRIVATE_IP"
export OPENBAO_RUNTIME_GID="$RUNTIME_GID"

if ! docker compose -p hermes -f docker-compose.prod.yml -f docker-compose.prod.openbao.yml --env-file .env.production config >/dev/null; then
  err "Refusing: merged OpenBao Compose config is invalid."; exit 1
fi

log "Marker validated — deploying WITH the OpenBao overlay."

# GAP 2: the active `up` runs under EXPLICIT control (never a bare `set -e`
# abort), so any non-zero exit, empty container id, or failed verification
# funnels into a base-compose rollback.
activation_failed=0
if ! docker compose -p hermes -f docker-compose.prod.yml -f docker-compose.prod.openbao.yml --env-file .env.production up -d --build --no-deps hermes-web; then
  activation_failed=1
fi
if [ "$activation_failed" -eq 0 ]; then
  cid="$(docker compose -p hermes -f docker-compose.prod.yml -f docker-compose.prod.openbao.yml ps -q hermes-web)"
  if ! verify_active; then
    activation_failed=1
  fi
fi

if [ "$activation_failed" -ne 0 ]; then
  if rollback_base; then
    exit 1
  fi
  # Rollback itself could not be proven — surface it, do not claim success.
  err "ROLLBACK_UNVERIFIED: production state is uncertain — operator action required."
  exit 1
fi

log "OpenBao activation verified: backend enabled and hermes-web healthy."
exit 0

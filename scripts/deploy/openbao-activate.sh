#!/usr/bin/env bash
# PHASE 95 — OpenBao activation + rollback, RUNTIME-VERIFIABLE and fail-closed.
#
# Called by .github/workflows/deploy.yml on the production host AFTER the pinned
# SHA is checked out, running as the NON-ROOT deploy user (NOT a member of the
# runtime secret group). A stable root-owned marker decides whether this deploy
# activates the OpenBao overlay:
#   marker absent  → base compose only, and it PROVES the backend is disabled
#   marker present → strictly validated, then base + overlay; on ANY failure it
#                    rolls back to base compose and PROVES the backend disabled.
#
# All privileged reads use `sudo -n` (passwordless), proven up front, so a missing
# sudo / permission error / unreadable marker FAILS CLOSED — never mistaken for
# "marker absent". The marker is never `source`d/`eval`d. No credential value,
# marker/path value, or private IP is ever printed.
#
# Unit-testable with shimmed sudo/docker/id/realpath/cmp/openssl (see
# scripts/deploy/__tests__/); every external command is invoked by name and
# compose commands are LITERAL so the Gate 0D-A static checker can validate them.

set -uo pipefail

MARKER="${OPENBAO_MARKER:-/etc/hermes-openbao/activation.env}"
REPO_ROOT="${OPENBAO_REPO_ROOT:-/opt/hermes-os-nexuz}"
# Canonical AppRole source of truth on Production (overridable for tests only).
CANONICAL_ROLE_ID="${OPENBAO_CANONICAL_ROLE_ID_FILE:-/etc/hermes-openbao/app/role-id}"
CANONICAL_SECRET_ID="${OPENBAO_CANONICAL_SECRET_ID_FILE:-/etc/hermes-openbao/app/secret-id}"

log() { echo "[openbao-activate] $*"; }
err() { echo "[openbao-activate] $*" >&2; }

cid=""

# ── the script itself must run as the non-root deploy user ───────────────────
if [ "$(id -u)" -eq 0 ]; then
  err "Refusing: activation script must run as the non-root deploy user."
  exit 1
fi

# ── passwordless sudo required (proven up front) ─────────────────────────────
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

# ── base (disabled) deploy + PROOF (shared by marker-absent AND rollback) ────
deploy_base_disabled() {
  docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
}

verify_base_disabled() {
  base_cid="$1"
  [ -n "$base_cid" ] || return 1
  docker exec "$base_cid" sh -c '[ "${OT_SECRET_BACKEND:-}" != "openbao" ]' || return 1
  docker exec "$base_cid" sh -c '[ ! -e /run/secrets/openbao_role_id ]' || return 1
  docker exec "$base_cid" sh -c '[ ! -e /run/secrets/openbao_secret_id ]' || return 1
  docker exec "$base_cid" sh -c '[ ! -e /run/secrets/openbao_ca ]' || return 1
  base_mounts="$(docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$base_cid" 2>/dev/null)" || return 1
  case "$base_mounts" in *"/run/secrets/openbao_"*) return 1;; esac
  wait_healthy "$base_cid" || return 1
  return 0
}

deploy_and_prove_base() {
  if ! deploy_base_disabled; then
    err "Base deployment failed."
    return 1
  fi
  base_cid="$(docker compose -p hermes -f docker-compose.prod.yml ps -q hermes-web)" || return 1
  if ! verify_base_disabled "$base_cid"; then
    return 1
  fi
  return 0
}

# ── marker presence (privileged, unambiguous) ────────────────────────────────
marker_present() {
  sudo -n test -e "$MARKER"
  rc=$?
  if [ "$rc" -eq 0 ]; then return 0; fi
  if [ "$rc" -eq 1 ]; then return 1; fi
  err "Refusing: could not determine marker state (privilege/read error)."
  exit 1
}

# ── path integrity: absolute, canonical (no symlink/`..`), outside the repo ──
canonical_outside_regular() {
  p="$1"
  case "$p" in /*) : ;; *) err "Refusing: path is not absolute."; exit 1;; esac
  cpath="$(sudo -n realpath -e -- "$p")" || { err "Refusing: path cannot be canonicalized."; exit 1; }
  [ "$cpath" = "$p" ] || { err "Refusing: path contains a symlink or non-canonical component."; exit 1; }
  case "$cpath" in "$REPO_ROOT" | "$REPO_ROOT"/*) err "Refusing: path resolves inside the repository."; exit 1;; esac
  sudo -n test ! -L "$p" || { err "Refusing: path is a symlink."; exit 1; }
  sudo -n test -f "$p" || { err "Refusing: path is not a regular file."; exit 1; }
}

canonical_outside_dir() {
  p="$1"
  case "$p" in /*) : ;; *) err "Refusing: directory path is not absolute."; exit 1;; esac
  cpath="$(sudo -n realpath -e -- "$p")" || { err "Refusing: directory cannot be canonicalized."; exit 1; }
  [ "$cpath" = "$p" ] || { err "Refusing: directory contains a symlink or non-canonical component."; exit 1; }
  case "$cpath" in "$REPO_ROOT" | "$REPO_ROOT"/*) err "Refusing: directory resolves inside the repository."; exit 1;; esac
  sudo -n test ! -L "$p" || { err "Refusing: directory is a symlink."; exit 1; }
  sudo -n test -d "$p" || { err "Refusing: not a directory."; exit 1; }
}

# ── runtime credential copy: root:<gid> 0440, canonical, byte-identical ──────
check_runtime_copy() {
  # $1 runtime-copy path, $2 canonical source-of-truth path
  canonical_outside_regular "$1"
  [ "$(sudo -n stat -c '%U' -- "$1")" = root ] || { err "Refusing: runtime copy is not owned by root."; exit 1; }
  [ "$(sudo -n stat -c '%g' -- "$1")" = "$RUNTIME_GID" ] || { err "Refusing: runtime copy group is not the runtime GID."; exit 1; }
  [ "$(sudo -n stat -c '%a' -- "$1")" = 440 ] || { err "Refusing: runtime copy mode is not exactly 0440."; exit 1; }
  # Canonical file: root:root 0600, canonical, regular, non-symlink.
  sudo -n test ! -L "$2" || { err "Refusing: canonical credential is a symlink."; exit 1; }
  sudo -n test -f "$2" || { err "Refusing: canonical credential is missing."; exit 1; }
  [ "$(sudo -n stat -c '%U:%G' -- "$2")" = "root:root" ] || { err "Refusing: canonical credential is not root:root."; exit 1; }
  [ "$(sudo -n stat -c '%a' -- "$2")" = 600 ] || { err "Refusing: canonical credential mode is not exactly 0600."; exit 1; }
  # The runtime copy must be byte-identical to the canonical credential.
  sudo -n cmp -s -- "$2" "$1" || { err "Refusing: runtime credential copy does not match the canonical credential."; exit 1; }
}

# ── active runtime proof (backend ENABLED, read-only mounts, correct ids) ────
verify_host_mapping() {
  hosts="$(docker exec "$cid" cat /etc/hosts 2>/dev/null)" || return 1
  awk -v ip="$PRIVATE_IP" '$1 == ip { for (i = 2; i <= NF; i++) if ($i == "openbao") f = 1 } END { exit(f ? 0 : 1) }' <<< "$hosts"
}

verify_active_mount() {
  # $1 destination, $2 expected canonical source; RW must be false.
  printf '%s' "$active_mounts" | grep -qF -- "$1=false=$2"
}

verify_active() {
  [ -n "$cid" ] || return 1
  docker exec "$cid" sh -c '[ "${OT_SECRET_BACKEND:-}" = openbao ]' || return 1
  docker exec "$cid" sh -c '[ -f /run/secrets/openbao_role_id ] && [ -r /run/secrets/openbao_role_id ]' || return 1
  docker exec "$cid" sh -c '[ -f /run/secrets/openbao_secret_id ] && [ -r /run/secrets/openbao_secret_id ]' || return 1
  docker exec "$cid" sh -c '[ -f /run/secrets/openbao_ca ] && [ -r /run/secrets/openbao_ca ]' || return 1
  # The process must run as UID 1001 and the runtime GID.
  [ "$(docker exec "$cid" id -u 2>/dev/null)" = 1001 ] || return 1
  [ "$(docker exec "$cid" id -g 2>/dev/null)" = "$RUNTIME_GID" ] || return 1
  # All three mounts must be present, read-only, and sourced from the canonical
  # runtime host paths.
  active_mounts="$(docker inspect --format '{{range .Mounts}}{{.Destination}}={{.RW}}={{.Source}}{{println}}{{end}}' "$cid" 2>/dev/null)" || return 1
  verify_active_mount /run/secrets/openbao_role_id "$ROLE_ID_HOST_FILE" || return 1
  verify_active_mount /run/secrets/openbao_secret_id "$SECRET_ID_HOST_FILE" || return 1
  verify_active_mount /run/secrets/openbao_ca "$CA_HOST_FILE" || return 1
  verify_host_mapping || return 1
  wait_healthy "$cid" || return 1
  return 0
}

rollback_base() {
  err "Activation failed — rolling back to base compose (backend disabled)."
  if ! deploy_base_disabled; then
    err "ROLLBACK_UNVERIFIED: base 'up' failed."
    return 1
  fi
  cid_rb="$(docker compose -p hermes -f docker-compose.prod.yml ps -q hermes-web)"
  if verify_base_disabled "$cid_rb"; then
    err "Rollback complete: backend disabled, mounts absent, hermes-web healthy."
    return 0
  fi
  err "ROLLBACK_UNVERIFIED: could not prove the backend is disabled after rollback."
  return 1
}

# ── main ─────────────────────────────────────────────────────────────────────
if ! marker_present; then
  log "Activation marker absent — deploying BASE compose (backend disabled)."
  if ! deploy_and_prove_base; then
    err "BASE_STATE_UNVERIFIED: could not prove OpenBao is disabled."
    exit 1
  fi
  log "Base deploy verified: backend disabled, mounts absent, hermes-web healthy."
  exit 0
fi

log "Activation marker present — validating (fail closed)."

# Marker integrity — privileged: regular file, not a symlink, root:root, no 'other'.
sudo -n test -f "$MARKER" || { err "Refusing: marker is not a regular file."; exit 1; }
sudo -n test ! -L "$MARKER" || { err "Refusing: marker is a symlink."; exit 1; }
[ "$(sudo -n stat -c '%U:%G' -- "$MARKER")" = "root:root" ] || { err "Refusing: marker is not owned root:root."; exit 1; }
mmode="$(sudo -n stat -c '%a' -- "$MARKER")" || { err "Refusing: cannot stat marker."; exit 1; }
while [ "${#mmode}" -lt 3 ]; do mmode="0$mmode"; done
[ "$((0$mmode & 007))" -eq 0 ] || { err "Refusing: marker grants 'other' permissions."; exit 1; }

# Read the marker CONTENT once via sudo; parse in the CURRENT shell via a
# here-string (no source/eval, no process-substitution error masking, no temp
# copy). The content is non-secret (paths/GID/IP).
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

# The deploy user must NOT be a member of the runtime secret group.
case " $(id -G) " in
  *" $RUNTIME_GID "*) err "Refusing: deploy user is a member of the runtime secret group."; exit 1;;
esac

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

# RoleID + SecretID copies must share ONE runtime directory (root:root 0710).
role_dir="$(dirname -- "$ROLE_ID_HOST_FILE")"
secret_dir="$(dirname -- "$SECRET_ID_HOST_FILE")"
[ "$role_dir" = "$secret_dir" ] || { err "Refusing: role and secret copies are not in the same runtime directory."; exit 1; }
canonical_outside_dir "$role_dir"
[ "$(sudo -n stat -c '%U:%G' -- "$role_dir")" = "root:root" ] || { err "Refusing: runtime directory is not root:root."; exit 1; }
[ "$(sudo -n stat -c '%a' -- "$role_dir")" = 710 ] || { err "Refusing: runtime directory mode is not exactly 0710."; exit 1; }

check_runtime_copy "$ROLE_ID_HOST_FILE" "$CANONICAL_ROLE_ID"
check_runtime_copy "$SECRET_ID_HOST_FILE" "$CANONICAL_SECRET_ID"

# CA trust anchor: canonical, outside repo, root:root, not group/other writable,
# runtime-readable, non-empty, and a parseable PEM certificate.
canonical_outside_regular "$CA_HOST_FILE"
[ "$(sudo -n stat -c '%U:%G' -- "$CA_HOST_FILE")" = "root:root" ] || { err "Refusing: CA file is not owned root:root."; exit 1; }
camode="$(sudo -n stat -c '%a' -- "$CA_HOST_FILE")" || { err "Refusing: cannot stat CA."; exit 1; }
while [ "${#camode}" -lt 3 ]; do camode="0$camode"; done
[ "$((0$camode & 022))" -eq 0 ] || { err "Refusing: CA file is group/other writable."; exit 1; }
ca_g="$(sudo -n stat -c '%g' -- "$CA_HOST_FILE")" || { err "Refusing: cannot stat CA group."; exit 1; }
if [ "$((0$camode & 004))" -eq 0 ] && ! { [ "$ca_g" = "$RUNTIME_GID" ] && [ "$((0$camode & 040))" -ne 0 ]; }; then
  err "Refusing: CA file is not readable by the runtime (need o+r, or group=runtime with g+r)."; exit 1
fi
sudo -n test -s "$CA_HOST_FILE" || { err "Refusing: CA file is empty."; exit 1; }
sudo -n openssl version >/dev/null 2>&1 || { err "Refusing: openssl is unavailable to validate the CA (fail closed)."; exit 1; }
sudo -n openssl x509 -in "$CA_HOST_FILE" -noout >/dev/null 2>&1 || { err "Refusing: CA file is not a parseable PEM certificate."; exit 1; }

export OPENBAO_ROLE_ID_HOST_FILE="$ROLE_ID_HOST_FILE"
export OPENBAO_SECRET_ID_HOST_FILE="$SECRET_ID_HOST_FILE"
export OPENBAO_CA_HOST_FILE="$CA_HOST_FILE"
export OPENBAO_PRIVATE_IP="$PRIVATE_IP"
export OPENBAO_RUNTIME_GID="$RUNTIME_GID"

if ! docker compose -p hermes -f docker-compose.prod.yml -f docker-compose.prod.openbao.yml --env-file .env.production config >/dev/null; then
  err "Refusing: merged OpenBao Compose config is invalid."; exit 1
fi

log "Marker validated — deploying WITH the OpenBao overlay."

# GAP 2 — the active `up` runs under EXPLICIT control (never a bare `set -e`
# abort); any non-zero exit, empty container id, or failed verification funnels
# into a base-compose rollback.
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
  err "ROLLBACK_UNVERIFIED: production state is uncertain — operator action required."
  exit 1
fi

log "OpenBao activation verified: backend enabled, read-only mounts, host mapping, hermes-web healthy."
exit 0

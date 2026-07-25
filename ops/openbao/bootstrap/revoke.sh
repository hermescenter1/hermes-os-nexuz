#!/usr/bin/env bash
# PHASE 94D0F — explicit, guarded revocation & teardown for the LAB AppRole.
#
# Only the explicit actions below are supported. It never revokes leases by
# auth-path prefix, never seals the operator, and never touches pre-existing or
# unrelated mounts/auth methods. It never prints a Secret ID, accessor or token,
# never uses `set -x`, and reads sensitive accessors from a file or env — piped
# via stdin so they never appear in argv.
#
# Usage:
#   revoke.sh destroy-secret-id     # BAO_AUTH_MOUNT + BAO_ROLE + accessor
#   revoke.sh revoke-token          # token accessor
#   revoke.sh delete-role           # BAO_AUTH_MOUNT + BAO_ROLE
#   revoke.sh teardown              # BAO_CONFIRM + BAO_MANIFEST from a bootstrap run
#
# Accessors are provided by:
#   BAO_SECRET_ID_ACCESSOR_FILE | BAO_SECRET_ID_ACCESSOR
#   BAO_TOKEN_ACCESSOR_FILE     | BAO_TOKEN_ACCESSOR

set -eu
umask 077

fail() { printf '[openbao-revoke] FAILED %s\n' "$1" >&2; exit 1; }

BAO_CLI="${BAO_CLI:-bao}"
bao_() { "$BAO_CLI" "$@"; }

ACTION="${1:-}"
[ -n "$ACTION" ] || fail ACTION_REQUIRED

[ -n "${BAO_ADDR:-}" ]  || fail ENV_MISSING_ADDR
[ -n "${BAO_TOKEN:-}" ] || fail ENV_MISSING_TOKEN

validate_name() {
  case "$1" in
    "" | [!A-Za-z0-9]* | *[!A-Za-z0-9_-]* ) fail UNSAFE_NAME ;;
  esac
}

# Loopback-only endpoint.
scheme="${BAO_ADDR%%://*}"
rest="${BAO_ADDR#*://}"
hostport="${rest%%/*}"
case "$hostport" in
  \[*\]* ) host="${hostport%%]*}]" ;;
  *      ) host="${hostport%%:*}" ;;
esac
case "$scheme" in http|https ) : ;; * ) fail INSECURE_ENDPOINT ;; esac
case "$host" in 127.0.0.1|localhost|::1|"[::1]" ) : ;; * ) fail INSECURE_ENDPOINT ;; esac

export VAULT_ADDR="$BAO_ADDR" VAULT_TOKEN="$BAO_TOKEN"

# Read a value from a file (preferred) or an env var, without echoing it.
read_secret() { # $1=file-path-or-empty  $2=value-or-empty
  if [ -n "${1:-}" ] && [ -f "$1" ]; then cat "$1"
  elif [ -n "${2:-}" ]; then printf '%s' "$2"
  else return 1
  fi
}

case "$ACTION" in
  destroy-secret-id)
    AUTH="${BAO_AUTH_MOUNT:-}"; validate_name "$AUTH"
    ROLE="${BAO_ROLE:-}";       validate_name "$ROLE"
    acc="$(read_secret "${BAO_SECRET_ID_ACCESSOR_FILE:-}" "${BAO_SECRET_ID_ACCESSOR:-}")" || fail ACCESSOR_REQUIRED
    # `secret_id_accessor=-` reads the value from stdin, keeping it out of argv.
    printf '%s' "$acc" | bao_ write "auth/$AUTH/role/$ROLE/secret-id-accessor/destroy" secret_id_accessor=- >/dev/null \
      || fail DESTROY_FAILED
    printf '[openbao-revoke] OK destroy-secret-id role=%s\n' "$ROLE"
    ;;

  revoke-token)
    acc="$(read_secret "${BAO_TOKEN_ACCESSOR_FILE:-}" "${BAO_TOKEN_ACCESSOR:-}")" || fail ACCESSOR_REQUIRED
    printf '%s' "$acc" | bao_ write auth/token/revoke-accessor accessor=- >/dev/null \
      || fail REVOKE_FAILED
    printf '[openbao-revoke] OK revoke-token\n'
    ;;

  delete-role)
    AUTH="${BAO_AUTH_MOUNT:-}"; validate_name "$AUTH"
    ROLE="${BAO_ROLE:-}";       validate_name "$ROLE"
    bao_ delete "auth/$AUTH/role/$ROLE" >/dev/null || fail DELETE_ROLE_FAILED
    printf '[openbao-revoke] OK delete-role role=%s\n' "$ROLE"
    ;;

  teardown)
    [ "${BAO_CONFIRM:-}" = "I-UNDERSTAND-DESTROY" ] || fail CONFIRM_REQUIRED
    man="${BAO_MANIFEST:-}"
    [ -n "$man" ] && [ -f "$man" ] || fail MANIFEST_REQUIRED

    M=""; A=""; R=""; POL=""; MC=""; AC=""
    # Parse KEY=VALUE lines WITHOUT sourcing, so a manifest cannot execute code.
    while IFS='=' read -r k v; do
      case "$k" in
        MOUNT) M="$v" ;; AUTH) A="$v" ;; ROLE) R="$v" ;; POLICY) POL="$v" ;;
        MOUNT_CREATED) MC="$v" ;; AUTH_CREATED) AC="$v" ;;
      esac
    done < "$man"

    validate_name "$M"; validate_name "$A"; validate_name "$R"; validate_name "$POL"

    # Always remove the phase-specific role and policy created by that run.
    bao_ delete "auth/$A/role/$R" >/dev/null 2>&1 || true
    bao_ policy delete "$POL" >/dev/null 2>&1 || true
    # Disable mount/auth ONLY if THIS run created them — never a pre-existing one.
    if [ "$MC" = "1" ]; then bao_ secrets disable "$M" >/dev/null 2>&1 || true; fi
    if [ "$AC" = "1" ]; then bao_ auth disable "$A" >/dev/null 2>&1 || true; fi
    printf '[openbao-revoke] OK teardown role=%s policy=%s\n' "$R" "$POL"
    ;;

  *)
    fail UNKNOWN_ACTION
    ;;
esac

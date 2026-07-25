#!/usr/bin/env sh
# Hermes OS — OpenBao STAGING teardown (PHASE 94D0G).
#
# Operates ONLY on the dedicated staging project (hermes-openbao-staging) and its
# Compose file. It never uses `docker compose down -v` blindly, never prunes, and
# never touches hermes_internal, postgres/redis/uploads, application volumes or
# production Compose. Volume deletion is disabled by default and requires an
# explicit flag + exact confirmation + verified Compose project labels.
#
# Usage:
#   scripts/openbao-staging-teardown.sh down           # containers + network only
#   OPENBAO_TEARDOWN_CONFIRM=DELETE-STAGING-VOLUMES \
#     scripts/openbao-staging-teardown.sh purge-volumes # + the openbao_data volume ONLY
#   OPENBAO_RESTORE_TEST_PROJECT=<name> \
#   OPENBAO_RESTORE_TEST_CONFIRM=TEARDOWN-RESTORE-TEST \
#     scripts/openbao-staging-teardown.sh restore-test-down   # allow-listed only

set -eu
umask 077

fail() { printf '[openbao-staging-teardown] FAILED %s\n' "$1" >&2; exit 1; }

PROJECT="hermes-openbao-staging"
root="$(cd "$(dirname "$0")/.." && pwd -P)"
COMPOSE_FILE="${OPENBAO_STAGING_COMPOSE_FILE:-${root}/docker-compose.openbao-staging.yml}"

command -v docker >/dev/null 2>&1 || fail DOCKER_MISSING
[ -r "$COMPOSE_FILE" ] || fail COMPOSE_FILE_MISSING

ACTION="${1:-down}"

case "$ACTION" in
  down)
    # Stop + remove ONLY this project's containers and network. The openbao_data
    # volume is preserved, and the host audit directory (OPENBAO_STAGING_AUDIT_DIR)
    # with all audit logs is NEVER touched by this script.
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans || fail COMPOSE_DOWN_FAILED
    printf '[openbao-staging-teardown] OK removed containers+network for project %s (volume and audit logs preserved)\n' "$PROJECT"
    ;;

  purge-volumes)
    [ "${OPENBAO_TEARDOWN_CONFIRM:-}" = "DELETE-STAGING-VOLUMES" ] || fail CONFIRM_REQUIRED
    # Remove containers+network first (never -v).
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans || fail COMPOSE_DOWN_FAILED
    # ONLY the exact Compose-scoped Raft data volume is eligible, verified by its
    # Compose project label. There is no openbao_audit volume: the audit log lives
    # in the operator host directory, which this script NEVER deletes, truncates
    # or recurses into — audit retention is a separate operator process.
    vol="${PROJECT}_openbao_data"
    lbl="$(docker volume inspect -f '{{ index .Labels "com.docker.compose.project" }}' "$vol" 2>/dev/null || true)"
    if [ -z "$lbl" ]; then
      printf '  skip %s (absent)\n' "$vol"
    else
      [ "$lbl" = "$PROJECT" ] || fail VOLUME_PROJECT_LABEL_MISMATCH
      docker volume rm "$vol" >/dev/null 2>&1 || fail VOLUME_REMOVE_FAILED
      printf '  removed %s\n' "$vol"
    fi
    printf '[openbao-staging-teardown] OK purged staging data volume for project %s (audit logs untouched)\n' "$PROJECT"
    ;;

  restore-test-down)
    # Separately named throwaway restore-test project ONLY, via explicit allow-list.
    RT_PROJECT="${OPENBAO_RESTORE_TEST_PROJECT:-}"
    [ -n "$RT_PROJECT" ] || fail RESTORE_TEST_PROJECT_REQUIRED
    [ "$RT_PROJECT" = "$PROJECT" ] && fail REFUSE_MAIN_PROJECT
    [ "${OPENBAO_RESTORE_TEST_CONFIRM:-}" = "TEARDOWN-RESTORE-TEST" ] || fail CONFIRM_REQUIRED
    docker compose -p "$RT_PROJECT" -f "$COMPOSE_FILE" down --remove-orphans || fail COMPOSE_DOWN_FAILED
    printf '[openbao-staging-teardown] OK removed restore-test project %s (volumes preserved)\n' "$RT_PROJECT"
    ;;

  *)
    fail UNKNOWN_ACTION
    ;;
esac

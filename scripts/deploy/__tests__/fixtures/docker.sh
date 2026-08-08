#!/usr/bin/env bash
# TEST SHIM (not production) — records compose calls and models exec/inspect
# probes for openbao-activate.behaviour.test.ts. Never runs real docker.
log() { printf '%s\n' "$1" >> "$MOCK_CALLS"; }

DEFAULT_ACTIVE_MOUNTS=$'/run/secrets/openbao_role_id=false=/etc/hermes-openbao/runtime/role-id\n/run/secrets/openbao_secret_id=false=/etc/hermes-openbao/runtime/secret-id\n/run/secrets/openbao_ca=false=/etc/hermes-openbao/ca.crt'

if [ "$1" = "compose" ]; then
  active=0; case "$*" in *openbao*) active=1;; esac
  sub=""
  for a in "$@"; do case "$a" in up|ps|config) sub="$a"; break;; esac; done
  case "$sub" in
    up)
      if [ "$active" = 1 ]; then log "up:active"; exit "${MOCK_ACTIVE_UP_RC:-0}"; else log "up:base"; exit "${MOCK_BASE_UP_RC:-0}"; fi;;
    ps)
      if [ "$active" = 1 ]; then printf '%s\n' "${MOCK_ACTIVE_CID-activecid}"; else printf '%s\n' "${MOCK_BASE_CID-basecid}"; fi; exit 0;;
    config)
      log "config"; exit "${MOCK_CONFIG_RC:-0}";;
  esac
  exit 0
fi
if [ "$1" = "inspect" ]; then
  cid="${@: -1}"
  case "$*" in
    *State.Health*)
      if [ "$cid" = "basecid" ]; then echo "${MOCK_RB_HEALTH:-healthy}"; else echo "${MOCK_HEALTH:-healthy}"; fi; exit 0;;
    *.RW*)  # active-mount format (destination=RW=source)
      printf '%s\n' "${MOCK_ACTIVE_MOUNTS-$DEFAULT_ACTIVE_MOUNTS}"; exit 0;;
    *Mounts*)  # destination-only (base/rollback proof)
      printf '%s\n' "${MOCK_RB_MOUNTS-}"; exit 0;;
  esac
  exit 0
fi
if [ "$1" = "exec" ]; then
  cid="$2"; shift 2
  if [ "$1" = "cat" ]; then printf '%s\n' "${MOCK_HOSTS-10.0.0.5 openbao}"; exit 0; fi
  if [ "$1" = "id" ]; then
    [ "$2" = "-u" ] && { echo "${MOCK_CTR_UID:-1001}"; exit 0; }
    [ "$2" = "-g" ] && { echo "${MOCK_CTR_GID:-6000}"; exit 0; }
    exit 0
  fi
  if [ "$1" = "sh" ] && [ "$2" = "-c" ]; then
    expr="$3"
    case "$expr" in
      *"!= "*openbao*) [ "${MOCK_EXEC_BACKEND:-openbao}" != openbao ] && exit 0 || exit 1;;
      *"= openbao"*) [ "${MOCK_EXEC_BACKEND:-openbao}" = openbao ] && exit 0 || exit 1;;
      *"-r /run/secrets"*) [ "${MOCK_EXEC_SECRETS:-present}" = present ] && exit 0 || exit 1;;
      *"! -e /run/secrets"*) [ "${MOCK_EXEC_SECRETS:-absent}" = absent ] && exit 0 || exit 1;;
    esac
    exit 0
  fi
  exit 0
fi
exit 0

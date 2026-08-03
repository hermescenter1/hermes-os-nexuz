#!/usr/bin/env bash
# TEST SHIM (not production) — models passwordless-sudo validation of root-owned
# activation state for openbao-activate.behaviour.test.ts. Behaviour driven by
# MOCK_* env vars. Never touches real files.
[ "$1" = "-n" ] && shift
if [ "${MOCK_SUDO:-ok}" = "deny" ]; then echo "sudo: a password is required" >&2; exit 1; fi
cmd="$1"; shift
case "$cmd" in
  true) exit 0;;
  test)
    if [ "$1" = "-e" ]; then [ "${MOCK_MARKER_PRESENT:-present}" = present ] && exit 0 || exit 1; fi
    if [ "$1" = "-f" ]; then exit 0; fi
    if [ "$1" = "!" ] && [ "$2" = "-L" ]; then exit 0; fi
    exit 0;;
  stat)
    fmt="$2"; path="$4"
    case "$path" in
      *activation.env)
        [ "$fmt" = "%U:%G" ] && { echo "${MOCK_MARKER_OWNER:-root:root}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_MARKER_MODE:-600}"; exit 0; };;
      *ca.crt)
        [ "$fmt" = "%a" ] && { echo "${MOCK_CA_MODE:-644}"; exit 0; }
        [ "$fmt" = "%g" ] && { echo "0"; exit 0; }
        [ "$fmt" = "%U" ] && { echo "root"; exit 0; };;
      *)
        [ "$fmt" = "%U" ] && { echo "${MOCK_SRC_OWNER:-root}"; exit 0; }
        [ "$fmt" = "%g" ] && { echo "${MOCK_SRC_GID:-6000}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_SRC_MODE:-440}"; exit 0; };;
    esac
    echo "?"; exit 0;;
  cat)
    [ "${MOCK_MARKER_READABLE:-1}" = "0" ] && { echo "cat: permission denied" >&2; exit 1; }
    printf '%s\n' "${MOCK_MARKER_CONTENT}"; exit 0;;
  *) exit 0;;
esac

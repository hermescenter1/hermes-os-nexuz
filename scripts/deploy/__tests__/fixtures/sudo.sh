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
    if [ "$1" = "-d" ]; then exit 0; fi
    if [ "$1" = "-s" ]; then [ "${MOCK_CA_EMPTY:-0}" = "1" ] && exit 1 || exit 0; fi
    if [ "$1" = "!" ] && [ "$2" = "-L" ]; then exit 0; fi
    exit 0;;
  realpath)
    # realpath -e -- <path>
    path="$3"
    if [ -n "${MOCK_REALPATH_MUTATE_MATCH-}" ]; then
      case "$path" in *"$MOCK_REALPATH_MUTATE_MATCH"*) printf '%s\n' "${path}-noncanon"; exit 0;; esac
    fi
    printf '%s\n' "$path"; exit 0;;
  cmp)
    # cmp -s -- <canonical> <runtime>
    canon="$3"
    case "$canon" in
      *role-id) [ "${MOCK_CMP_ROLE:-match}" = match ] && exit 0 || exit 1;;
      *secret-id) [ "${MOCK_CMP_SECRET:-match}" = match ] && exit 0 || exit 1;;
    esac
    exit 0;;
  openssl)
    if [ "$1" = "version" ]; then [ "${MOCK_OPENSSL_MISSING:-0}" = "1" ] && exit 1 || exit 0; fi
    if [ "$1" = "x509" ]; then [ "${MOCK_CA_PEM_INVALID:-0}" = "1" ] && exit 1 || exit 0; fi
    exit 0;;
  stat)
    fmt="$2"; path="$4"
    case "$path" in
      */app/role-id | */app/secret-id)
        [ "$fmt" = "%U:%G" ] && { echo "${MOCK_CANON_OWNER:-root:root}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_CANON_MODE:-600}"; exit 0; };;
      */runtime/role-id | */runtime/secret-id)
        [ "$fmt" = "%U" ] && { echo "${MOCK_SRC_OWNER:-root}"; exit 0; }
        [ "$fmt" = "%g" ] && { echo "${MOCK_SRC_GID:-6000}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_SRC_MODE:-440}"; exit 0; };;
      *ca.crt)
        [ "$fmt" = "%U:%G" ] && { echo "${MOCK_CA_OWNER:-root:root}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_CA_MODE:-644}"; exit 0; }
        [ "$fmt" = "%g" ] && { echo "0"; exit 0; };;
      *activation.env)
        [ "$fmt" = "%U:%G" ] && { echo "${MOCK_MARKER_OWNER:-root:root}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_MARKER_MODE:-600}"; exit 0; };;
      *runtime)
        [ "$fmt" = "%U:%G" ] && { echo "${MOCK_RTDIR_OWNER:-root:root}"; exit 0; }
        [ "$fmt" = "%a" ] && { echo "${MOCK_RTDIR_MODE:-710}"; exit 0; };;
    esac
    echo "?"; exit 0;;
  cat)
    [ "${MOCK_MARKER_READABLE:-1}" = "0" ] && { echo "cat: permission denied" >&2; exit 1; }
    printf '%s\n' "${MOCK_MARKER_CONTENT}"; exit 0;;
  *) exit 0;;
esac

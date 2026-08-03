#!/usr/bin/env bash
# TEST SHIM (not production) — host `id` for openbao-activate.behaviour.test.ts.
case "$1" in
  -u) echo "${MOCK_ID_U:-1000}";;
  -g) echo "${MOCK_ID_HG:-1000}";;
  -G) echo "${MOCK_ID_G:-1000 27}";;
  *) echo "uid=${MOCK_ID_U:-1000}";;
esac

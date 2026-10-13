#!/usr/bin/env bash
# Provision EXECUTIVE_REPORT_WORKER_TOKEN in the production env file — ON THE HOST.
#
#   scripts/executive/provision-report-worker-token.sh [path/to/.env.production]
#
# The nightly report runner and hermes-web authenticate each other with this
# bearer token. It is generated HERE, on the server, from the kernel's CSPRNG,
# and written straight into the env file. It is never printed, never passed on a
# command line, never logged, and never leaves the host — so it is not in Git,
# not in a CI log, not in a chat transcript.
#
# IDEMPOTENT: when a well-formed token already exists it is left untouched and
# the script exits 0. A malformed or duplicated value is refused (exit 3) — that
# needs a human. Replacing a live token would break the running runner until
# hermes-web is recreated, so a ROTATION is deliberate: remove the line, run again.
# Refuses (exit 4) when the file is missing or is not a regular file.
#
# After it succeeds, hermes-web must be RECREATED to read the new value (an env
# file is read when a container is created): redeploy the same commit through
# the deploy workflow, then start hermes-executive-report-worker. See
# docs/executive-dashboard/RUNNER-ACTIVATION.md.

set -euo pipefail

ENV_FILE="${1:-.env.production}"
NAME="EXECUTIVE_REPORT_WORKER_TOKEN"

if [ ! -f "$ENV_FILE" ] || [ -L "$ENV_FILE" ]; then
  echo "refusing: $ENV_FILE is not a regular file" >&2
  exit 4
fi

existing="$(grep -c "^${NAME}=" "$ENV_FILE" || true)"
if [ "$existing" -gt 1 ]; then
  echo "refusing: ${NAME} appears ${existing} times in ${ENV_FILE}; leave exactly one deliberately" >&2
  exit 3
fi
if [ "$existing" = "1" ]; then
  # IDEMPOTENT: a well-formed token is left exactly as it is — replacing a live
  # token would break the running runner until hermes-web is recreated. Only
  # the SHAPE is checked; the value is never printed.
  if grep -Eq "^${NAME}=[0-9a-f]{64}$" "$ENV_FILE"; then
    echo "${NAME} is already present in ${ENV_FILE} and well-formed; left unchanged."
    exit 0
  fi
  echo "refusing: ${NAME} in ${ENV_FILE} is not a 64-hex token; fix or remove that line deliberately" >&2
  exit 3
fi

# 32 random bytes as 64 lowercase hex characters: no character that needs
# quoting in an env file or a shell.
if command -v openssl >/dev/null 2>&1; then
  token="$(openssl rand -hex 32)"
else
  token="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi
if ! printf '%s' "$token" | grep -Eq '^[0-9a-f]{64}$'; then
  unset token
  echo "refusing: could not generate a 64-hex token" >&2
  exit 5
fi

# Append without changing the file's owner or mode. A file that does not end
# in a newline gets one first, so the new line cannot fuse with the last one.
if [ -s "$ENV_FILE" ] && [ "$(tail -c 1 "$ENV_FILE" | od -An -c | tr -d ' ')" != '\n' ]; then
  printf '\n' >> "$ENV_FILE"
fi
printf '%s=%s\n' "$NAME" "$token" >> "$ENV_FILE"
unset token

count="$(grep -c "^${NAME}=" "$ENV_FILE" || true)"
if [ "$count" != "1" ]; then
  echo "error: expected exactly one ${NAME} line, found ${count}" >&2
  exit 6
fi

echo "${NAME} added to ${ENV_FILE} (64 hex characters; the value is not shown)."
echo "Next: recreate hermes-web (redeploy this commit), then start hermes-executive-report-worker."

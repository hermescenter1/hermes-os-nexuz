#!/usr/bin/env bash
#
# DA-3 (remainder) — put the previous release back, and say what came back.
#
# WHY A SCRIPT. This logic used to live inline in deploy.yml, which meant the
# one path that runs when production is already broken had never been executed
# anywhere. A rollback that fails is worse than no rollback: the container has
# ALREADY been replaced by the time it runs. Here each branch — a missing
# preserved image, an image with no revision label, a rollback that comes back
# unhealthy — can be driven against real images and real containers.
#
# WHAT IT DOES NOT DO. It does not decide WHETHER to roll back; the caller has
# already judged the release bad. It does not touch the database, run
# migrations, prune anything or rebuild. It retags one preserved image and asks
# Compose to bring that service back up.
#
# WHAT THE REVISION LINE IS WORTH. The label is read from the IMAGE the
# rolled-back container is bound to, never from the container (whose labels can
# be set at run time) and never from a tag. It is metadata, not a signature:
# it says which commit the build CLAIMED, not that the bytes came from it. An
# image with no label is reported as an ABSENCE of evidence — separately, as a
# warning — and never as a second failure or as a pass.
#
# Usage:
#   rollback-to-previous-good.sh [--project P] [--file F] [--env-file E]
#                                [--service S] [--preserved TAG]
#                                [--health-timeout SECONDS]
#
# `DOCKER_BIN` overrides the docker executable, which is how the tests drive
# the Compose steps without a production stack.
#
# Prints ROLLBACK key=value lines.
#   exit 0 — the previous release is back AND healthy
#   exit 1 — it could not be put back, or it came back unhealthy
#
# The CALLER must still fail its own run: a rollback is a recovered failure,
# never a completed release.
set -uo pipefail

PROJECT="hermes"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
SERVICE="hermes-web"
PRESERVED="hermes-web:previous-good"
HEALTH_TIMEOUT=240

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="${2:-}"; shift 2 ;;
    --file) COMPOSE_FILE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --service) SERVICE="${2:-}"; shift 2 ;;
    --preserved) PRESERVED="${2:-}"; shift 2 ;;
    --health-timeout) HEALTH_TIMEOUT="${2:-}"; shift 2 ;;
    *) echo "Refusing: unknown argument '$1'" >&2; exit 1 ;;
  esac
done

DOCKER="${DOCKER_BIN:-docker}"

emit() { printf 'ROLLBACK %s\n' "$1"; }
fail() {
  emit "result=$1"
  echo "Rollback: $2" >&2
  exit 1
}

case "${HEALTH_TIMEOUT}" in
  ''|*[!0-9]*) fail "BAD_TIMEOUT" "the health timeout must be a whole number of seconds" ;;
esac
[ "${HEALTH_TIMEOUT}" -ge 1 ] || fail "BAD_TIMEOUT" "the health timeout must be at least one second"

compose() {
  "${DOCKER}" compose -p "${PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@" </dev/null
}

# ── The target must exist BEFORE anything is changed ─────────────────────────
# Without it there is nothing to go back to, and the honest outcome is to stop
# and say so rather than leave a half-finished attempt behind.
if ! "${DOCKER}" image inspect "${PRESERVED}" >/dev/null 2>&1 </dev/null; then
  fail "NO_PRESERVED_IMAGE" "${PRESERVED} is missing; production needs a human now."
fi
PRESERVED_ID="$("${DOCKER}" image inspect -f '{{.Id}}' "${PRESERVED}" </dev/null 2>/dev/null || true)"
[ -n "${PRESERVED_ID}" ] || fail "NO_PRESERVED_IMAGE" "${PRESERVED} could not be resolved to an image id."
emit "preserved_image=${PRESERVED_ID}"

# Compose builds this service as <project>-<service>; pointing that name at the
# preserved image is what makes `up -d` bring the OLD release back rather than
# the one just rejected.
BUILT_TAG="${PROJECT}-${SERVICE}:latest"
"${DOCKER}" tag "${PRESERVED}" "${BUILT_TAG}" </dev/null \
  || fail "TAG_FAILED" "could not point ${BUILT_TAG} at ${PRESERVED}."

compose up -d --no-deps --no-build "${SERVICE}" \
  || fail "UP_FAILED" "compose could not bring ${SERVICE} back up."

CID="$(compose ps -q "${SERVICE}" 2>/dev/null | head -n 1)"
[ -n "${CID}" ] || fail "NO_CONTAINER" "no ${SERVICE} container is running after the rollback."
emit "container=${CID}"

IMAGE_ID="$("${DOCKER}" inspect -f '{{.Image}}' "${CID}" </dev/null 2>/dev/null || true)"
[ -n "${IMAGE_ID}" ] || fail "NO_IMAGE" "the rolled-back container is bound to no readable image."
emit "image=${IMAGE_ID}"

# The container must actually be running the image we put back. A Compose file
# that pins its own image, or a stale container Compose decided to keep, would
# otherwise read as a successful rollback to something else entirely.
if [ "${IMAGE_ID}" != "${PRESERVED_ID}" ]; then
  fail "WRONG_IMAGE" "the container runs ${IMAGE_ID}, not the preserved ${PRESERVED_ID}."
fi

# ── What the rolled-back release claims about itself ─────────────────────────
REVISION="$("${DOCKER}" inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${IMAGE_ID}" </dev/null 2>/dev/null || true)"
[ "${REVISION}" = "<no value>" ] && REVISION=""
if [ -z "${REVISION}" ]; then
  # An absence of evidence about the rolled-back release. Not a failure of the
  # rollback, and not a pass either.
  emit "revision=UNKNOWN"
  echo "::warning::Rolled back to ${PRESERVED} (${IMAGE_ID}), which carries NO revision label. Its commit is unattested; it predates the label or was built without one." >&2
else
  emit "revision=${REVISION}"
fi

# ── The release that came back must itself be healthy ────────────────────────
# Otherwise the rollback has replaced one broken state with another.
DEADLINE=$(( HEALTH_TIMEOUT / 5 ))
[ "${DEADLINE}" -ge 1 ] || DEADLINE=1
STATE="gone none"
for _ in $(seq 1 "${DEADLINE}"); do
  STATE="$("${DOCKER}" inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CID}" </dev/null 2>/dev/null || echo "gone none")"
  case "${STATE}" in
    "running healthy"|"running none") emit "state=${STATE}"; emit "result=ROLLED_BACK"; echo "Rollback is healthy." >&2; exit 0 ;;
    "running unhealthy") break ;;
  esac
  sleep 5
done

emit "state=${STATE}"
fail "UNHEALTHY" "the rolled-back container is NOT healthy (${STATE}). Production needs a human now."

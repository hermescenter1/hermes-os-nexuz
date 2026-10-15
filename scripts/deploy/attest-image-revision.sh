#!/usr/bin/env bash
#
# DA-3 — match the revision METADATA of the image a container is running
# against the SHA a release deployed.
#
# WHAT THIS IS. A check that the image bound to the running container carries
# `org.opencontainers.image.revision` equal to the target commit, and that
# nothing has been layered on top of the container to say otherwise.
#
# WHAT THIS IS NOT, and must never be described as:
#   · an image SIGNATURE — nothing here is signed and nothing is verified
#     against a key;
#   · proof that the image CONTENTS correspond to that commit — a label is
#     metadata, set at build time by whoever ran the build. It proves the
#     build was STAMPED with that commit, not that the bytes were produced
#     from it.
# It closes one specific gap: that `git rev-parse HEAD` and `docker ps`
# together said nothing about which commit the serving container came from.
#
# WHY THE IMAGE AND NOT THE CONTAINER. `docker inspect <container>` reports
# `.Config.Labels` merged with any labels the container was created with, and
# compose can set those. Reading the container would therefore let a label
# added at run time satisfy a check about the build. This reads the label from
# the IMAGE ID the container is actually running — `.Image`, a content
# address, not a tag — and then refuses if the container's own view disagrees,
# because a disagreement is itself an attempt to dress the container up.
#
# Tags are never consulted: a tag can be moved between images at any moment,
# and "the image called hermes-web:latest" is not the same question as "the
# image this container is running".
#
# Usage:  attest-image-revision.sh <expected-full-sha> <container-id>
# Prints: ATTEST container_id=… / image_id=… / revision=… / result=…
# Exit:   0 only on result=MATCH
set -uo pipefail

EXPECTED="${1:-}"
CONTAINER="${2:-}"

emit() { printf 'ATTEST %s\n' "$1"; }
fail() {
  emit "result=$1"
  [ -n "${2:-}" ] && echo "Refusing: $2" >&2
  exit 1
}

# A full 40-character lowercase hex commit. A short SHA is ambiguous and must
# not be accepted as the target of a release.
case "${EXPECTED}" in
  *[!0-9a-f]* | "") fail "BAD_EXPECTED" "the expected revision is not lowercase hex: '${EXPECTED}'" ;;
esac
if [ "${#EXPECTED}" -ne 40 ]; then
  fail "BAD_EXPECTED" "the expected revision must be a full 40-character SHA, got ${#EXPECTED} characters"
fi

emit "expected=${EXPECTED}"

if [ -z "${CONTAINER}" ]; then
  fail "NO_CONTAINER" "no running container was given to attest"
fi
CONTAINER_ID="$(docker inspect -f '{{.Id}}' "${CONTAINER}" 2>/dev/null </dev/null)" || true
if [ -z "${CONTAINER_ID}" ]; then
  fail "NO_CONTAINER" "container '${CONTAINER}' does not exist"
fi
emit "container_id=${CONTAINER_ID}"

# The image the container is RUNNING, by content address. Not its tag.
IMAGE_ID="$(docker inspect -f '{{.Image}}' "${CONTAINER_ID}" 2>/dev/null </dev/null)" || true
if [ -z "${IMAGE_ID}" ]; then
  fail "NO_IMAGE" "cannot resolve the image of container ${CONTAINER_ID}"
fi
emit "image_id=${IMAGE_ID}"

LABEL='{{ index .Config.Labels "org.opencontainers.image.revision" }}'
REVISION="$(docker inspect -f "${LABEL}" "${IMAGE_ID}" 2>/dev/null </dev/null)" || true
# `docker inspect` prints the Go zero value for a missing key.
[ "${REVISION}" = "<no value>" ] && REVISION=""
emit "revision=${REVISION}"

if [ -z "${REVISION}" ]; then
  fail "NO_REVISION" "the running image carries no org.opencontainers.image.revision label"
fi
if [ "${REVISION}" = "unknown" ]; then
  fail "UNKNOWN_REVISION" "the running image was built without a revision (GIT_REVISION defaulted to 'unknown')"
fi
case "${REVISION}" in
  *[!0-9a-f]*) fail "REVISION_NOT_HEX" "the image revision is not lowercase hex: '${REVISION}'" ;;
esac
if [ "${#REVISION}" -ne 40 ]; then
  fail "REVISION_NOT_FULL_SHA" "the image revision is ${#REVISION} characters, not a full SHA: '${REVISION}'"
fi

# The container's own view. A difference means a label was layered on at run
# time, which is exactly the dressing-up this check exists to notice.
CONTAINER_REVISION="$(docker inspect -f "${LABEL}" "${CONTAINER_ID}" 2>/dev/null </dev/null)" || true
[ "${CONTAINER_REVISION}" = "<no value>" ] && CONTAINER_REVISION=""
emit "container_revision=${CONTAINER_REVISION}"
if [ -n "${CONTAINER_REVISION}" ] && [ "${CONTAINER_REVISION}" != "${REVISION}" ]; then
  fail "CONTAINER_LABEL_OVERRIDE" \
    "the container reports revision '${CONTAINER_REVISION}' while its image reports '${REVISION}'"
fi

if [ "${REVISION}" != "${EXPECTED}" ]; then
  fail "MISMATCH" "the running image reports revision '${REVISION}', not ${EXPECTED}"
fi

emit "result=MATCH"
echo "Image revision metadata matches the target SHA: ${EXPECTED} (image ${IMAGE_ID})."

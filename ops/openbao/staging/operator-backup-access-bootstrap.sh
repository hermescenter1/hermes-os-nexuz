#!/usr/bin/env bash
# PHASE 94D0F-O1 — source-controlled CANDIDATE bootstrap for limited STAGING
# operator access and a backup-only AppRole.
#
# DO NOT DEPLOY OR RUN UNTIL THIS PATCH IS REVIEWED AND MERGED.
#
# Required environment:
#   BAO_ADDR       exactly https://127.0.0.1:8200
#   BAO_CACERT     readable staging CA file
#   BAO_TOKEN      initial root token, environment only, never printed/stored
#   BAO_OUT_DIR    existing empty directory outside the repository, mode 0700
#
# Optional:
#   BAO_CLI        default: bao
#
# Created fixed-name resources:
#   policy: hermes-staging-operator
#   policy: hermes-staging-raft-backup
#   auth:   hermes-userpass/ (userpass)
#   user:   hermes-staging-operator
#   role:   approle/hermes-staging-raft-backup
#
# Secret output files, all mode 0600:
#   operator_username
#   operator_password
#   backup_role_id
#   backup_secret_id
#   backup_secret_id_accessor
#   created.manifest

set -Eeuo pipefail
umask 077

BAO_CLI="${BAO_CLI:-bao}"

OPERATOR_POLICY="hermes-staging-operator"
BACKUP_POLICY="hermes-staging-raft-backup"
USERPASS_MOUNT="hermes-userpass"
OPERATOR_USER="hermes-staging-operator"
APPROLE_MOUNT="approle"
BACKUP_ROLE="hermes-staging-raft-backup"
GATEWAY_ROLE="hermes-gateway-staging"

ROOT_TOKEN=""
OPERATOR_PASSWORD=""
USERPASS_CREATED=0
BACKUP_ROLE_CREATED=0
OPERATOR_POLICY_CREATED=0
BACKUP_POLICY_CREATED=0
SUCCESS=0

fail() {
  printf '[openbao-operator-bootstrap] FAILED %s\n' "$1" >&2
  exit 1
}

bao_() {
  "${BAO_CLI}" "$@"
}

secure_remove_file() {
  local path="$1"
  if [[ -f "${path}" && ! -L "${path}" ]]; then
    : >"${path}" 2>/dev/null || true
    chmod 0600 "${path}" 2>/dev/null || true
    rm -f -- "${path}" 2>/dev/null || true
  fi
}

rollback() {
  local rc=$?
  set +e

  OPERATOR_PASSWORD=""
  ROOT_TOKEN=""

  if [[ "${SUCCESS}" -ne 1 && -n "${VAULT_TOKEN:-}" ]]; then
    if [[ "${BACKUP_ROLE_CREATED}" -eq 1 ]]; then
      bao_ delete "auth/${APPROLE_MOUNT}/role/${BACKUP_ROLE}" >/dev/null 2>&1 || true
    fi

    if [[ "${USERPASS_CREATED}" -eq 1 ]]; then
      bao_ auth disable "${USERPASS_MOUNT}" >/dev/null 2>&1 || true
    fi

    if [[ "${BACKUP_POLICY_CREATED}" -eq 1 ]]; then
      bao_ policy delete "${BACKUP_POLICY}" >/dev/null 2>&1 || true
    fi

    if [[ "${OPERATOR_POLICY_CREATED}" -eq 1 ]]; then
      bao_ policy delete "${OPERATOR_POLICY}" >/dev/null 2>&1 || true
    fi
  fi

  if [[ -n "${OUT_REAL:-}" ]]; then
    for name in \
      operator_username \
      operator_password \
      backup_role_id \
      backup_secret_id \
      backup_secret_id_accessor \
      created.manifest
    do
      secure_remove_file "${OUT_REAL}/${name}"
    done
  fi

  unset ROOT_TOKEN OPERATOR_PASSWORD BAO_TOKEN VAULT_TOKEN BAO_ADDR VAULT_ADDR
  exit "${rc}"
}
trap rollback EXIT

[[ "${BAO_ADDR:-}" == "https://127.0.0.1:8200" ]] ||
  fail ENDPOINT_GATE

[[ -n "${BAO_CACERT:-}" && -r "${BAO_CACERT}" ]] ||
  fail CACERT_GATE

[[ -n "${BAO_TOKEN:-}" ]] ||
  fail ROOT_TOKEN_GATE

[[ -n "${BAO_OUT_DIR:-}" && -d "${BAO_OUT_DIR}" && ! -L "${BAO_OUT_DIR}" ]] ||
  fail OUT_DIR_GATE

[[ "$(stat -c '%a %u:%g' "${BAO_OUT_DIR}")" == "700 0:0" ]] ||
  fail OUT_DIR_PERMISSION_GATE

repo_root="$(cd "$(dirname "$0")/../../.." && pwd -P)"
OUT_REAL="$(cd "${BAO_OUT_DIR}" && pwd -P)"

case "${OUT_REAL}/" in
  "${repo_root}/"*) fail OUT_DIR_INSIDE_REPO ;;
esac

if find "${OUT_REAL}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  fail OUT_DIR_NOT_EMPTY
fi

OPERATOR_POLICY_FILE="${repo_root}/ops/openbao/policy/hermes-staging-operator.hcl"
BACKUP_POLICY_FILE="${repo_root}/ops/openbao/policy/hermes-staging-raft-backup.hcl"

[[ -f "${OPERATOR_POLICY_FILE}" && ! -L "${OPERATOR_POLICY_FILE}" ]] ||
  fail OPERATOR_POLICY_FILE_GATE

[[ -f "${BACKUP_POLICY_FILE}" && ! -L "${BACKUP_POLICY_FILE}" ]] ||
  fail BACKUP_POLICY_FILE_GATE

export VAULT_ADDR="${BAO_ADDR}"
export VAULT_CACERT="${BAO_CACERT}"
export VAULT_TOKEN="${BAO_TOKEN}"

ROOT_TOKEN="${BAO_TOKEN}"
unset BAO_TOKEN
ROOT_TOKEN=""

bao_ token lookup -format=json |
python3 -c '
import json, sys
data = json.load(sys.stdin).get("data", {})
policies = data.get("policies", [])
if not isinstance(policies, list) or "root" not in policies:
    raise SystemExit(1)
print("ROOT_POLICY_PREFLIGHT_GATE=PASS")
'

bao_ auth list -format=json |
python3 -c '
import json, sys
payload = json.load(sys.stdin)
data = payload.get("data", payload)
approle = data.get("approle/")
userpass = data.get("hermes-userpass/")
if not isinstance(approle, dict) or approle.get("type") != "approle":
    raise SystemExit(1)
if userpass is not None:
    raise SystemExit(2)
print("APPROLE_MOUNT_PREFLIGHT_GATE=PASS")
print("USERPASS_MOUNT_ABSENT_GATE=PASS")
'

if bao_ policy read "${OPERATOR_POLICY}" >/dev/null 2>&1; then
  fail OPERATOR_POLICY_ALREADY_EXISTS
fi

if bao_ policy read "${BACKUP_POLICY}" >/dev/null 2>&1; then
  fail BACKUP_POLICY_ALREADY_EXISTS
fi

if bao_ read "auth/${APPROLE_MOUNT}/role/${BACKUP_ROLE}" >/dev/null 2>&1; then
  fail BACKUP_ROLE_ALREADY_EXISTS
fi

bao_ read "auth/${APPROLE_MOUNT}/role/${GATEWAY_ROLE}" >/dev/null ||
  fail GATEWAY_ROLE_PREFLIGHT_GATE

bao_ policy write "${OPERATOR_POLICY}" "${OPERATOR_POLICY_FILE}" >/dev/null
OPERATOR_POLICY_CREATED=1

bao_ policy write "${BACKUP_POLICY}" "${BACKUP_POLICY_FILE}" >/dev/null
BACKUP_POLICY_CREATED=1

bao_ auth enable -path="${USERPASS_MOUNT}" userpass >/dev/null
USERPASS_CREATED=1

# No client-CIDR binding is hard-coded here. Requests reach OpenBao through
# Docker's loopback-published NAT path, so the address observed by OpenBao
# must be measured and validated before a later phase adds any CIDR binding.
bao_ write "auth/${APPROLE_MOUNT}/role/${BACKUP_ROLE}" \
  bind_secret_id=true \
  token_type=service \
  token_policies="${BACKUP_POLICY}" \
  token_no_default_policy=true \
  token_ttl=10m \
  token_max_ttl=30m \
  token_num_uses=0 \
  secret_id_ttl=1h \
  secret_id_num_uses=5 \
  >/dev/null
BACKUP_ROLE_CREATED=1

OPERATOR_PASSWORD="$(
  python3 -c 'import secrets; print(secrets.token_urlsafe(36), end="")'
)"

[[ "${#OPERATOR_PASSWORD}" -ge 40 ]] ||
  fail OPERATOR_PASSWORD_GENERATION_GATE

printf '%s' "${OPERATOR_PASSWORD}" |
bao_ write "auth/${USERPASS_MOUNT}/users/${OPERATOR_USER}" \
  password=- \
  token_policies="${OPERATOR_POLICY}" \
  token_no_default_policy=true \
  token_ttl=15m \
  token_max_ttl=1h \
  token_num_uses=0 \
  token_type=service \
  >/dev/null

write_atomic() {
  local destination="$1"
  local value="$2"
  local temporary="${destination}.tmp.$$"

  printf '%s' "${value}" >"${temporary}"
  chmod 0600 "${temporary}"
  mv "${temporary}" "${destination}"
}

write_atomic "${OUT_REAL}/operator_username" "${OPERATOR_USER}"
write_atomic "${OUT_REAL}/operator_password" "${OPERATOR_PASSWORD}"
OPERATOR_PASSWORD=""

role_id="$(
  bao_ read \
    -field=role_id \
    "auth/${APPROLE_MOUNT}/role/${BACKUP_ROLE}/role-id"
)"
[[ -n "${role_id}" ]] ||
  fail BACKUP_ROLE_ID_GATE
write_atomic "${OUT_REAL}/backup_role_id" "${role_id}"
role_id=""

bao_ write \
  -f \
  -format=json \
  "auth/${APPROLE_MOUNT}/role/${BACKUP_ROLE}/secret-id" |
python3 -c '
import json
import os
from pathlib import Path
import sys

payload = json.load(sys.stdin)
data = payload.get("data") if isinstance(payload, dict) else None

if not isinstance(data, dict):
    raise SystemExit(1)

secret_id = data.get("secret_id")
accessor = data.get("secret_id_accessor")

if not isinstance(secret_id, str) or not secret_id:
    raise SystemExit(1)

if not isinstance(accessor, str) or not accessor:
    raise SystemExit(1)

for destination, value in (
    (Path(sys.argv[1]), secret_id),
    (Path(sys.argv[2]), accessor),
):
    temporary = destination.with_name(
        destination.name + f".tmp.{os.getpid()}"
    )
    with open(temporary, "x", encoding="utf-8") as handle:
        os.chmod(temporary, 0o600)
        handle.write(value)
    os.replace(temporary, destination)
    os.chmod(destination, 0o600)
' \
  "${OUT_REAL}/backup_secret_id" \
  "${OUT_REAL}/backup_secret_id_accessor"

manifest_tmp="${OUT_REAL}/created.manifest.tmp.$$"
{
  printf 'SCHEMA=%s\n' 'hermes-openbao-operator-bootstrap-v1'
  printf 'OPERATOR_POLICY=%s\n' "${OPERATOR_POLICY}"
  printf 'BACKUP_POLICY=%s\n' "${BACKUP_POLICY}"
  printf 'USERPASS_MOUNT=%s\n' "${USERPASS_MOUNT}"
  printf 'OPERATOR_USER=%s\n' "${OPERATOR_USER}"
  printf 'APPROLE_MOUNT=%s\n' "${APPROLE_MOUNT}"
  printf 'BACKUP_ROLE=%s\n' "${BACKUP_ROLE}"
  printf 'GATEWAY_ROLE=%s\n' "${GATEWAY_ROLE}"
} >"${manifest_tmp}"
chmod 0600 "${manifest_tmp}"
mv "${manifest_tmp}" "${OUT_REAL}/created.manifest"

for name in \
  operator_username \
  operator_password \
  backup_role_id \
  backup_secret_id \
  backup_secret_id_accessor \
  created.manifest
do
  [[ -f "${OUT_REAL}/${name}" && ! -L "${OUT_REAL}/${name}" ]] ||
    fail OUTPUT_FILE_GATE

  [[ "$(stat -c '%a %u:%g' "${OUT_REAL}/${name}")" == "600 0:0" ]] ||
    fail OUTPUT_PERMISSION_GATE
done

SUCCESS=1
unset VAULT_TOKEN

printf '%s\n' \
  "OPERATOR_POLICY_CREATED=PASS" \
  "BACKUP_POLICY_CREATED=PASS" \
  "USERPASS_AUTH_CREATED=PASS" \
  "OPERATOR_USER_CREATED=PASS" \
  "BACKUP_APPROLE_CREATED=PASS" \
  "CREDENTIAL_OUTPUT_GATE=PASS" \
  "CREDENTIAL_OUTPUT_PERMISSION_GATE=PASS" \
  "PHASE_94D0F_OPERATOR_BACKUP_BOOTSTRAP=PASS" \
  "ROOT_TOKEN_USED=True" \
  "ROOT_TOKEN_REVOKED=False" \
  "PRODUCTION_TOUCHED=False"

trap - EXIT
unset ROOT_TOKEN OPERATOR_PASSWORD BAO_TOKEN VAULT_TOKEN BAO_ADDR VAULT_ADDR

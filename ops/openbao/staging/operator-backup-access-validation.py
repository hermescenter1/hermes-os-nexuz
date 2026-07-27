#!/usr/bin/env python3
"""PHASE 94D0F-O1 — validate limited STAGING operator + backup access.

DO NOT DEPLOY OR RUN UNTIL THIS PATCH IS REVIEWED AND MERGED.

The validator:
- never uses a root token;
- logs in through the fixed userpass account;
- validates exact policy/TTL/no-default properties;
- proves the operator can issue and destroy one temporary Gateway SecretID;
- logs in with the bootstrap backup AppRole credential;
- checks capabilities without attempting destructive endpoints;
- takes one temporary Raft snapshot using the backup-only token;
- destroys the bootstrap backup SecretID by accessor;
- self-revokes both issued tokens;
- prints no credential, token, accessor, password or snapshot content.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import ssl
import sys
import tempfile
import urllib.error
import urllib.request

EXPECTED_ADDR = "https://127.0.0.1:8200"
OPERATOR_POLICY = "hermes-staging-operator"
BACKUP_POLICY = "hermes-staging-raft-backup"
USERPASS_MOUNT = "hermes-userpass"
OPERATOR_USER = "hermes-staging-operator"
APPROLE_MOUNT = "approle"
BACKUP_ROLE = "hermes-staging-raft-backup"
GATEWAY_ROLE = "hermes-gateway-staging"

operator_token: str | None = None
backup_token: str | None = None
temporary_gateway_accessor: str | None = None
backup_secret_destroyed = False
snapshot_path: Path | None = None


def fail(code: str) -> "NoReturn":
    raise RuntimeError(code)


def read_secret_file(path: Path) -> str:
    if not path.is_file() or path.is_symlink():
        fail("CREDENTIAL_FILE_GATE=FAIL")

    mode = path.stat().st_mode & 0o777
    if mode != 0o600:
        fail("CREDENTIAL_FILE_PERMISSION_GATE=FAIL")

    value = path.read_text(encoding="utf-8")
    if not value or any(character.isspace() for character in value):
        fail("CREDENTIAL_FILE_SHAPE_GATE=FAIL")

    return value


addr = os.environ.get("BAO_ADDR", "")
cacert = os.environ.get("BAO_CACERT", "")
out_dir_text = os.environ.get("BAO_OUT_DIR", "")

if addr != EXPECTED_ADDR:
    fail("ENDPOINT_GATE=FAIL")

if not cacert or not Path(cacert).is_file():
    fail("CACERT_GATE=FAIL")

out_dir = Path(out_dir_text)
if not out_dir.is_dir() or out_dir.is_symlink():
    fail("OUT_DIR_GATE=FAIL")

if (out_dir.stat().st_mode & 0o777) != 0o700:
    fail("OUT_DIR_PERMISSION_GATE=FAIL")

username = read_secret_file(out_dir / "operator_username")
password = read_secret_file(out_dir / "operator_password")
backup_role_id = read_secret_file(out_dir / "backup_role_id")
backup_secret_id = read_secret_file(out_dir / "backup_secret_id")
backup_secret_accessor = read_secret_file(
    out_dir / "backup_secret_id_accessor"
)

if username != OPERATOR_USER:
    fail("OPERATOR_USERNAME_GATE=FAIL")

context = ssl.create_default_context(cafile=cacert)
base = f"{addr}/v1"


def request(
    method: str,
    api_path: str,
    *,
    token: str | None = None,
    body: object | None = None,
    binary: bool = False,
    expected_error: set[int] | None = None,
) -> tuple[int, object | bytes | None]:
    data: bytes | None = None
    headers = {"Accept": "application/json"}

    if token:
        headers["X-Vault-Token"] = token

    if body is not None:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(
        f"{base}/{api_path.lstrip('/')}",
        data=data,
        method=method,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(
            req,
            context=context,
            timeout=30,
        ) as response:
            status = response.status
            payload = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        payload = error.read()

        if expected_error and status in expected_error:
            return status, None

        fail(f"HTTP_{status}_GATE=FAIL")
    except Exception:
        fail("NETWORK_GATE=FAIL")

    if binary:
        return status, payload

    if not payload:
        return status, None

    try:
        return status, json.loads(payload.decode("utf-8"))
    except Exception:
        fail("JSON_RESPONSE_GATE=FAIL")


def extract_token(
    payload: object | bytes | None,
    expected_policy: str,
    maximum_ttl: int,
) -> str:
    if not isinstance(payload, dict):
        fail("TOKEN_RESPONSE_SHAPE_GATE=FAIL")

    auth = payload.get("auth")
    if not isinstance(auth, dict):
        fail("TOKEN_RESPONSE_SHAPE_GATE=FAIL")

    token = auth.get("client_token")
    policies = auth.get("policies")
    ttl = auth.get("lease_duration")

    if not isinstance(token, str) or not token:
        fail("TOKEN_RESPONSE_SHAPE_GATE=FAIL")

    if not isinstance(policies, list) or policies != [expected_policy]:
        fail("TOKEN_POLICY_GATE=FAIL")

    if "default" in policies:
        fail("TOKEN_NO_DEFAULT_POLICY_GATE=FAIL")

    if not isinstance(ttl, int) or ttl <= 0 or ttl > maximum_ttl:
        fail("TOKEN_TTL_GATE=FAIL")

    return token


def revoke_self(token: str | None) -> None:
    if not token:
        return

    try:
        request(
            "POST",
            "auth/token/revoke-self",
            token=token,
            body={},
        )
    except Exception:
        pass


try:
    _, operator_login = request(
        "POST",
        f"auth/{USERPASS_MOUNT}/login/{OPERATOR_USER}",
        body={"password": password},
    )

    password = ""
    operator_token = extract_token(
        operator_login,
        OPERATOR_POLICY,
        900,
    )

    print("OPERATOR_LOGIN_GATE=PASS")
    print("OPERATOR_TOKEN_POLICY_GATE=PASS")
    print("OPERATOR_TOKEN_NO_DEFAULT_POLICY_GATE=PASS")
    print("OPERATOR_TOKEN_TTL_GATE=PASS")

    _, operator_lookup = request(
        "GET",
        "auth/token/lookup-self",
        token=operator_token,
    )

    if not isinstance(operator_lookup, dict):
        fail("OPERATOR_LOOKUP_SELF_GATE=FAIL")

    print("OPERATOR_LOOKUP_SELF_GATE=PASS")

    for path in (
        f"sys/policies/acl/{OPERATOR_POLICY}",
        f"sys/policies/acl/{BACKUP_POLICY}",
        "sys/policies/acl/hermes-gateway-kv-staging",
        f"auth/{APPROLE_MOUNT}/role/{GATEWAY_ROLE}",
        f"auth/{APPROLE_MOUNT}/role/{GATEWAY_ROLE}/role-id",
        f"auth/{APPROLE_MOUNT}/role/{BACKUP_ROLE}",
        f"auth/{APPROLE_MOUNT}/role/{BACKUP_ROLE}/role-id",
    ):
        request("GET", path, token=operator_token)

    print("OPERATOR_EXACT_READ_ALLOW_GATE=PASS")

    _, generated = request(
        "POST",
        f"auth/{APPROLE_MOUNT}/role/{GATEWAY_ROLE}/secret-id",
        token=operator_token,
        body={"num_uses": 1, "ttl": "10m"},
    )

    if not isinstance(generated, dict):
        fail("GATEWAY_SECRET_ID_CREATE_GATE=FAIL")

    generated_data = generated.get("data")
    if not isinstance(generated_data, dict):
        fail("GATEWAY_SECRET_ID_CREATE_GATE=FAIL")

    temporary_gateway_accessor = generated_data.get(
        "secret_id_accessor"
    )

    if (
        not isinstance(temporary_gateway_accessor, str)
        or not temporary_gateway_accessor
    ):
        fail("GATEWAY_SECRET_ID_CREATE_GATE=FAIL")

    print("GATEWAY_SECRET_ID_CREATE_GATE=PASS")

    request(
        "POST",
        (
            f"auth/{APPROLE_MOUNT}/role/{GATEWAY_ROLE}"
            "/secret-id-accessor/destroy"
        ),
        token=operator_token,
        body={
            "secret_id_accessor": temporary_gateway_accessor,
        },
    )
    temporary_gateway_accessor = None

    print("GATEWAY_SECRET_ID_DESTROY_GATE=PASS")

    _, backup_login = request(
        "POST",
        f"auth/{APPROLE_MOUNT}/login",
        body={
            "role_id": backup_role_id,
            "secret_id": backup_secret_id,
        },
    )

    backup_token = extract_token(
        backup_login,
        BACKUP_POLICY,
        600,
    )

    print("BACKUP_APPROLE_LOGIN_GATE=PASS")
    print("BACKUP_TOKEN_POLICY_GATE=PASS")
    print("BACKUP_TOKEN_NO_DEFAULT_POLICY_GATE=PASS")
    print("BACKUP_TOKEN_TTL_GATE=PASS")

    capability_paths = [
        "sys/storage/raft/snapshot",
        "sys/storage/raft/snapshot-force",
        "sys/raw",
        "sys/seal",
        f"sys/policies/acl/{OPERATOR_POLICY}",
        "auth/token/create",
        f"auth/{APPROLE_MOUNT}/role/{BACKUP_ROLE}",
    ]

    _, capabilities = request(
        "POST",
        "sys/capabilities-self",
        token=backup_token,
        body={"paths": capability_paths},
    )

    if not isinstance(capabilities, dict):
        fail("BACKUP_CAPABILITY_RESPONSE_GATE=FAIL")

    allowed = capabilities.get(
        "sys/storage/raft/snapshot"
    )

    if not isinstance(allowed, list) or sorted(allowed) != ["read"]:
        fail("BACKUP_SNAPSHOT_READ_ONLY_GATE=FAIL")

    for denied_path in capability_paths[1:]:
        denied = capabilities.get(denied_path)
        if not isinstance(denied, list) or denied != ["deny"]:
            fail("BACKUP_CRITICAL_DENY_GATE=FAIL")

    print("BACKUP_SNAPSHOT_READ_ONLY_GATE=PASS")
    print("BACKUP_CRITICAL_DENY_GATE=PASS")

    fd, temporary_name = tempfile.mkstemp(
        prefix="hermes-openbao-backup-validation-",
        suffix=".snap",
        dir="/run",
    )
    os.close(fd)
    snapshot_path = Path(temporary_name)
    os.chmod(snapshot_path, 0o600)

    _, snapshot_bytes = request(
        "GET",
        "sys/storage/raft/snapshot",
        token=backup_token,
        binary=True,
    )

    if not isinstance(snapshot_bytes, bytes):
        fail("BACKUP_SNAPSHOT_RESPONSE_GATE=FAIL")

    snapshot_path.write_bytes(snapshot_bytes)
    snapshot_bytes = b""

    snapshot_size = snapshot_path.stat().st_size
    if snapshot_size < 1024:
        fail("BACKUP_SNAPSHOT_SIZE_GATE=FAIL")

    snapshot_sha = hashlib.sha256(
        snapshot_path.read_bytes()
    ).hexdigest()

    if len(snapshot_sha) != 64:
        fail("BACKUP_SNAPSHOT_SHA256_GATE=FAIL")

    print("BACKUP_SNAPSHOT_SAVE_GATE=PASS")
    print("BACKUP_SNAPSHOT_SIZE_GATE=PASS")
    print("BACKUP_SNAPSHOT_SHA256_GATE=PASS")

    snapshot_path.write_bytes(b"")
    snapshot_path.unlink()
    snapshot_path = None

    request(
        "POST",
        (
            f"auth/{APPROLE_MOUNT}/role/{BACKUP_ROLE}"
            "/secret-id-accessor/destroy"
        ),
        token=operator_token,
        body={
            "secret_id_accessor": backup_secret_accessor,
        },
    )
    backup_secret_destroyed = True

    print("BOOTSTRAP_BACKUP_SECRET_ID_DESTROY_GATE=PASS")

    destroyed_status, destroyed_login = request(
        "POST",
        f"auth/{APPROLE_MOUNT}/login",
        body={
            "role_id": backup_role_id,
            "secret_id": backup_secret_id,
        },
        expected_error={400, 403},
    )

    if destroyed_status not in {400, 403}:
        unexpected_token = None

        if isinstance(destroyed_login, dict):
            unexpected_auth = destroyed_login.get("auth")

            if isinstance(unexpected_auth, dict):
                candidate_token = unexpected_auth.get("client_token")

                if isinstance(candidate_token, str) and candidate_token:
                    unexpected_token = candidate_token

        revoke_self(unexpected_token)
        fail("DESTROYED_BACKUP_SECRET_ID_LOGIN_DENY_GATE=FAIL")

    print("DESTROYED_BACKUP_SECRET_ID_LOGIN_DENY_GATE=PASS")

    request(
        "POST",
        "auth/token/revoke-self",
        token=backup_token,
        body={},
    )
    backup_token = None

    request(
        "POST",
        "auth/token/revoke-self",
        token=operator_token,
        body={},
    )
    operator_token = None

    print("BACKUP_TOKEN_REVOKED=PASS")
    print("OPERATOR_TOKEN_REVOKED=PASS")
    print("PHASE_94D0F_OPERATOR_BACKUP_VALIDATION=PASS")
    print("ROOT_TOKEN_USED=False")
    print("OPENBAO_STATE_MUTATION_EXECUTED=True")
    print("VALIDATION_SNAPSHOT_REMOVED=True")
    print("BOOTSTRAP_BACKUP_SECRET_ID_DESTROYED=True")
    print("ROOT_TOKEN_REVOKED=False")
    print("PRODUCTION_TOUCHED=False")

except Exception as error:
    if temporary_gateway_accessor and operator_token:
        try:
            request(
                "POST",
                (
                    f"auth/{APPROLE_MOUNT}/role/{GATEWAY_ROLE}"
                    "/secret-id-accessor/destroy"
                ),
                token=operator_token,
                body={
                    "secret_id_accessor": temporary_gateway_accessor,
                },
            )
        except Exception:
            pass

    revoke_self(backup_token)
    revoke_self(operator_token)

    if snapshot_path and snapshot_path.exists():
        try:
            snapshot_path.write_bytes(b"")
            snapshot_path.unlink()
        except Exception:
            pass

    password = ""
    backup_secret_id = ""

    print(str(error), file=sys.stderr)
    print("PHASE_94D0F_OPERATOR_BACKUP_VALIDATION=FAIL")
    print("ROOT_TOKEN_USED=False")
    print("ROOT_TOKEN_REVOKED=False")
    print("PRODUCTION_TOUCHED=False")
    raise SystemExit(1)

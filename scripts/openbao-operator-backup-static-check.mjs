#!/usr/bin/env node
// Static, network-free validation for PHASE 94D0F-O1 candidate assets.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r/g, "");

const operator = read(
  "ops/openbao/policy/hermes-staging-operator.hcl",
);
const backup = read(
  "ops/openbao/policy/hermes-staging-raft-backup.hcl",
);
const bootstrap = read(
  "ops/openbao/staging/operator-backup-access-bootstrap.sh",
);
const validation = read(
  "ops/openbao/staging/operator-backup-access-validation.py",
);
const runbook = read(
  "ops/openbao/staging/OPERATOR_BACKUP_ACCESS_RUNBOOK.md",
);

function gate(condition, code) {
  if (!condition) {
    console.error(`[openbao-operator-static] FAILED ${code}`);
    process.exit(1);
  }
}

gate(
  backup.includes(
    'path "sys/storage/raft/snapshot" {\n  capabilities = ["read"]\n}',
  ),
  "BACKUP_READ_ONLY",
);

for (const forbidden of [
  'capabilities = ["update"]\n}\n\npath "sys/storage/raft/snapshot"',
  'path "sys/storage/raft/snapshot-force"',
  'path "sys/raw',
  'path "sys/seal',
  'path "auth/token/create"',
  'capabilities = ["sudo"]',
]) {
  gate(!backup.includes(forbidden), "BACKUP_FORBIDDEN_GRANT");
}

for (const required of [
  'path "auth/hermes-userpass/users/hermes-staging-operator/password"',
  'path "auth/approle/role/hermes-gateway-staging/secret-id"',
  'path "auth/approle/role/hermes-staging-raft-backup/secret-id"',
  'path "sys/policies/acl/hermes-staging-operator"',
]) {
  gate(operator.includes(required), "OPERATOR_REQUIRED_PATH");
}

for (const forbidden of [
  'path "sys/raw',
  'path "sys/seal',
  'path "sys/storage/raft/snapshot-force"',
  'path "auth/token/create"',
  'capabilities = ["sudo"]',
  'path "hermes-staging/data/',
]) {
  gate(!operator.includes(forbidden), "OPERATOR_FORBIDDEN_GRANT");
}

for (const asset of [bootstrap, validation, runbook]) {
  gate(!asset.includes("51.195.255.7"), "PRODUCTION_ADDRESS");
  gate(!asset.includes("operator init"), "REINITIALIZATION");
  gate(!asset.includes("down -v"), "DESTRUCTIVE_COMPOSE");
  gate(!asset.includes("docker system prune"), "PRUNE");
  gate(!asset.includes("docker volume rm"), "VOLUME_REMOVE");
}

for (const forbiddenCidr of [
  "token_bound_cidrs=127.0.0.1/32",
  "secret_id_bound_cidrs=127.0.0.1/32",
]) {
  gate(!bootstrap.includes(forbiddenCidr), "UNVERIFIED_HARDCODED_CIDR");
}

gate(
  validation.includes(
    "if destroyed_status not in {400, 403}:",
  ),
  "DESTROYED_SECRET_ID_STATUS_REQUIRED",
);

gate(
  validation.includes("revoke_self(unexpected_token)"),
  "UNEXPECTED_LOGIN_TOKEN_REVOKED",
);

gate(
  bootstrap.includes(
    '[[ "${BAO_ADDR:-}" == "https://127.0.0.1:8200" ]]',
  ),
  "BOOTSTRAP_LOOPBACK",
);

gate(
  validation.includes(
    'EXPECTED_ADDR = "https://127.0.0.1:8200"',
  ),
  "VALIDATION_LOOPBACK",
);

gate(
  runbook.includes(
    "Root revocation is a separate, explicit phase.",
  ),
  "ROOT_REVOCATION_SEPARATE",
);

console.log("[openbao-operator-static] PASS");

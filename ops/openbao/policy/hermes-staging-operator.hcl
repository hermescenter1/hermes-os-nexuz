# PHASE 94D0F-O1 — limited human operator policy for OpenBao STAGING only.
#
# This policy deliberately does NOT grant:
# - root or sudo
# - policy writes/deletes
# - auth mount enable/disable/tune
# - token creation or accessor administration
# - secret-value access under hermes-staging/
# - raft restore / force-restore
# - sys/raw, seal, rekey, generate-root, step-down, mount administration
#
# The operator can inspect the exact Hermes staging resources, rotate its own
# userpass password, and issue/destroy Secret IDs for the two exact AppRoles.

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/revoke-self" {
  capabilities = ["update"]
}

path "sys/capabilities-self" {
  capabilities = ["update"]
}

path "sys/policies/acl/hermes-staging-operator" {
  capabilities = ["read"]
}

path "sys/policies/acl/hermes-staging-raft-backup" {
  capabilities = ["read"]
}

path "sys/policies/acl/hermes-gateway-kv-staging" {
  capabilities = ["read"]
}

path "auth/hermes-userpass/users/hermes-staging-operator" {
  capabilities = ["read"]
}

path "auth/hermes-userpass/users/hermes-staging-operator/password" {
  capabilities = ["update"]

  allowed_parameters = {
    "password" = []
  }
}

path "auth/approle/role/hermes-gateway-staging" {
  capabilities = ["read"]
}

path "auth/approle/role/hermes-gateway-staging/role-id" {
  capabilities = ["read"]
}

path "auth/approle/role/hermes-gateway-staging/secret-id" {
  capabilities = ["create", "update", "list"]
}

path "auth/approle/role/hermes-gateway-staging/secret-id-accessor/lookup" {
  capabilities = ["update"]
}

path "auth/approle/role/hermes-gateway-staging/secret-id-accessor/destroy" {
  capabilities = ["update"]
}

path "auth/approle/role/hermes-staging-raft-backup" {
  capabilities = ["read"]
}

path "auth/approle/role/hermes-staging-raft-backup/role-id" {
  capabilities = ["read"]
}

path "auth/approle/role/hermes-staging-raft-backup/secret-id" {
  capabilities = ["create", "update", "list"]
}

path "auth/approle/role/hermes-staging-raft-backup/secret-id-accessor/lookup" {
  capabilities = ["update"]
}

path "auth/approle/role/hermes-staging-raft-backup/secret-id-accessor/destroy" {
  capabilities = ["update"]
}

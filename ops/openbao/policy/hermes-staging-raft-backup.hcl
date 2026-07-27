# PHASE 94D0F-O1 — backup-only policy for OpenBao STAGING.
#
# GET /sys/storage/raft/snapshot maps to "read".
# POST restore on the same path maps to "update" and is intentionally absent.
# Force restore, raft configuration changes and all unrelated paths remain denied.

path "sys/storage/raft/snapshot" {
  capabilities = ["read"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/revoke-self" {
  capabilities = ["update"]
}

path "sys/capabilities-self" {
  capabilities = ["update"]
}

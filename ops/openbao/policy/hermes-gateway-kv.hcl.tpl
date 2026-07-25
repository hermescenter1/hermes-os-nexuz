# PHASE 94D0F — least-privilege KV v2 policy for the Hermes Gateway secret store.
#
# TEMPLATE. `{{MOUNT}}` and `{{PREFIX}}` are substituted by approle-bootstrap.sh
# AFTER strict validation (no whitespace, traversal, wildcards, quotes,
# backslashes or path separators). LAB ONLY — this is not a production policy;
# production values remain subject to PHASE 94D0H approval.
#
# It grants EXACTLY the six KV v2 operations the OpenBao adapter performs
# (create/read/patch/delete on data, read/delete on metadata), scoped to one
# gateway prefix. There are deliberately NO broad `deny` blocks: everything
# outside these two grants is denied by OpenBao's default-deny, and a broad deny
# could otherwise override the grant through OpenBao's deny-wins precedence.
#
# Not granted anywhere: update, list, sudo, sys/*, auth/token/*, other KV
# prefixes, or any root/admin path.

path "{{MOUNT}}/data/{{PREFIX}}/*" {
  capabilities = ["create", "read", "patch", "delete"]
}

path "{{MOUNT}}/metadata/{{PREFIX}}/*" {
  capabilities = ["read", "delete"]
}

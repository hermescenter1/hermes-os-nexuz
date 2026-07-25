# Hermes Gateway — OpenBao AppRole Runbook (PHASE 94D0F, LAB ONLY)

> **Scope.** This runbook covers a **local, loopback-only lab**. It is not a
> production installer and wires nothing into the application runtime. Production
> values (real addresses, mount names, TTLs, CIDR bindings, token policies)
> remain **subject to PHASE 94D0H approval**. Nothing here places an OpenBao root
> token into application configuration.

## 1. What this provisions

A least-privilege AppRole that lets the Hermes Gateway secret adapter perform
exactly its six KV v2 operations against a single gateway prefix, and nothing
else.

- Policy template: [`policy/hermes-gateway-kv.hcl.tpl`](policy/hermes-gateway-kv.hcl.tpl)
- Bootstrap: [`bootstrap/approle-bootstrap.sh`](bootstrap/approle-bootstrap.sh)
- Revocation & teardown: [`bootstrap/revoke.sh`](bootstrap/revoke.sh)
- Live validation: `scripts/openbao-least-privilege-check.mjs` →
  `src/lib/ot-edge/__tests__/openbao-approle-least-privilege.live.test.ts`

## 2. Exact allowed policy paths

After `{{MOUNT}}` / `{{PREFIX}}` substitution the policy grants only:

| Path | Capabilities | Adapter operation |
| --- | --- | --- |
| `{mount}/data/{prefix}/*` | `create`, `read`, `patch`, `delete` | create (cas 0), resolve, rotate (merge-patch), revoke (soft-delete) |
| `{mount}/metadata/{prefix}/*` | `read`, `delete` | revoked-vs-missing probe, permanent delete |

Deliberately **not** granted anywhere: `update`, `list`, `sudo`, `sys/*`,
`auth/token/*`, other KV prefixes, and any root/admin path. There are **no broad
`deny` blocks** — everything else is denied by OpenBao's default-deny, which also
avoids OpenBao's deny-wins precedence overriding the grant.

## 3. Lab-only bootstrap

The operator supplies a bootstrap token via `BAO_TOKEN` (used through the
environment only — never argv, never stored, never printed, and never asserted
to be "non-root"). The endpoint must be loopback.

```bash
export BAO_ADDR=http://127.0.0.1:8200
export BAO_TOKEN=<operator bootstrap token>      # not stored by the script
export BAO_MOUNT=hermes-lab
export BAO_AUTH_MOUNT=approle
export BAO_PREFIX=gateways
export BAO_ROLE=hermes-gateway
export BAO_POLICY=hermes-gateway-kv
export BAO_OUT_DIR=/secure/outside/repo/hermes-openbao   # must be OUTSIDE the repo
bash ops/openbao/bootstrap/approle-bootstrap.sh
```

The script is idempotent and **fails closed** if a target mount, auth mount,
role or policy already exists with an unexpected configuration. It never
overwrites or disables unrelated resources. Optional `BAO_TOKEN_BOUND_CIDRS` /
`BAO_SECRET_ID_BOUND_CIDRS` are validated and passed through only when set;
CIDR bindings are never hard-coded.

## 4. Role ID and Secret ID handling

- `role_id`, `secret_id`, and `secret_id_accessor` are written **only** into
  `BAO_OUT_DIR` (outside the repository), mode `600`, via atomic replacement.
- They are **never** printed to stdout/stderr and **never** committed.
- A non-sensitive `created.manifest` (names + which mounts this run created) is
  written alongside them, so teardown removes only what this run created.
- Treat `BAO_OUT_DIR` as a secret store: restrict it, and delete it when done.

## 5. TTL and usage-limit rationale (lab defaults)

| Setting | Value | Why |
| --- | --- | --- |
| `bind_secret_id` | `true` | A Secret ID is required to log in. |
| `token_type` | `service` | Individually revocable (batch tokens cannot be revoked). |
| `token_policies` | generated least-privilege policy | Only the KV grants above. |
| `token_no_default_policy` | `true` | No `default` policy → `auth/token/lookup-self` is denied. |
| `token_ttl` | `20m` | Short bound; the adapter re-authenticates on expiry. |
| `token_max_ttl` | `1h` | Hard ceiling on any issued token. |
| `token_num_uses` | `0` | One login serves many KV requests, so per-use capping is impractical; the short TTL bounds exposure instead. |
| `secret_id_ttl` | `1h` | Bounds the lifetime of an issued Secret ID. |
| `secret_id_num_uses` | `5` | Bounds reuse of a Secret ID (override to `1` for single-use issuance). |

## 6. Secret ID rotation

Issue a fresh Secret ID and retire the old one by its accessor:

```bash
# Issue a new Secret ID into BAO_OUT_DIR by re-running the bootstrap, then:
export BAO_AUTH_MOUNT=approle BAO_ROLE=hermes-gateway
export BAO_SECRET_ID_ACCESSOR_FILE=/secure/outside/repo/hermes-openbao/old_secret_id_accessor
bash ops/openbao/bootstrap/revoke.sh destroy-secret-id
```

## 7. Secret-ID accessor revocation

Destroys a specific Secret ID without handling its value (accessor read from a
file or env, piped via stdin — never argv):

```bash
export BAO_AUTH_MOUNT=approle BAO_ROLE=hermes-gateway
export BAO_SECRET_ID_ACCESSOR_FILE=/secure/outside/repo/hermes-openbao/secret_id_accessor
bash ops/openbao/bootstrap/revoke.sh destroy-secret-id
```

## 8. Token-accessor revocation

Revokes a single issued token by its accessor (never by auth-path prefix):

```bash
export BAO_TOKEN_ACCESSOR=<token accessor>
bash ops/openbao/bootstrap/revoke.sh revoke-token
```

## 9. Safe rollback

To stop all future logins for the role without touching mounts:

```bash
export BAO_AUTH_MOUNT=approle BAO_ROLE=hermes-gateway
bash ops/openbao/bootstrap/revoke.sh delete-role
```

Deleting the AppRole invalidates every Secret ID for it; already-issued tokens
still expire at their TTL and can be revoked individually by accessor.

## 10. Guarded lab teardown

Removes only the resources recorded in the bootstrap manifest, and disables a
mount/auth method only if **this run created it**. Requires an explicit
destructive confirmation. It never uses `operator seal` and never lease-revokes
by prefix.

```bash
export BAO_CONFIRM=I-UNDERSTAND-DESTROY
export BAO_MANIFEST=/secure/outside/repo/hermes-openbao/created.manifest
bash ops/openbao/bootstrap/revoke.sh teardown
```

## 11. Non-goals / guarantees

- **No root token in application configuration.** The application authenticates
  only with `role_id` + `secret_id` and receives a short-TTL AppRole token.
- **No production OpenBao installation** and **no production runtime wiring**.
- Production values remain subject to **PHASE 94D0H** approval.

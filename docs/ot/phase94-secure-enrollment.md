# Phase 94 — Secure OT Gateway Machine-Credential Enrollment

This phase closes the OT edge secret story: it wires the previously-built (but
unwired) writable secret manager / OpenBao runtime into a **create / rotate /
revoke / delete** lifecycle for per-gateway HMAC signing credentials, and adds
the one-time operator UI to provision them.

## What existed before (unchanged)

- `EdgeGatewayProfile` metadata + `ingestionId` machine handle (Phase 94B).
- HMAC-signed envelope authentication (`machine-context.ts`,
  `envelope-signature.ts`) resolving the signing secret from a server-registered
  `signingKeyRef` via a read-only `SecretProvider`.
- OT list filters (Phase 94C1) — reused, not modified.
- The writable `WritableSecretManager` contract, the OpenBao KV v2 adapter, the
  AppRole token provider and the fail-closed runtime composition — all built and
  tested but **constructed by nobody in a production path**.

## What this phase adds

- **Enrollment service** (`src/lib/ot-edge/services/enrollment-service.ts`):
  issues a 256-bit HMAC secret as bounded in-memory bytes, stores it in the
  writable secret manager, persists only the opaque reference, and returns the
  plaintext credential to the operator **exactly once**. Rotate uses
  create-new-reference + compare-and-swap + retire-old (atomic at the database
  commit; the working credential stays valid until the replacement commits).
  Revoke is fail-closed and works even with the backend down (the `REVOKED`
  lifecycle blocks every envelope on its own). Delete is idempotent. Every path
  is atomic-or-compensating; a failed database write deletes the just-created
  secret.
- **Runtime wiring** (`secret-backend.ts`, `http/composition.ts`): resolves the
  backend from the environment and, when enabled, lets the envelope verifier
  resolve opaque references through the manager.
- **Additive schema** (`EdgeGatewayProfile.signingKeyVersion`,
  `signingKeyEnrolledAt`, `signingKeyRotatedAt`, `signingKeyRevokedAt`) — all
  nullable; no secret material.
- **Routes** under `/api/ot/gateways/[id]/enrollment[/rotate|/revoke]`
  (`manage_ot_gateway`, server-resolved tenant/site).
- **Operator UI** (`src/components/ot-edge-enrollment/`) on the gateway detail
  page — a separate module from the contract-locked metadata onboarding surface.
- **Audit + metrics**: `gateway.enrollment.created`, `credential.rotated`,
  `credential.revoked`, `enrollment.deleted`, and failure/compensation outcomes.
  No reference, version secret or credential is ever logged, audited or metered.

## Connectivity decision (owner deployment decision — NOT configured here)

OpenBao runs on a **separate host**, listening on `127.0.0.1:8200` on an
isolated bridge network, and the host firewall denies inbound `8200` from
non-loopback. **There is no configured private transport from the application
server to OpenBao**, and no `BAO_*`/`OPENBAO_*` variables exist in any
environment template.

Therefore this PR ships the backend **DISABLED**:

- With `OT_SECRET_BACKEND` unset (the default), the secret manager is `null`:
  enrollment fails closed (`SECRET_BACKEND_UNAVAILABLE`), the envelope verifier
  keeps using the read-only env-backed signing keys, and **zero OpenBao requests
  and zero credential reads occur**. Current application behaviour is unchanged.
- Enabling it requires an owner to (1) provision a private transport
  (WireGuard/mTLS) from the app server to the OpenBao host, (2) bootstrap the
  least-privilege AppRole (`ops/openbao/bootstrap/`) and mount the role/secret id
  files, and (3) set `OT_SECRET_BACKEND=openbao` plus the values documented in
  `.env.example`. An **enabled-but-incomplete** configuration fails startup
  rather than falling back to PostgreSQL, an env key, an in-memory store or
  anonymous access.

This PR does not deploy, configure, or contact OpenBao or Production, and does
not select the dormant OVH adapter.

## Credential shape

The credential is `base64url(32 random bytes)` — the HMAC-SHA256 key. The device
is configured with both the credential (the secret) and the `signingKeyRef` (an
identifier echoed in every envelope). The server stores only the reference and
resolves the bytes through the writable manager, re-encoding them to the same
base64url string used as the HMAC key. The credential is never retrievable again
from PostgreSQL or browser state.

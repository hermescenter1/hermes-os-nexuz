# Phase 99 — External Review Scope

This document defines what an independent reviewer is engaged to examine and
what is explicitly excluded. It is a companion to
`phase99-rules-of-engagement.md`, which defines *how* the review must be
conducted, and `phase99-attack-surface-inventory.md`, which describes the
surfaces named below in detail.

## Artefact identity

The reviewed artefact is a **specific commit SHA of this repository**,
supplied in writing by the owner at engagement kick-off — never inferred, and
never the tip of a branch that may move during the engagement. The commit
must correspond to a build the reviewer can actually stand up (see
`phase99-external-review-intake.md` for the exact fields recorded:
`testedCommitSha`, an optional `testedImageDigest`, and a `scopeHash` binding
the engagement to this document's exact text). A review of any other tree, or
of a scope nobody agreed to in writing, does not constitute evidence about
the commit it is supposed to certify, and `validateExternalAttestation`
(`scripts/security/phase99/external-evidence.mjs`) rejects a mismatch
mechanically rather than by convention.

## In scope

### API surface, by classification

The full inventory is machine-readable at
`docs/security/phase99-route-security-inventory.json` (regenerate with
`node scripts/security/phase99/generate-inventory.mjs`; verify with
`--check`). At the time this scope was written it covers 355 route files and
497 exported HTTP handlers:

| Classification | Handlers | Meaning |
|---|---:|---|
| `PUBLIC_READ` | 36 | No authentication; read-only; published/public content or static fixtures. |
| `PUBLIC_WRITE` | 13 | No authentication; performs a write (contact/application/consent/analysis). See `phase99-attack-surface-inventory.md#unauthenticated-write-surfaces`. |
| `AUTHENTICATED_USER` | 210 | Requires an authenticated identity; tenant scoping resolved within the handler. |
| `TENANT_MEMBER` | 119 | Requires an authenticated identity and an organization-membership predicate. |
| `PLATFORM_ADMIN` | 115 | Requires platform-administrator authority. |
| `WEBHOOK` | 2 | Machine-to-machine; authenticated by signature or shared secret, not a session. |
| `INTERNAL_HEALTH` | 2 | Liveness/readiness probes; no identifiers, no dependency detail in the response. |

Every route, in every classification above, is in scope for authorization,
input-validation, tenant-isolation and business-logic testing consistent with
its stated classification. A reviewer finding that a `PUBLIC_READ` handler
returns unpublished or cross-tenant content, or that a `TENANT_MEMBER`
handler is reachable without membership, is exactly the class of finding this
review exists to catch.

### Authentication and session management

The session cookie (`hermes_session`), the short-lived access-token cookie
(`hermes_at`), and the refresh-token cookie scoped to `/api/auth/refresh`:
issuance, rotation, revocation, cookie attributes (`httpOnly`, `Secure` in
production, `SameSite`), session-fixation resistance, and privilege
boundaries between an authenticated user, a tenant member and a platform
administrator.

### Tenant isolation

Whether the acting organization is always derived server-side from the
authenticated actor rather than accepted from the request, and whether every
object lookup by a path or query identifier is additionally scoped to that
server-derived tenant. In scope for at least two independent synthetic
tenants (see `phase99-rules-of-engagement.md`).

### Business logic

Workflow and state-machine correctness across the modules exposed by the
`AUTHENTICATED_USER`, `TENANT_MEMBER` and `PLATFORM_ADMIN` surfaces —
including but not limited to candidate self-service, applicant tracking,
academy enrollment/certification, billing and plan limits, case and
knowledge-article authoring, and invitation/role assignment. Mass-assignment,
workflow-step skipping and privilege-assignment abuse are all in scope.

### Uploads

The two multipart upload surfaces: `POST /api/documents` (administrator-only)
and `POST /api/articles/author-profile/avatar` (authenticated, 2 MB ceiling,
image MIME allowlist, randomised stored filename).

### Webhooks

The Stripe billing webhook (HMAC signature, timestamp tolerance, idempotency
claim) and the secret-gated IndexNow trigger (constant-time comparison,
fails closed when unconfigured). In-scope testing is limited to the
signature/secret verification logic and idempotency handling — see
`phase99-rules-of-engagement.md` for the explicit prohibition on attacking
the real third-party providers themselves.

### Infrastructure configuration

Static review of the committed `Dockerfile`, `docker-compose.prod.yml`,
`next.config.ts`, and `src/middleware.ts` (security headers, Content-Security-
Policy and nonce handling, container user, published ports). This is a
**configuration review**, not a live-infrastructure penetration test — see
"Out of scope" below and the target-authorization requirement in
`phase99-rules-of-engagement.md`.

## Out of scope

- **Production data.** No review activity may read, exfiltrate, or attempt to
  access data belonging to the live production deployment.
- **Real customer tenants or organizations.** Testing is confined to
  synthetic tenants and synthetic accounts created for the engagement (see
  `phase99-rules-of-engagement.md`); no real organization's records, users or
  billing state may be touched.
- **Live OT/PLC/SIS/industrial equipment.** Hermes OS integrates with
  operational-technology gateways and industrial control systems in customer
  deployments. No engagement under this scope document extends to any real
  gateway, PLC, SIS, HMI or other industrial equipment, whether owned by
  Hermes or by a customer. Industrial actuation and safety-system testing of
  any kind are addressed as separate, explicit prohibitions in
  `phase99-rules-of-engagement.md`.
- **Third-party providers.** Stripe, the transactional-email provider, DNS,
  TLS issuance, hosting and any other external service the platform depends
  on are not targets. Testing of webhook signature verification against
  synthetic payloads is in scope; attacking the provider's own infrastructure
  is not.
- **Physical and social engineering.** No physical-access attempts, no
  phishing, pretexting, or social engineering against Hermes personnel,
  contractors or customers, unless separately authorised in writing under a
  distinct engagement.
- **The live production domain, by default.** `www.hermesnovin.com` is not an
  authorised target unless and until the owner designates it in writing as
  the `PENTEST_TARGET` for a specific, time-boxed engagement. The default
  expectation is a dedicated, owner-provisioned non-production environment
  running the same reviewed commit.

## Scope-hash binding

The exact text of this document (line endings normalised, trailing whitespace
trimmed) is hashed with SHA-256 by `computeScopeHash` in
`scripts/security/phase99/external-evidence.mjs`. That hash is what a
reviewer's sanitized attestation must reproduce in its `scopeHash` field. A
review conducted against a materially different scope — even an
undocumented verbal expansion — will not validate against the scope this
document defines, by design.

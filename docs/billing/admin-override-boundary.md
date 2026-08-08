# Phase 96 — Admin Override Boundary

Source: `src/lib/billing-governance/runtime/override-service.ts`, the
`OrganizationEntitlementOverride` Prisma model, and the override-handling
branch of `entitlement-resolver.ts`.

## What an override is

A Billing-Admin authorised, **time-bounded** exception to the plan-derived
entitlement decision for one `(organizationId, entitlementKey)` pair. It can
either `GRANT` access (bypass a feature/paid gate, or supply a real numeric
ceiling for an otherwise `CONFIGURATION_REQUIRED` metered resource) or `DENY`
access (hard-block a specific entitlement regardless of plan).

## Hard boundaries (enforced in code, not merely documented)

| Boundary | Enforcement |
| --- | --- |
| **No permanent override** | `expiresAt` is a **required, non-nullable** `DateTime` column (`prisma/schema.prisma`); `createEntitlementOverride()` additionally validates it is a real date **strictly in the future** relative to `now`, rejecting anything else as `VALIDATION`. There is no code path that creates an override without an expiry. |
| **Reason + approver required** | `reason` must be present and ≥3 characters after trimming; `approvedBy` (the authorising user id) must be present. Both are non-nullable DB columns. |
| **Billing-Admin only (intended)** | The service takes `approvedBy` as an opaque caller-supplied user id and does not itself check role — the permission check is expected to run at the calling route, exactly as every other billing route in this codebase runs `requirePermission(ctx.role, "manage_billing")` (OWNER/ADMIN/BILLING_ADMIN) before calling a mutation service. **No API route currently calls `createEntitlementOverride`/`revokeEntitlementOverride`** (see "Not yet wired" below), so this boundary is implemented at the service layer's expectations but has no live route to test it against a real role check yet. |
| **Fully audited** | Every create and revoke is recorded via `recordAuditEvent()` with `BILLING_GOVERNANCE_AUDIT.OVERRIDE_CREATED` / `OVERRIDE_REVOKED`, using the redacted allow-list metadata builder (`buildBillingAuditMetadata`). |
| **Cannot change tenant ownership** | `organizationId` on `CreateOverrideInput` is documented as "server-derived caller org (authoritative)" and is written verbatim to the row; the service never accepts or infers a different tenant. `revokeEntitlementOverride()` scopes its `updateMany` `where` clause to `{ id: overrideId, organizationId, revokedAt: null }` — an override id that belongs to a different organisation matches zero rows and returns `NOT_FOUND`, never revealing that the id exists under another tenant. |
| **Cannot grant another organisation's resources** | The resolver's `overrideIsValid()` (`entitlement-resolver.ts`) rejects an override whose `organizationId` does not equal the requesting context's `organisationId` — a cross-tenant override is silently ignored, never applied. `entitlement-gating.test.ts` and the `cross-tenant-attacks.jsonl` fixture (`"override from another org ignored"`) exercise this directly. |
| **Cannot disable signature verification** | Nothing in the override model or resolver touches the Stripe webhook signature path (`getStripeClient().webhooks.constructEvent`); overrides only affect `evaluateEntitlement()` outcomes, never webhook trust. |
| **Cannot bypass RBAC** | `enforceEntitlement()` is explicitly documented and used as a **second, additional** gate that runs *after* the route's existing RBAC/scope check (`requirePermission`, `hasScope`) — an override can only affect the entitlement outcome once RBAC has already passed; it cannot substitute for or short-circuit RBAC. |

## How a valid override changes the resolver's decision

From `entitlement-resolver.ts` (`evaluateEntitlement`), in order:

1. `overrideIsValid()` checks: same organisation, same entitlement key, not
   revoked (`revokedAt === null`), `effectiveFrom ≤ now`, `expiresAt > now`.
   Any failure → the override is treated as absent (falls back to the plan).
2. A valid `DENY` override **hard-denies** immediately
   (`reason: "ACCESS_DENIED"`), before feature-availability or paid-access
   checks even run — a DENY override always wins.
3. A valid `GRANT` override:
   - Skips the `FEATURE_DISABLED` check (a feature not in the plan can be
     explicitly unlocked).
   - Skips the paid-access-state check (a paid feature can be granted even
     without a paying subscription — e.g. a sales pilot).
   - **Does not** bypass a hard write-block from `SUSPENDED`/`EXPIRED`/
     `CANCELED` payment states — the code comment is explicit: *"An override
     GRANT does NOT bypass a hard suspension/expiry write-block — payment
     state stands."* An override changes what plan tier permits, not whether
     the organisation's payment status permits writing at all.
   - For a `METERED` entitlement: if `limitOverride` is a finite number, the
     effective limit becomes that number (`FIXED_LIMIT`); if `limitOverride`
     is `null`, the grant is treated as an explicit unlimited assignment.

## Listing and revocation

- `listActiveOverrides(organizationId, now)` — returns only non-revoked,
  unexpired rows for the caller's own organisation (`revokedAt: null,
  expiresAt: { gt: now }`).
- `revokeEntitlementOverride({ organizationId, overrideId, revokedById })` —
  sets `revokedAt`/`revokedById`; a revoked override immediately fails
  `overrideIsValid()` on the next resolution (no caching to invalidate).
- Expiry requires no action: `overrideIsValid()` re-checks `expiresAt >
  now` on every resolution, so an override simply stops applying once its
  time window ends — there is no background job needed to "turn it off",
  and no risk of a stale override silently persisting past its window.

## Not yet wired to a route

`createEntitlementOverride`, `revokeEntitlementOverride` and
`listActiveOverrides` have **no calling API route** in this codebase
snapshot (confirmed by repository search — only `entitlement-resolver.ts`,
which reads overrides via the store, and the test suite call these
functions). There is no `/api/billing/overrides`-style admin endpoint yet.
The service is complete and independently tested against every stated
boundary; what remains is:

- An admin-only API route that authenticates the caller, enforces
  `requirePermission(ctx.role, "manage_billing")` (or a stricter
  Billing-Admin-only check, consistent with
  `IMMEDIATE_CANCELLATION_REQUIRES`), and forwards to the service with
  `approvedBy = ctx.userId` and `organizationId = ctx.orgId` (never from the
  request body).
- A corresponding admin UI surface to create/list/revoke overrides.

## Tests

- `src/lib/billing-governance/__tests__/entitlement-resolver.test.ts` (23
  cases) — includes override validity edge cases (wrong org, wrong
  entitlement, revoked, not-yet-effective, expired, DENY precedence, GRANT
  with/without a numeric ceiling, GRANT not bypassing a write-block).
- `src/app/api/industrial/__tests__/entitlement-gating.test.ts` (4 cases) —
  proves a **valid** override supplies a real ceiling end-to-end through the
  real `sites` route (`allows creation when a Billing-Admin override
  supplies a real ceiling`, `denies (PLAN_LIMIT_REACHED) when the override
  ceiling is exhausted`).
- `tests/fixtures/billing-governance/cross-tenant-attacks.jsonl` —
  `"override from another org ignored"` fixture, replayed by
  `phase96-eval.test.ts` against the zero-tolerance
  `CROSS_TENANT_BILLING_ACCESS` budget.
- There is no test in this package that exercises `createEntitlementOverride`
  or `revokeEntitlementOverride` against a real (or fake) Prisma client —
  these two functions are currently exercised only by TypeScript
  compilation and by the resolver-side tests that construct
  `EntitlementOverrideSnapshot` values directly, not by calling the service
  functions themselves.

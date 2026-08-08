# Phase 96 — Commercialisation, Billing & Entitlements: Architecture

Phase 96 introduces a fail-closed, server-authoritative commercial layer on top
of the pre-existing (Phase 31) billing foundation. It answers three questions
for every request: *which plan is this organisation on*, *is the requested
capability included*, and *has the organisation consumed its allowance* —
without ever trusting the client and without ever inventing a commercial
number the owner has not approved.

## Design principles

- **Server is the single commercial authority.** Plan, subscription status,
  usage and entitlement decisions are always resolved from the database (or a
  server-owned snapshot); nothing is accepted from `organizationId`, plan
  claims or usage figures supplied by the caller.
- **Fail closed on every ambiguity.** An unreachable database, an unknown
  plan/entitlement key, a cross-tenant mismatch, an unconfigured price/limit,
  or an expired override all resolve to **deny**, never to an assumed
  allowance.
- **No invented commercial numbers.** Prices and every numeric per-resource
  limit are represented as explicit `CONFIGURATION_REQUIRED` /
  `OWNER_DECISION_REQUIRED` states (see
  [`plan-and-entitlement-registry.md`](./plan-and-entitlement-registry.md))
  until the owner supplies a real value.
- **Pure decision logic, injected I/O.** Mirroring the Phase 95 AI-governance
  pattern, the resolver, the state machine and the money helpers are pure
  functions over already-fetched snapshots. All database access is isolated
  behind small store interfaces so the decision logic is unit-testable without
  a database and cannot be bypassed by a caller that only mocks I/O.
- **Tenant data is never deleted automatically.** Expiry, suspension,
  cancellation and downgrade all preserve tenant data; they only change what
  the organisation may *do* next (`commercial-policy.ts`,
  `AUTOMATIC_TENANT_DATA_DELETION_FORBIDDEN = true`).

## Module map

```
src/lib/billing-governance/
├── types.ts                     canonical types, constants, vocab (pure)
├── plan-registry.ts              4 owner-approved plans (pure data)
├── entitlement-registry.ts       per-plan entitlement grants (pure data)
├── commercial-policy.ts          trial/grace/upgrade/downgrade policy constants
├── entitlement-resolver.ts       fail-closed decision engine (pure)
├── entitlement-store.ts          store contract (interface only)
├── entitlement-errors.ts         deny-reason → HTTP error mapping
├── subscription-state-machine.ts deterministic lifecycle transitions (pure)
├── stripe-event-mapper.ts        Stripe status string → internal domain event
├── webhook-idempotency.ts        claim/replay/out-of-order orchestration (pure)
├── money.ts                      decimal-string / bigint money arithmetic
├── audit.ts                      billing audit vocabulary + redaction allow-list
├── index.ts                      package barrel
├── runtime/
│   ├── entitlement-store.ts      Prisma-backed EntitlementStore (fail-closed)
│   ├── webhook-store.ts          Prisma-backed WebhookClaimStore (unique-index claim)
│   ├── subscription-events.ts    applies a domain event to a Subscription row
│   ├── require-entitlement.ts    route-level enforceEntitlement() helper
│   ├── atomic-reservation.ts     SERIALIZABLE count-then-insert reservation
│   ├── override-service.ts       Billing-Admin time-bounded override CRUD
│   └── trial-service.ts          single automatic trial per organisation
└── __tests__/                    unit + offline adversarial evaluation suite
```

`src/app/api/billing/webhooks/stripe/route.ts` is the only route that talks to
Stripe directly. `src/app/api/industrial/{sites,gateways,assets}/route.ts` and
`src/app/api/organizations/[orgId]/invitations/route.ts` are the four
production routes wired to `enforceEntitlement()` in this phase.

## Layering

1. **Pure decision layer** (`entitlement-resolver.ts`,
   `subscription-state-machine.ts`, `money.ts`, `audit.ts`,
   `stripe-event-mapper.ts`, `webhook-idempotency.ts`) — no imports of Prisma
   or Next.js. Fully covered by the offline Vitest suite; can be evaluated in
   CI with no database, no network and no secrets.
2. **Runtime bindings** (`runtime/*.ts`) — Prisma-backed implementations of the
   store interfaces. Every method fails closed: no database connection, no
   matching row, or any thrown error returns `null`/`false`, which the pure
   layer above always treats as a denial.
3. **Route wiring** — RBAC/scope checks run first (existing
   `requirePlatformAuth` / `requireOrgActor` / `requirePermission` /
   `hasScope` helpers, unchanged), then `enforceEntitlement()` runs as a
   **separate, additional** gate before any resource is created. The two axes
   (who you are vs what your organisation is entitled to) are never merged.

## Decision flow (create/consume path)

```
Request → requirePlatformAuth/requireOrgActor (identity)
        → requirePermission / hasScope (RBAC — unchanged)
        → enforceEntitlement({ organisationId, entitlementKey, requestedUnits })
              → resolveEntitlement(prismaEntitlementStore(), ctx)
                    → store.getSubscription(organisationId)   [fail closed → null]
                    → store.getOverride(organisationId, key)  [fail closed → null]
                    → store.getUsage(organisationId, key, now) [METERED only]
                    → evaluateEntitlement(ctx, snapshots)      [pure, deterministic]
              → audit (billing.entitlement_allowed | _denied | _limit_reached)
        → on deny: stable JSON error + mapped HTTP status, resource NOT created
        → on allow: route proceeds to its existing create logic
```

## Webhook flow

```
Stripe → POST /api/billing/webhooks/stripe
       → raw-body HMAC + timestamp-tolerance verification (Stripe SDK)
       → runIdempotentWebhook(prismaWebhookClaimStore(), envelope, handler)
             → claim via BillingWebhookEvent (provider, providerEventId) unique index
             → handler resolves the LOCAL subscription (never the payload org)
             → mapStripeEventToDomain() → SubscriptionEvent | null
             → applyProviderEvent() → out-of-order / duplicate / invalid rejected
             → audit (redacted)
       → always 200 once signature-verified (Stripe must not retry indefinitely)
```

Full detail: [`stripe-webhook-security.md`](./stripe-webhook-security.md) and
[`subscription-state-machine.md`](./subscription-state-machine.md).

## What is wired into production routes today

| Route | Entitlement key | File |
| --- | --- | --- |
| `POST /api/industrial/sites` | `sites` | `src/app/api/industrial/sites/route.ts` |
| `POST /api/industrial/gateways` | `gateways` | `src/app/api/industrial/gateways/route.ts` |
| `POST /api/industrial/assets` | `assets` | `src/app/api/industrial/assets/route.ts` |
| `POST /api/organizations/[orgId]/invitations` | `members` | `src/app/api/organizations/[orgId]/invitations/route.ts` |
| `POST /api/billing/webhooks/stripe` | n/a (state machine only) | `src/app/api/billing/webhooks/stripe/route.ts` |

## What exists as a library but is NOT yet exposed through a route

These are complete, tested, fail-closed services with **no HTTP endpoint
calling them** in this codebase snapshot. They are ready for a future
admin/billing UI to wire up, but must not be assumed "live" until that
wiring exists:

- `runtime/override-service.ts` — `createEntitlementOverride` /
  `revokeEntitlementOverride` / `listActiveOverrides` (no admin API route).
- `runtime/trial-service.ts` — `startAutomaticTrial` / `trialIsActive` /
  `markTrialConverted` (no "start trial" API route).
- `money.ts` refund/currency helpers (`refundWithinBounds`,
  `assertChargeableCurrency`, `currencyIsImmutable`) — no refund-recording
  route exists yet; the pre-existing `src/lib/billing/payments.ts` /
  `invoices.ts` record amounts with plain JS `number` + `toFixed(4)`
  (Phase 31 code), not yet migrated to call these Decimal-safe helpers.

## Known gap: the legacy self-serve subscription route

`src/app/api/billing/subscription/route.ts` (Phase 31) and
`src/lib/billing/subscriptions.ts` implement `POST`/`PATCH`/`PUT`/`DELETE` for
subscription create/change/cancel/renew. This route predates Phase 96 and has
**not** been updated to call the new state machine or to enforce the
Phase 96 policy constants (`UPGRADE_EFFECTIVE`, `DOWNGRADE_EFFECTIVE`,
`DEFAULT_CANCELLATION`, `IMMEDIATE_CANCELLATION_REQUIRES` in
`commercial-policy.ts`): `changePlan()` always applies immediately regardless
of upgrade/downgrade direction, and `cancelSubscription()` always cancels
immediately under the general `manage_billing` permission (OWNER / ADMIN /
BILLING_ADMIN), not a Billing-Admin-only immediate-cancellation gate. See
[`trial-upgrade-downgrade-cancellation.md`](./trial-upgrade-downgrade-cancellation.md)
for the full detail and the resulting owner decision.

## Related documents

- [`plan-and-entitlement-registry.md`](./plan-and-entitlement-registry.md)
- [`subscription-state-machine.md`](./subscription-state-machine.md)
- [`stripe-webhook-security.md`](./stripe-webhook-security.md)
- [`trial-upgrade-downgrade-cancellation.md`](./trial-upgrade-downgrade-cancellation.md)
- [`multi-currency-policy.md`](./multi-currency-policy.md)
- [`admin-override-boundary.md`](./admin-override-boundary.md)
- [`phase96-evidence-matrix.md`](./phase96-evidence-matrix.md)

# Phase 96 — Commercialisation, Billing & Entitlements: Evidence Matrix

This matrix maps each of the six Phase 96 closure gates to its acceptance
criterion, implementation, tests, database evidence and the commands used to
reproduce the evidence. It presents evidence only — **no PASS/FAIL verdict is
recorded here**; that determination is made separately.

Base: `d5242ff` (`fix(ai): /api/brain now invokes the full governance
pipeline`). Branch: `agent/phase96-commercialisation-billing-entitlements`.
Worktree: `E:\hermes-os-phase96`.

| Gate | Acceptance criterion | Implementation | Tests / dataset | Database evidence | Commands |
| --- | --- | --- | --- | --- | --- |
| **SERVER_SIDE_ENTITLEMENTS** | Every commercial decision (plan, subscription status, usage, override) is resolved server-side from injected snapshots; the client's claimed `organizationId`/plan/usage is never trusted; unknown plan/entitlement, missing subscription, unconfigured limit and read-only access mode all fail closed. | `src/lib/billing-governance/entitlement-resolver.ts` (`evaluateEntitlement`, `resolveEntitlement`); `entitlement-registry.ts` (fail-closed `CONFIGURATION_REQUIRED` for every unresolved numeric limit); `commercial-policy.ts` (`accessModeForStatus`, `accessModeAllowsCreate`); `runtime/entitlement-store.ts` (Prisma-backed store, every method fail-closed to `null` on any DB error); `runtime/require-entitlement.ts` (`enforceEntitlement`, wired into 4 production routes: `src/app/api/industrial/sites/route.ts`, `.../gateways/route.ts`, `.../assets/route.ts`, `src/app/api/organizations/[orgId]/invitations/route.ts`) | `src/lib/billing-governance/__tests__/entitlement-resolver.test.ts` (23 cases); `__tests__/registry.test.ts` (10 cases); `src/app/api/industrial/__tests__/entitlement-gating.test.ts` (4 cases, real route + stubbed store only); `__tests__/phase96-eval.test.ts` replaying `tests/fixtures/billing-governance/entitlement-decisions.jsonl` against zero-tolerance budgets `UNKNOWN_ENTITLEMENT_ALLOWED`, `MISSING_PAID_SUBSCRIPTION_ALLOWED`, `EXPIRED_SUBSCRIPTION_PAID_ACCESS`, `SUSPENDED_SUBSCRIPTION_PAID_ACCESS`, `OVER_LIMIT_CREATION`, `PERMANENT_UNAUDITED_OVERRIDE` | `Subscription` (Phase 96 columns: `trialStartedAt`, `trialEndsAt`, `currentPeriodStart/End`, `cancelAtPeriodEnd`, `graceEndsAt`, `suspendedAt`, `expiredAt`, `stateVersion`, `lastProviderEventId`); `OrganizationEntitlementOverride` (`expiresAt` NOT NULL); `Plan.planKey` (nullable — unmapped plan denies `UNKNOWN_PLAN`) — all in `prisma/schema.prisma` and `prisma/migrations/20260819000000_phase96_commercial_billing/migration.sql` | `npx vitest run src/lib/billing-governance/__tests__/ src/app/api/industrial/__tests__/entitlement-gating.test.ts`; `node scripts/ci/phase96-billing-governance-eval.mjs`; `npx tsc --noEmit` |
| **WEBHOOK_SIGNATURE** | The Stripe webhook rejects any request without a valid `stripe-signature` HMAC over the exact raw body, and rejects a timestamp outside tolerance; the signing secret is never optional (absence fails closed, `503`). | `src/app/api/billing/webhooks/stripe/route.ts` (`req.text()` raw body, `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)`); `getStripeClient()` in `src/lib/billing/stripe.ts`; optional `STRIPE_EXPECT_LIVEMODE` guard | `src/lib/billing-governance/__tests__/stripe-signature.test.ts` (5 cases: valid signature accepted, wrong secret rejected, tampered payload rejected, stale timestamp rejected, missing header rejected) — uses the Stripe SDK's own `generateTestHeaderString()`, no network | n/a (signature verification is stateless; the rejection path records a `billing.webhook_rejected` audit row with no `BillingWebhookEvent` claim) | `npx vitest run src/lib/billing-governance/__tests__/stripe-signature.test.ts`; `node scripts/ci/phase96-billing-governance-eval.mjs` (also runs the source secret-leak scan over this route's directory) |
| **WEBHOOK_IDEMPOTENCY** | A verified event is processed at most once; a duplicate or simultaneous re-delivery is ignored without re-running the handler; a failed attempt is retryable; out-of-order provider events never regress subscription state. | `src/lib/billing-governance/webhook-idempotency.ts` (`runIdempotentWebhook`); `runtime/webhook-store.ts` (`prismaWebhookClaimStore`, claims via the `(provider, providerEventId)` unique index, `P2002`-aware retry-after-`FAILED` logic); `runtime/subscription-events.ts` (`applySubscriptionProviderEvent` → `applyProviderEvent`, out-of-order/duplicate/terminal rejection) | `__tests__/webhook-idempotency.test.ts` (7 cases, incl. two simultaneous deliveries racing to exactly one `PROCESSED`); `__tests__/subscription-state-machine.test.ts` (8 cases); `__tests__/phase96-eval.test.ts` replaying `tests/fixtures/billing-governance/webhook-events.jsonl` against zero-tolerance budgets `DUPLICATE_WEBHOOK_STATE_MUTATION == 0`, `OUT_OF_ORDER_EVENT_REGRESSION == 0` | `BillingWebhookEvent` — `@@unique([provider, providerEventId])` (`prisma/schema.prisma` line ~936; migration `CREATE UNIQUE INDEX "BillingWebhookEvent_provider_providerEventId_key"`), `status` lifecycle `RECEIVED → PROCESSING → PROCESSED \| IGNORED \| FAILED`, `attemptCount` | `npx vitest run src/lib/billing-governance/__tests__/webhook-idempotency.test.ts src/lib/billing-governance/__tests__/subscription-state-machine.test.ts`; `node scripts/ci/phase96-billing-governance-eval.mjs`; CI job `phase96-postgres` applies the migration fresh (`npx prisma migrate deploy`) and re-runs it for idempotency (`npx prisma migrate status`) proving the unique index itself is created correctly |
| **SUBSCRIPTION_STATE_MACHINE** | Provider status strings never become authoritative directly; every `(state, event)` transition is explicit; an invalid, duplicate or out-of-order transition is rejected and state is provably unchanged. | `src/lib/billing-governance/subscription-state-machine.ts` (`TRANSITIONS` table, `nextState`, `applyProviderEvent`); `stripe-event-mapper.ts` (`mapStripeEventToDomain`, `eventForSubscriptionStatus`) | `__tests__/subscription-state-machine.test.ts` (8 cases); `__tests__/stripe-event-mapper.test.ts` (6 cases); `__tests__/phase96-eval.test.ts` replaying `tests/fixtures/billing-governance/subscription-transitions.jsonl` (per-pair transition-table fixture) and `webhook-events.jsonl` (multi-event sequences, asserting `expectFinal` and per-step `expectApplied`) | `SubscriptionStatus` enum extended additively with `INCOMPLETE`, `PAYMENT_FAILED`, `GRACE_PERIOD`, `SUSPENDED`, `CANCEL_AT_PERIOD_END` (migration `ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS ...`, 5 statements); `Subscription.stateVersion`, `lastProviderEventCreatedAt`, `lastProviderEventId` persist the out-of-order guard | `npx vitest run src/lib/billing-governance/__tests__/subscription-state-machine.test.ts src/lib/billing-governance/__tests__/stripe-event-mapper.test.ts`; `node scripts/ci/phase96-billing-governance-eval.mjs`; `npx prisma validate` |
| **CROSS_TENANT_BILLING_DENIAL** | A subscription, override or resource belonging to a different organisation never grants access, never mutates state, and is never disclosed (404/deny, not a cross-tenant echo). | `entitlement-resolver.ts` (`evaluateEntitlement` step 3, `sub.organisationId !== ctx.organisationId → deny("CROSS_TENANT")`; `overrideIsValid` rejects `override.organizationId !== ctx.organisationId`); `runtime/subscription-events.ts` (organisation resolved via the **local** subscription row, never a Stripe payload field); `runtime/override-service.ts` (`revokeEntitlementOverride` scopes its `updateMany` to the caller's `organizationId`, returning `NOT_FOUND` — not another tenant's row — on mismatch); pre-existing tenant checks reused unmodified: `src/app/api/billing/payments/route.ts` and `src/app/api/billing/invoices/route.ts` (`invoice.organizationId !== ctx.orgId → 404`) | `tests/fixtures/billing-governance/cross-tenant-attacks.jsonl` (4 adversarial fixtures: foreign subscription, foreign override, foreign Enterprise plan, foreign metered create) replayed by `__tests__/phase96-eval.test.ts` against the zero-tolerance `CROSS_TENANT_BILLING_ACCESS` budget; `__tests__/entitlement-resolver.test.ts` (dedicated cross-tenant cases) | `Subscription.organizationId` (indexed FK to `Organization`); `OrganizationEntitlementOverride.organizationId` (`onDelete: Cascade` FK, indexed with `entitlementKey`) | `npx vitest run src/lib/billing-governance/__tests__/entitlement-resolver.test.ts src/lib/billing-governance/__tests__/phase96-eval.test.ts`; `node scripts/ci/phase96-billing-governance-eval.mjs` |
| **BILLING_AUDIT** | Every commercial decision, webhook outcome, subscription transition, trial and override event is recorded via the platform audit service; no PAN, CVC, card/bank detail, provider secret, webhook signing secret, raw payload or billing address ever reaches an audit record, even when supplied by mistake. | `src/lib/billing-governance/audit.ts` (`BILLING_GOVERNANCE_AUDIT` action vocabulary; `ALLOWED_AUDIT_METADATA_KEYS` allow-list; `FORBIDDEN_KEY_PATTERN` defence-in-depth; `SECRET_VALUE_PATTERNS` value-level redaction; `buildBillingAuditMetadata`, `isMetadataClean`); called from `runtime/require-entitlement.ts`, `runtime/subscription-events.ts`, `runtime/override-service.ts`, `runtime/trial-service.ts`, and `src/app/api/billing/webhooks/stripe/route.ts` | `__tests__/money-and-audit.test.ts` (11 cases, incl. allow-list-only retention, secret-value redaction, nested-object drop, date coercion); `__tests__/phase96-eval.test.ts` replaying `tests/fixtures/billing-governance/audit-redaction.jsonl` (8 adversarial rows: card number, CVC, Stripe secret key, webhook signing secret in a free-text value, billing address, raw payload, IBAN, PAN-like value) against the zero-tolerance `SENSITIVE_BILLING_AUDIT_LEAK` budget | Audit rows are written through the pre-existing `recordAuditEvent()` service (`@/lib/audit/audit-service`, unmodified by this phase); the redaction guarantee is enforced **before** that call, not at the storage layer | `npx vitest run src/lib/billing-governance/__tests__/money-and-audit.test.ts src/lib/billing-governance/__tests__/phase96-eval.test.ts`; `node scripts/ci/phase96-billing-governance-eval.mjs` (also runs a static secret-pattern scan over the governance source tree itself) |

## CI jobs

| Job | Workflow | What it proves | Network / DB |
| --- | --- | --- | --- |
| `phase96-billing-governance` | `.github/workflows/ci.yml` (lines ~335–360) | Runs `scripts/ci/phase96-billing-governance-eval.mjs`: a source secret-leak scan over `src/lib/billing-governance`, `tests/fixtures/billing-governance` and `src/app/api/billing/webhooks/stripe`, then the full offline Vitest suite (`src/lib/billing-governance/__tests__/` + `src/app/api/industrial/__tests__/entitlement-gating.test.ts`) | None — deterministic, offline, no provider call, no service container |
| `phase96-postgres` | `.github/workflows/ci.yml` (lines ~374–425) | Fresh `prisma migrate deploy` against an empty `pgvector/pgvector:pg16` CI service container, idempotency re-run (`migrate deploy` + `migrate status`), `npm run db:validate`, then `scripts/ci/phase96-concurrency-rehearsal.mjs` — a real SERIALIZABLE-isolation concurrency proof (4 scenarios: ceilings 0/1/3/5 under concurrent attempts) mirroring `runtime/atomic-reservation.ts`'s count-then-insert pattern | A disposable, CI-only PostgreSQL service container (credentials scoped to CI, cannot reach staging/production) |

## Full validation commands (run from the worktree root)

```
npm run lint
npx tsc --noEmit
npm run test                                   # full Vitest suite, not just billing-governance
node scripts/ci/phase96-billing-governance-eval.mjs
npx prisma format && npx prisma validate && npx prisma generate
npm run build
```

`node scripts/ci/phase96-concurrency-rehearsal.mjs` additionally requires a
reachable PostgreSQL instance via `DATABASE_URL` (as configured in the
`phase96-postgres` CI job) and is not part of the offline suite.

## Limitations and owner decisions still required (cross-cutting)

These apply across more than one gate above and are not repeated per-row:

- **Numeric limits and prices are intentionally absent from the registry.**
  Every metered entitlement resolves `CONFIGURATION_REQUIRED` on every plan;
  Professional and Team have no configured price. See
  [`plan-and-entitlement-registry.md`](./plan-and-entitlement-registry.md)
  for the full list of ten owner decisions this blocks.
- **Two library services have no calling route yet**: `runtime/override-service.ts`
  (`createEntitlementOverride`/`revokeEntitlementOverride`) and
  `runtime/trial-service.ts` (`startAutomaticTrial`). Their logic is tested
  in isolation; there is no admin API endpoint or "start trial" endpoint in
  this codebase to exercise them end-to-end, and no test calls the service
  functions themselves against a Prisma client (fake or real).
- **The pre-existing self-serve subscription route
  (`/api/billing/subscription`) does not call the Phase 96 state machine**
  and does not enforce `UPGRADE_EFFECTIVE`/`DOWNGRADE_EFFECTIVE`/
  `IMMEDIATE_CANCELLATION_REQUIRES`. See
  [`trial-upgrade-downgrade-cancellation.md`](./trial-upgrade-downgrade-cancellation.md).
- **Refund bounding (`refundWithinBounds`) and currency immutability
  (`currencyIsImmutable`) are unit-tested pure functions with no calling
  route**; `Payment.refundedAmount` and related columns exist but nothing
  writes to them yet. See
  [`multi-currency-policy.md`](./multi-currency-policy.md).
- **Legacy invoice/payment generation (`src/lib/billing/invoices.ts`,
  `payments.ts`) still performs floating-point arithmetic** on values later
  stored in the same `Decimal(20,4)` columns the new `money.ts` module is
  designed to protect. The new module has not been retrofitted into these
  Phase 31 call paths.
- **CROSS_TENANT_BILLING_DENIAL evidence is fixture/unit-level**: it proves
  the pure resolver and the wired `sites`/`gateways`/`assets`/`invitations`
  routes deny cross-tenant access with a stubbed store; it does not include
  a live-database integration test that races two organisations' writes
  against the same table to prove tenant isolation under concurrent load
  (the `phase96-postgres` concurrency rehearsal proves ceiling-safety within
  a single organisation, not cross-tenant isolation specifically).
- **WEBHOOK_SIGNATURE and WEBHOOK_IDEMPOTENCY evidence does not include a
  live Stripe test-mode account** — verification is proven against the
  Stripe SDK's own offline test-header generator, and idempotency is proven
  against an in-memory store (unit test) plus a fresh-migration/idempotent-
  redeploy proof of the underlying unique index (CI), not a live end-to-end
  webhook delivery.

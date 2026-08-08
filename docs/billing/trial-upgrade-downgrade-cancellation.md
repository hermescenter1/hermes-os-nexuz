# Phase 96 — Trial, Upgrade, Downgrade & Cancellation

## Owner-approved policy constants

`src/lib/billing-governance/commercial-policy.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `TRIAL_DURATION_DAYS` | `14` | Length of the automatic trial |
| `TRIAL_MAX_PER_ORGANISATION` | `1` | At most one **automatic** trial per organisation |
| `PAYMENT_FAILURE_GRACE_PERIOD_DAYS` | `7` | Grace window after a payment failure before suspension |
| `UPGRADE_EFFECTIVE` | `"IMMEDIATE"` | Upgrades take effect immediately |
| `DOWNGRADE_EFFECTIVE` | `"END_OF_CURRENT_PERIOD"` | Downgrades take effect at the end of the current billing period |
| `DEFAULT_CANCELLATION` | `"END_OF_CURRENT_PERIOD"` | A cancellation defaults to taking effect at period end |
| `IMMEDIATE_CANCELLATION_REQUIRES` | `"BILLING_ADMIN"` | Immediate cancellation is a Billing-Admin-only privileged action |
| `AUTOMATIC_TENANT_DATA_DELETION_FORBIDDEN` | `true` | No automatic deletion of tenant data, ever |

These are version-controlled, typed constants — not comments or documentation
promises — and are consumed by the pure `commercial-policy.ts` helpers
(`accessModeForStatus`, `accessModeAllowsCreate`, `statusGrantsPaidAccess`).

## Trial lifecycle

**Enforcement is database-authoritative, not application logic.**
`OrganizationTrial.organizationId` carries a `@unique` constraint
(`prisma/schema.prisma`, migration
`prisma/migrations/20260819000000_phase96_commercial_billing/migration.sql`)
— a second `startAutomaticTrial()` call for the same organisation hits the
unique constraint and is rejected as `TRIAL_ALREADY_USED`
(`runtime/trial-service.ts`). A client cannot reset or recreate a trial by
retrying, clearing cookies, or racing the request.

- `startAutomaticTrial({ organizationId, planKey })` — validates the plan is
  `isTrialEligiblePlan()` (`plan-registry.ts`: only `PROFESSIONAL` and `TEAM`
  are `trialEligible: true`; `COMMUNITY` is already free and `ENTERPRISE` is
  contract-only), sets `endsAt = now + 14 days`, and audits
  `billing.trial_started` (redacted metadata: `organizationId`, `planKey`,
  `trialEndsAt`).
- `trialIsActive(organizationId, now)` — fails closed (`false`) if the
  database is unreachable; `true` only while `endsAt > now` and the trial has
  not been converted.
- `markTrialConverted(organizationId)` — records `convertedAt`; does not
  delete or alter the trial row, and audits `billing.trial_converted`.
- An **exceptional trial extension** is explicitly documented as a separate,
  audited, **time-bounded** `OrganizationEntitlementOverride`
  (`override-service.ts`), never a silent mutation of `trialEndsAt` — see
  [`admin-override-boundary.md`](./admin-override-boundary.md).

**Not yet wired**: `trial-service.ts` has no calling API route in this
codebase snapshot (confirmed by repository search) — there is no
`POST /api/billing/trial`-style endpoint. The one-trial-per-organisation
guarantee is real at the database level, but nothing in the current UI/API
surface actually starts an automatic trial yet.

## Upgrade / downgrade / cancellation

### What the state machine supports (deterministic, tested)

The reducer (`subscription-state-machine.ts`) has explicit events for every
policy-described transition:

- `SCHEDULE_CANCELLATION` → `CANCEL_AT_PERIOD_END` (from `TRIALING` or
  `ACTIVE`) — the end-of-period path for both a downgrade-to-cancel and a
  default cancellation.
- `RESUME` → `ACTIVE` (from `CANCEL_AT_PERIOD_END`) — undo a scheduled
  cancellation before the period ends.
- `CANCEL_IMMEDIATELY` → `CANCELED` — available from almost every non-terminal
  state; the state machine itself does not gate *who* may issue this event
  (it is a pure reducer over events, not a permission engine) — the
  Billing-Admin-only restriction is a **caller-side policy**, described by
  `IMMEDIATE_CANCELLATION_REQUIRES` and intended to be enforced at the route
  that issues `CANCEL_IMMEDIATELY`.
- `PERIOD_ENDED` → `EXPIRED` (trial that never converted) or `CANCELED` (from
  `CANCEL_AT_PERIOD_END`) — the natural end-of-period outcome.

### What is actually wired in production routes today

The **only** caller of the state machine in production code is the Stripe
webhook (`applySubscriptionProviderEvent()`, see
[`subscription-state-machine.md`](./subscription-state-machine.md)) — i.e.
transitions driven by what Stripe reports (a customer changing their plan or
cancelling in the Stripe-hosted portal, or Hermes OS's own Stripe API calls
reflecting back through the webhook).

The pre-existing **self-serve** subscription route
(`src/app/api/billing/subscription/route.ts`, Phase 31,
`src/lib/billing/subscriptions.ts`) is the direct, in-app path for a
customer or admin to change plan or cancel, and it predates Phase 96:

- `PATCH` (`changePlan`) sets `status: "ACTIVE"` and the new `planId`
  **immediately**, for both an upgrade and a downgrade — there is no
  `CANCEL_AT_PERIOD_END`-equivalent scheduling for a downgrade, and no
  distinction is made based on `isUpgrade` beyond which audit action name is
  used (`SUBSCRIPTION_UPGRADED` vs `SUBSCRIPTION_DOWNGRADED`).
- `DELETE` (`cancelSubscription`) sets `status: "CANCELED"` and
  `autoRenew: false` **immediately**, gated only by the general
  `manage_billing` permission (`OWNER`, `ADMIN`, `BILLING_ADMIN` — see
  `src/lib/org/rbac.ts`), not a Billing-Admin-only check. There is no
  end-of-period default cancellation path in this route.

**This is a real gap between the declared policy constants and the
currently-wired self-serve route**, not an oversight in this documentation.
The Phase 96 state machine, its transition table, and the
`commercial-policy.ts` constants that describe the intended timing rules all
exist and are fully tested in isolation; what has not yet happened is
re-pointing `/api/billing/subscription` (`PATCH`/`DELETE`) at
`applyProviderEvent`/`applySubscriptionProviderEvent` and adding an
explicit `BILLING_ADMIN`-only role check for an immediate-cancellation
branch. Data is still never deleted by either path (see below), so tenant
data safety is unaffected by this gap — only the *timing* and *privilege*
guarantees around upgrade/downgrade/cancellation are not yet enforced at the
self-serve route.

### Owner decision / follow-up required

- Confirm whether `/api/billing/subscription` should be migrated onto the
  Phase 96 state machine (recommended, so the tested policy actually governs
  the customer-facing path), and whether immediate cancellation should
  require a distinct route/permission check restricted to `BILLING_ADMIN`
  (today `manage_billing` also grants `OWNER`/`ADMIN`).

## Grace period and suspension (payment failure path)

Driven entirely by the state machine + webhook, already live for events
Stripe sends:

`ACTIVE` → (`PAYMENT_PAST_DUE`) → `PAST_DUE` → (`ENTER_GRACE`) →
`GRACE_PERIOD` (`graceEndsAt = now + 7 days`) → (`SUSPEND`) → `SUSPENDED`
(`suspendedAt` recorded) → recovery via `ACTIVATE` → `ACTIVE`
(`graceEndsAt` cleared) at any point in the chain, or `EXPIRE` from
`SUSPENDED` → `EXPIRED`.

`accessModeForStatus()` classifies `PAST_DUE`/`PAYMENT_FAILED`/
`GRACE_PERIOD` as `FULL_ACCESS` (the organisation keeps working during the
grace window) and only `SUSPENDED`/`CANCELED`/`EXPIRED` as `READ_ONLY`.

## Data preservation guarantee

`AUTOMATIC_TENANT_DATA_DELETION_FORBIDDEN = true` is not merely a comment —
every downstream mechanism respects it:

- `accessModeForStatus()` never returns anything that triggers a delete; the
  worst outcome is `READ_ONLY` (block new creation) or `REMEDIATION_ONLY`.
- The Phase 96 migration is additive-only (no `DROP TABLE`/`DROP COLUMN`);
  existing `Subscription`/`Plan`/`Payment` rows survive unchanged.
- `enforceEntitlement()` (`runtime/require-entitlement.ts`) only ever blocks
  a **create/consume** action (`requestedUnits > 0`); it never triggers a
  delete of existing resources on denial.
- No file in this package deletes `IndustrialSite`, `IndustrialGateway`,
  `IndustrialAsset`, documents or any other tenant data as a side effect of
  expiry, suspension, cancellation or downgrade.

## Tests

- `src/lib/billing-governance/__tests__/subscription-state-machine.test.ts`
  — transition table + idempotency/out-of-order (8 cases).
- `src/lib/billing-governance/__tests__/registry.test.ts` — plan/trial
  eligibility assertions (10 cases; includes `isTrialEligiblePlan`).
- `src/lib/billing-governance/__tests__/phase96-eval.test.ts` — replays
  `tests/fixtures/billing-governance/subscription-transitions.jsonl`
  against the real reducer.

There is no automated test exercising `startAutomaticTrial`'s unique-index
enforcement against a real database in this package (it is covered by unit
assertions on the pure validation branches, not a live-Postgres duplicate
attempt); the `phase96-postgres` CI job proves the analogous unique-index /
concurrency guarantee for `BillingWebhookEvent` and the metered-reservation
path, not specifically `OrganizationTrial`.

# Phase 96 — Subscription State Machine

Source: `src/lib/billing-governance/subscription-state-machine.ts`,
`stripe-event-mapper.ts`, `commercial-policy.ts`, and the runtime binding
`runtime/subscription-events.ts`.

Provider (Stripe) status strings are **never** written directly into the
database as authoritative state. They are first mapped to an internal
`SubscriptionEvent`, then reduced through an explicit transition table. Any
`(state, event)` pair not present in the table is rejected — the current
state is preserved, never guessed forward.

## Domain states

`DOMAIN_SUBSCRIPTION_STATES` (`types.ts`) — richer than the persisted Prisma
`SubscriptionStatus` enum; the state machine is the authority and the enum
was extended additively (Phase 96 migration) to hold every value.

| State | Meaning |
| --- | --- |
| `NONE` | No subscription row at all → Community baseline resolution only (not a machine state) |
| `INCOMPLETE` | Checkout started but not completed |
| `TRIALING` | Inside the 14-day automatic trial |
| `ACTIVE` | Paid and current |
| `PAST_DUE` | Payment overdue, inside the payment retry window |
| `PAYMENT_FAILED` | A payment attempt failed |
| `GRACE_PERIOD` | Inside the 7-day payment-failure grace window |
| `SUSPENDED` | Access restricted after grace expiry |
| `CANCEL_AT_PERIOD_END` | Cancellation scheduled; still paid until period end |
| `CANCELED` | Cancelled (immediately or at period end) |
| `EXPIRED` | Terminal — trial lapsed without conversion, or a cancelled/suspended subscription aged out |

`TERMINAL_STATES = {"EXPIRED"}` — no outgoing transitions.

## Internal domain events

`SubscriptionEvent` (`subscription-state-machine.ts`): `START_TRIAL`,
`ACTIVATE`, `PAYMENT_PAST_DUE`, `PAYMENT_FAILED`, `ENTER_GRACE`, `SUSPEND`,
`SCHEDULE_CANCELLATION`, `RESUME`, `CANCEL_IMMEDIATELY` (Billing-Admin-only
privileged path by policy, not currently enforced at role level inside the
reducer itself — see the "Known gap" note below), `PERIOD_ENDED`, `EXPIRE`.

## Transition table

| From \ Event | Allowed events → next state |
| --- | --- |
| `INCOMPLETE` | `START_TRIAL`→`TRIALING`, `ACTIVATE`→`ACTIVE`, `CANCEL_IMMEDIATELY`→`CANCELED`, `EXPIRE`→`EXPIRED` |
| `TRIALING` | `ACTIVATE`→`ACTIVE`, `SCHEDULE_CANCELLATION`→`CANCEL_AT_PERIOD_END`, `CANCEL_IMMEDIATELY`→`CANCELED`, `PAYMENT_PAST_DUE`→`PAST_DUE`, `PERIOD_ENDED`→`EXPIRED`, `EXPIRE`→`EXPIRED` |
| `ACTIVE` | `PAYMENT_PAST_DUE`→`PAST_DUE`, `PAYMENT_FAILED`→`PAYMENT_FAILED`, `SCHEDULE_CANCELLATION`→`CANCEL_AT_PERIOD_END`, `CANCEL_IMMEDIATELY`→`CANCELED` |
| `PAST_DUE` | `ACTIVATE`→`ACTIVE`, `PAYMENT_FAILED`→`PAYMENT_FAILED`, `ENTER_GRACE`→`GRACE_PERIOD`, `SUSPEND`→`SUSPENDED`, `CANCEL_IMMEDIATELY`→`CANCELED` |
| `PAYMENT_FAILED` | `ACTIVATE`→`ACTIVE`, `ENTER_GRACE`→`GRACE_PERIOD`, `SUSPEND`→`SUSPENDED`, `CANCEL_IMMEDIATELY`→`CANCELED` |
| `GRACE_PERIOD` | `ACTIVATE`→`ACTIVE`, `SUSPEND`→`SUSPENDED`, `CANCEL_IMMEDIATELY`→`CANCELED` |
| `SUSPENDED` | `ACTIVATE`→`ACTIVE`, `CANCEL_IMMEDIATELY`→`CANCELED`, `EXPIRE`→`EXPIRED` |
| `CANCEL_AT_PERIOD_END` | `RESUME`→`ACTIVE`, `ACTIVATE`→`ACTIVE`, `PERIOD_ENDED`→`CANCELED`, `CANCEL_IMMEDIATELY`→`CANCELED` |
| `CANCELED` | `EXPIRE`→`EXPIRED` |
| `EXPIRED` | (none — terminal) |

Any pair not listed above is an **invalid transition**: `nextState()` returns
`null` and the caller keeps the current state unchanged.

## Stripe → domain event mapping

`mapStripeEventToDomain()` (`stripe-event-mapper.ts`) reads only a minimal,
already-verified view (`type`, `subscriptionStatus`, `cancelAtPeriodEnd`) —
never a raw provider payload.

| Stripe event type | Mapping |
| --- | --- |
| `customer.subscription.created` / `.updated` / `.resumed` | `subscriptionStatus` → `eventForSubscriptionStatus()` (below); unknown status → `null` (no mutation) |
| `customer.subscription.paused` | `SUSPEND` |
| `customer.subscription.deleted` | `CANCEL_IMMEDIATELY` |
| `invoice.payment_succeeded` / `invoice.paid` | `ACTIVATE` |
| `invoice.payment_failed` | `PAYMENT_FAILED` |
| `customer.subscription.trial_will_end`, `invoice.upcoming`, `invoice.created`, `invoice.finalized` | Informational — `null`, never mutates state |
| any other type | `null` — safely ignored, acknowledged 200 |

`eventForSubscriptionStatus(status, cancelAtPeriodEnd)`:

| Stripe status | cancel_at_period_end | Domain event |
| --- | --- | --- |
| `active` / `trialing` | `true` | `SCHEDULE_CANCELLATION` |
| `trialing` | `false` | `START_TRIAL` |
| `active` | `false` | `ACTIVATE` |
| `past_due` | — | `PAYMENT_PAST_DUE` |
| `unpaid` | — | `PAYMENT_FAILED` |
| `paused` | — | `SUSPEND` |
| `canceled` | — | `CANCEL_IMMEDIATELY` |
| `incomplete_expired` | — | `EXPIRE` |
| `incomplete` | — | `null` (stays `INCOMPLETE`) |
| anything else | — | `null` |

## Out-of-order / idempotency protection

`applyProviderEvent(current, envelope)` — the authority for whether a
provider-originated event is allowed to mutate state, independent of the
webhook claim layer:

- **Terminal guard** — `EXPIRED` never accepts a transition (`reason: "TERMINAL"`).
- **Duplicate guard** — the same `providerEventId` as the last applied event
  is rejected (`reason: "DUPLICATE"`), state unchanged.
- **Out-of-order guard** — a `providerCreatedAt` strictly older than the last
  applied event's timestamp is rejected (`reason: "OUT_OF_ORDER"`), state
  unchanged, **even if it arrives after** a newer event (protects against
  redelivery/reordering by the provider or network).
- **Invalid transition guard** — a `(state, event)` pair absent from the
  transition table is rejected (`reason: "INVALID_TRANSITION"`).
- On success, `stateVersion` is incremented and
  `lastProviderEventId`/`lastProviderEventCreatedAt` are advanced —
  persisted on `Subscription` (`prisma/schema.prisma`, Phase 96 columns).

## Access mode derived from state (`commercial-policy.ts`)

`accessModeForStatus(status)`:

| Domain states | Access mode | Meaning |
| --- | --- | --- |
| `NONE`, `TRIALING`, `ACTIVE`, `CANCEL_AT_PERIOD_END`, `PAST_DUE`, `PAYMENT_FAILED`, `GRACE_PERIOD` | `FULL_ACCESS` | Normal operation (paid entitlements still gated separately by plan) |
| `INCOMPLETE` | `REMEDIATION_ONLY` | Must complete checkout before normal use |
| `SUSPENDED`, `CANCELED`, `EXPIRED` | `READ_ONLY` | Data preserved; no new resources created |

`accessModeAllowsCreate(mode)` is `true` only for `FULL_ACCESS`. Read-only and
remediation-only modes are explicitly documented to **never** block invoice
history, compliance data export or account recovery — they only block new
resource creation (`enforceEntitlement` → `denyReasonForWriteBlock`).

## Lifecycle side effects on transition (`runtime/subscription-events.ts`)

| Entering state | Field(s) set |
| --- | --- |
| `GRACE_PERIOD` | `graceEndsAt = now + 7 days` (`PAYMENT_FAILURE_GRACE_PERIOD_DAYS`) |
| `SUSPENDED` | `suspendedAt = now` |
| `CANCEL_AT_PERIOD_END` | `cancelAtPeriodEnd = true` |
| `CANCELED` | `cancelledAt = now` |
| `EXPIRED` | `expiredAt = now` |
| `ACTIVE` (recovery) | `graceEndsAt = null` |

Every applied transition is audited as
`billing.subscription_transitioned` with `previousStatus`/`nextStatus`
(redacted allow-list metadata, `audit.ts`).

## Where this is (and is not) wired

- **Wired**: the Stripe webhook route
  (`src/app/api/billing/webhooks/stripe/route.ts`) is the only caller of
  `applySubscriptionProviderEvent()` in production code today. Every
  subscription/invoice event Stripe sends goes through this exact reducer.
- **Not wired**: the pre-existing self-serve subscription route
  (`src/app/api/billing/subscription/route.ts` →
  `src/lib/billing/subscriptions.ts`, Phase 31) does **not** call the state
  machine. `changePlan()` sets `status: "ACTIVE"` directly on any plan
  change (no `SCHEDULE_CANCELLATION` for a downgrade, no distinction between
  upgrade and downgrade timing) and `cancelSubscription()` sets
  `status: "CANCELED"` directly (no `CANCEL_AT_PERIOD_END` intermediate
  state, no Billing-Admin-only gate for the immediate path). See
  [`trial-upgrade-downgrade-cancellation.md`](./trial-upgrade-downgrade-cancellation.md)
  for the resulting owner decision.

## Tests

- `src/lib/billing-governance/__tests__/subscription-state-machine.test.ts` —
  8 cases (direct transition table + `applyProviderEvent` behaviour).
- `src/lib/billing-governance/__tests__/stripe-event-mapper.test.ts` — 6
  cases (Stripe status → domain event mapping, including the
  `cancel_at_period_end` branch).
- `src/lib/billing-governance/__tests__/phase96-eval.test.ts` — replays
  `tests/fixtures/billing-governance/subscription-transitions.jsonl` and
  `webhook-events.jsonl` against the real reducer, and asserts the
  zero-tolerance budgets `DUPLICATE_WEBHOOK_STATE_MUTATION == 0` and
  `OUT_OF_ORDER_EVENT_REGRESSION == 0`.

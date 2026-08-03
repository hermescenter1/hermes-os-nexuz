# Phase 96 — Stripe Webhook Security

Endpoint: `POST /api/billing/webhooks/stripe`
(`src/app/api/billing/webhooks/stripe/route.ts`). Deliberately **not** behind
session auth — Stripe calls it server-to-server; authenticity is proved by
the signature, not a session.

## 1. Signature verification

- The route reads the **raw request body as text** (`req.text()`) before any
  parsing, and the `stripe-signature` header. A missing header is rejected
  immediately (`400`).
- Verification uses the Stripe SDK's `stripe.webhooks.constructEvent(rawBody,
  sig, webhookSecret)` (`src/lib/billing/stripe.ts` → `getStripeClient()`),
  which performs an **HMAC-SHA256** check of the raw payload against
  `STRIPE_WEBHOOK_SECRET` and enforces the SDK's default **timestamp
  tolerance** (300 seconds) to reject replayed-but-correctly-signed old
  payloads. Any failure (bad signature, tampered body, wrong secret, stale
  timestamp) throws and the route returns `400 Invalid signature` — no event
  processing occurs and a `billing.webhook_rejected` audit event is recorded.
- `STRIPE_WEBHOOK_SECRET` absent → `503 Webhook secret not configured` (fail
  closed, never silently accepted).
- An optional `STRIPE_EXPECT_LIVEMODE` environment guard rejects a
  live/test-mode mismatch (`400 Environment mismatch`) when configured.

Offline proof (no network, no real Stripe account): `src/lib/billing-governance/__tests__/stripe-signature.test.ts`
uses the Stripe SDK's own `generateTestHeaderString()` with a clearly-labelled
test-only secret (`whsec_phase96_test_only_secret_do_not_use_in_prod`) to
prove: a correctly signed payload is accepted; a wrong signing secret is
rejected; a tampered payload (same signature) is rejected; a timestamp
outside tolerance is rejected; a missing signature header is rejected.

## 2. Idempotency / replay / concurrent-delivery protection

Every **signature-verified** event is run through
`runIdempotentWebhook(prismaWebhookClaimStore(), envelope, handler)`
(`webhook-idempotency.ts` + `runtime/webhook-store.ts`):

- The claim mechanism is the **database-level unique constraint**
  `BillingWebhookEvent_provider_providerEventId_key` on
  `(provider, providerEventId)` — not an application-level lock, so it holds
  under real concurrent requests.
- `claim()` attempts an `INSERT ... status = "PROCESSING"`. A concurrent
  duplicate delivery hits the unique constraint (`P2002`) and is told
  `"DUPLICATE"` — the handler never runs a second time.
- An already `PROCESSED`/`IGNORED` event → `"DUPLICATE"` (never reprocessed).
- A previously `FAILED` event may be **re-claimed** via a conditional
  `updateMany({ where: { id, status: "FAILED" } })` — only one concurrent
  retry can win the row.
- No database reachable → `claim()` returns `"DUPLICATE"` (fail closed: an
  event that cannot be durably claimed is never processed).
- On success the handler's outcome is recorded as `PROCESSED` or `IGNORED`
  (no-op, e.g. an unhandled Stripe event type); on a thrown error the event
  is marked `FAILED` (retryable) and **never** marked processed.
- Only the envelope is stored (`provider`, `providerEventId`,
  `providerCreatedAt`, `eventType`, and a SHA-256 hash of the referenced
  object id via `hashObjectReference()`) — never the raw Stripe payload, card
  data or a secret.

Proof: `src/lib/billing-governance/__tests__/webhook-idempotency.test.ts` (7
cases) — a fresh event processes once; a no-op handler marks `IGNORED`; a
duplicate delivery of a processed event is ignored and the handler does not
run again; **two simultaneous deliveries** race and exactly one processes,
the other reports `DUPLICATE`; a throw marks `FAILED` and permits a later
retry; a failed event is never marked processed.

## 3. Out-of-order protection

Idempotency (above) prevents an event being applied twice; out-of-order
protection prevents an **older but not-yet-seen** event from regressing state
after a newer one has already been applied. This is enforced inside the
subscription reducer itself (`applyProviderEvent()`, see
[`subscription-state-machine.md`](./subscription-state-machine.md)), not the
webhook claim layer — the two are deliberately separate concerns. A rejected
out-of-order event is recorded as
`billing.webhook_out_of_order_ignored` (redacted audit), and the webhook
route still returns `200` (Stripe should not retry an event that was
correctly evaluated and intentionally not applied).

## 4. Tenant ownership — server-owned, never payload-derived

`applySubscriptionProviderEvent()` (`runtime/subscription-events.ts`) resolves
the target `Subscription` row by the **server's own** `localSubscriptionId`
(found via `findSubscriptionByStripeId(stripeSubscriptionId)` in the route,
using the Stripe subscription id embedded in the *verified* event object) and
then reads `sub.organizationId` from that row for the audit event. A valid
Stripe signature proves the event is authentically from Stripe — it does
**not** prove which tenant it belongs to, so the organisation is never taken
from a `metadata.organizationId`-style payload field for state transitions.
(`checkout.session.completed` is the one event where `session.metadata`
supplies `organizationId`/`planId` for the *initial* subscription creation —
this is the standard Stripe Checkout pattern for linking a new customer to a
tenant and is distinct from mutating an *existing* tenant's state from
payload data.)

An event whose Stripe subscription id has no matching local row is `IGNORED`
(not an error) — a foreign or unrecognised subscription can never mutate a
Hermes OS tenant's state.

## 5. Audit trail

Every accepted, rejected, duplicate-ignored and out-of-order-ignored outcome
is recorded via `recordAuditEvent()` using the billing action vocabulary
(`BILLING_GOVERNANCE_AUDIT` in `audit.ts`:
`webhook_accepted` — recorded transitively via `subscription_transitioned` —
`webhook_rejected`, `webhook_duplicate_ignored`,
`webhook_out_of_order_ignored`) and `buildBillingAuditMetadata()`, which
strips anything not on an explicit allow-list (`ALLOWED_AUDIT_METADATA_KEYS`)
and additionally scrubs any Stripe secret key, webhook signing secret,
PEM private key or PAN-like sequence found in an allow-listed string value.
See [`admin-override-boundary.md`](./admin-override-boundary.md) and the
audit gate in [`phase96-evidence-matrix.md`](./phase96-evidence-matrix.md)
for the full redaction contract.

## Handled event types

`HANDLED_STRIPE_EVENT_TYPES` (`stripe-event-mapper.ts`):
`customer.subscription.created`, `.updated`, `.resumed`, `.paused`,
`.deleted`, `invoice.payment_succeeded`, `invoice.paid`,
`invoice.payment_failed`. `checkout.session.completed` is additionally
handled by the route for subscription creation/linking. Every other event
type is acknowledged `200` and recorded as safely ignored — Stripe is never
left retrying an event Hermes OS does not act on.

## Tests and CI

- `src/lib/billing-governance/__tests__/stripe-signature.test.ts` (5 cases)
- `src/lib/billing-governance/__tests__/webhook-idempotency.test.ts` (7 cases)
- `src/lib/billing-governance/__tests__/stripe-event-mapper.test.ts` (6 cases)
- `src/lib/billing-governance/__tests__/phase96-eval.test.ts` — replays
  `tests/fixtures/billing-governance/webhook-events.jsonl` and asserts
  `DUPLICATE_WEBHOOK_STATE_MUTATION == 0` and
  `OUT_OF_ORDER_EVENT_REGRESSION == 0`.
- CI: `.github/workflows/ci.yml` → `phase96-billing-governance` job runs
  `scripts/ci/phase96-billing-governance-eval.mjs`, which additionally scans
  the governance source, fixtures and this route's directory for committed
  secret patterns (Stripe secret key, webhook signing secret, PEM private
  key) before running the suite.

## Limitations

- The offline suite proves signature/idempotency/out-of-order logic against
  the Stripe SDK's own test-header generator and an in-memory/stubbed claim
  store; it does not exercise a live Stripe test-mode account or a live
  PostgreSQL unique-constraint race under real network conditions. The
  `phase96-postgres` CI job proves the analogous SERIALIZABLE-transaction
  race for metered-resource reservations (see
  [`phase96-evidence-matrix.md`](./phase96-evidence-matrix.md)) but does not
  specifically race two `BillingWebhookEvent` inserts against a live
  database.
- `checkout.session.completed` trusts `session.metadata.organizationId` for
  **initial** subscription creation; this metadata is set server-side when
  the Checkout Session is created (not shown in the files reviewed for this
  package) and its integrity depends on that creation path also being
  server-authoritative.

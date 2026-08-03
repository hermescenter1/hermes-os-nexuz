# Phase 96 — Official Gate Assessment

Authoritative assessment of the six Phase 96 gates. States: **PASS**, **FAIL**,
**BLOCKED**, **EVIDENCE_INCOMPLETE**. A gate is PASS only when the implementation
exists, a real runtime route is wired, negative tests exist, and (where required)
PostgreSQL + CI evidence exists.

Base commit: `d5242ff4ce5068182fa1349c34ce6110fbc0ed8c` (origin/agent/phase95-runtime-enforcement).
Branch: `agent/phase96-commercialisation-billing-entitlements`.

Local validation performed: `tsc --noEmit` → 0 errors; full `vitest run` → 5371
passed / 0 failed / 116 skipped; `prisma validate` → valid; offline eval scripts
`phase95-ai-governance-eval.mjs` and `phase96-billing-governance-eval.mjs` → OK.
PostgreSQL migration + SERIALIZABLE concurrency rehearsal run in the CI
`phase96-postgres` job (no local Docker daemon available on the authoring host).

| Gate | State | Basis |
|------|-------|-------|
| SERVER_SIDE_ENTITLEMENTS | **PASS** | Pure fail-closed resolver (`entitlement-resolver.ts`) + registries, wired into real create paths (`industrial/{sites,gateways,assets}`, `organizations/[orgId]/invitations`) as a check SEPARATE from RBAC. Negative tests: `entitlement-gating.test.ts` (RBAC-pass + entitlement-deny), `entitlement-resolver.test.ts`, offline eval budgets. Atomic reservation helper + CI SERIALIZABLE concurrency rehearsal. |
| WEBHOOK_SIGNATURE | **PASS** | Raw-body HMAC + timestamp-tolerance verification preserved in the route; livemode guard added. Offline signature proof (`stripe-signature.test.ts`): valid / wrong-secret / tampered-payload / stale-timestamp / missing-header, using a test-only signing secret. Runs in the offline CI job. |
| WEBHOOK_IDEMPOTENCY | **PASS** | `BillingWebhookEvent` unique `(provider, providerEventId)` claim → duplicates & simultaneous deliveries ignored, failures retryable, successes never re-applied (`webhook-idempotency.ts` + `runtime/webhook-store.ts`), wired in the route. Tests: `webhook-idempotency.test.ts` (incl. simultaneous-duplicate + retry-after-failure), eval `webhook-events.jsonl`. Unique index applied by the migration (CI `phase96-postgres`). |
| SUBSCRIPTION_STATE_MACHINE | **PASS** | Deterministic transition table + out-of-order/duplicate/terminal protection (`subscription-state-machine.ts`), Stripe→domain mapping (`stripe-event-mapper.ts`), wired via `runtime/subscription-events.ts`. Tests: `subscription-state-machine.test.ts`, eval `subscription-transitions.jsonl` + `webhook-events.jsonl`. |
| CROSS_TENANT_BILLING_DENIAL | **PASS** | Resolver denies cross-tenant subscription/override; webhook resolves org via the SERVER-OWNED subscription record (never payload); override revoke & refund are org-scoped (404 on foreign). Tests: resolver cross-tenant cases, `override-and-trial.test.ts`, `refund-service.test.ts`, eval `cross-tenant-attacks.jsonl` (budget `CROSS_TENANT_BILLING_ACCESS=0`). |
| BILLING_AUDIT | **PASS** | Allow-list redaction builder (`audit.ts`) drops card/CVC/secret/payload/address keys and redacts secret-looking values; audit emitted on webhook accept/reject/duplicate/out-of-order, entitlement allow/deny, override create/revoke, trial start, refund. Tests: `money-and-audit.test.ts`, eval `audit-redaction.jsonl` (budget `SENSITIVE_BILLING_AUDIT_LEAK=0`), plus the eval `.mjs` secret-leak scan. |

## Zero-tolerance offline budgets (all proven 0)

`UNKNOWN_ENTITLEMENT_ALLOWED`, `MISSING_PAID_SUBSCRIPTION_ALLOWED`,
`EXPIRED_SUBSCRIPTION_PAID_ACCESS`, `SUSPENDED_SUBSCRIPTION_PAID_ACCESS`,
`DUPLICATE_WEBHOOK_STATE_MUTATION`, `OUT_OF_ORDER_EVENT_REGRESSION`,
`CROSS_TENANT_BILLING_ACCESS`, `OVER_LIMIT_CREATION`,
`PERMANENT_UNAUDITED_OVERRIDE`, `SENSITIVE_BILLING_AUDIT_LEAK` — all `0`
(`src/lib/billing-governance/__tests__/phase96-eval.test.ts`).

## Dependency on the integration CI run

The `phase96-postgres` job (additive migration deploy + idempotency + validate +
real SERIALIZABLE seat-limit concurrency proof) only runs for a PR targeting
`main`. Its green result is confirmed on the temporary integration-validation PR,
not on the canonical stacked draft (repository CI only triggers for `main`).

## Limitations / owner decisions still required (do NOT block security closure)

- **Numeric prices and per-resource limits are unresolved by owner decision.** The
  platform fails closed on them (`CONFIGURATION_REQUIRED`) and invents nothing.
  Until the owner configures ceilings (and backfills `Plan.planKey`), affected
  paid creation paths deny with `COMMERCIAL_CONFIGURATION_REQUIRED` — by design.
- **Self-serve upgrade/downgrade/cancellation timing** (immediate upgrade,
  end-of-period downgrade/cancellation, Billing-Admin-only immediate cancellation)
  is encoded as policy constants + the state machine + access modes, and is driven
  on the webhook path; retrofitting the pre-Phase-31 `subscriptions.ts` self-serve
  mutation service to route through the state machine is follow-up work.
- **Legacy `invoices.ts` / `payments.ts` generation still uses `parseFloat`.** The
  new no-float `money.ts` helpers are used by the refund path; retrofitting the
  legacy generation calls is follow-up work (decision: retain `Decimal(20,4)`).
- **Live Stripe verification** was deliberately not performed (no provider
  contact); all webhook/signature evidence is synthetic + offline.

# Hermes OS — v1.0 Release Checklist (Phase 93)

Use before promoting a commit to production. Every box must be checked or
explicitly waived by the owner with a recorded reason. Companion:
`go-no-go-matrix.md`.

## A. Code & CI gates (must all be green on the release commit)

- [ ] `npm ci` clean install
- [ ] `prisma generate` succeeds
- [ ] `npm run db:validate` (schema valid)
- [ ] `npx tsc --noEmit` (0 type errors)
- [ ] `npm run lint` (0 errors)
- [ ] `npm run test` (full vitest suite green, no skips added to pass)
- [ ] CI `phase91-postgres` rehearsal green (fresh + legacy migrate deploy)
- [ ] CI `phase92-postgres` rehearsal green (indexes + idempotency + retention)
- [ ] CI `phase93-dr` rehearsal green (backup→restore integrity + RTO)
- [ ] `next build` succeeds
- [ ] `git diff --check` clean (no whitespace/conflict markers)
- [ ] Secret scan clean (no credentials in diff)
- [ ] Migration-safety scan clean (additive; no edit to an applied migration)
- [ ] Scope audit: only intended files changed

## B. Security acceptance

- [ ] No open **Critical/High** finding (Phase 93: HIGH rate-limit bypass **fixed**)
- [ ] Auth rate limits keyed on `X-Real-IP` (not `X-Forwarded-For`)
- [ ] Tenant isolation fail-closed (409/503 on ambiguous/null owner)
- [ ] `/api/metrics` and `/api/admin/observability` reject anonymous (401)
- [ ] Secrets/JWT/passwords redacted in logs and error responses; no stack leakage
- [ ] CSP + security headers present; nonce propagated
- [ ] No applied migration edited; new migrations additive

## C. Data safety & DR

- [ ] Latest production backup exists and is **verified** (`.last-verification.json`)
- [ ] Restore procedure rehearsed in CI this release
- [ ] RPO ≤ 24 h (daily backup cron active) — or tightened interval documented
- [ ] RTO ≤ 1 h target understood; rollback image available (owner-verified)
- [ ] DR runbook current (`disaster-recovery-runbook.md`)

## D. Observability & operations

- [ ] SLO/SLI contract reviewed (`slo-sli-contract.md`)
- [ ] Incident-response runbook current (`incident-response-runbook.md`)
- [ ] Dependency health, alerts, security, errors visible on `/api/admin/observability`
- [ ] `METRICS_TOKEN` set **or** consciously deferred
- [ ] `ALERT_WEBHOOK_URL` + `ALERTS_ENABLED` set **or** consciously deferred (detection via admin surface)
- [ ] Audit-retention schedule set **or** consciously deferred

## E. Localization & UX

- [ ] FA/EN/DE parity green (i18n audit tests)
- [ ] RTL/LTR correct; canonical/hreflang derive from `ACTIVE_LOCALES`
- [ ] Contrast AA, single-h1 tests green
- [ ] Owner manual FA/EN/DE × desktop/mobile sweep on key pages (recommended)

## F. Deployment safety

- [ ] Deploy is `workflow_dispatch`-only; merging main never deploys
- [ ] Compose project pinned to `hermes` (Gate 0D-A static check green)
- [ ] Deploy rebuilds `--no-deps hermes-web` only; data services/volumes untouched
- [ ] Rollback steps confirmed (`DEPLOYMENT.md §10`)

## G. GA closure gate (Phase 100 — authoritative)

Sections A–F are necessary and **not sufficient**. They prove the engineering
work; they cannot prove that an external reviewer, a pilot customer, external
counsel or the owner has decided anything. That is what this section is for, and
it is the only section whose verdict is machine-generated.

- [ ] `npm run eval:phase100:closure` run on the release commit
- [ ] `PHASE100_IMPLEMENTATION=PASS`
- [ ] `RELEASE_BLOCKER_COUNT=0` — every gate named in the blocker matrix cleared
- [ ] `GA_RELEASE_READY=YES`
- [ ] `PHASE100_CLOSURE=PASS`

Any box above that cannot be ticked from a real run of the evaluator is a
**NO-GO**. Do not tick it from a document, a previous run, or a green CI badge:
the Phase 100 workflow succeeds while `PHASE100_CLOSURE=BLOCKED` by design.
Contract: [`phase100-ga-closure-contract.md`](phase100-ga-closure-contract.md).

## H. Sign-off

- [ ] Owner reviews the Phase 100 blocker matrix and records **GO** / **NO-GO**
- [ ] Release commit SHA recorded, and it is the `testedCommitSha` in every
      supplied evidence document
- [ ] Post-deploy verification plan agreed (health, key flows, SLIs for 15 min)

> `go-no-go-matrix.md` is a **historical Phase 93 record**, not a release
> authority. Its `V1_RELEASE_READY` line has been superseded — see the Phase 100
> correction in that file.

> Deferred items in D are **DEFERRED_OWNER_CONFIGURATION**: they require an owner
> destination/credential and are safe to defer for v1 launch, with detection
> falling back to the admin observability surface. They should be the first
> post-launch operational follow-ups.

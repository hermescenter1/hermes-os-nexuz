# Phase 93 — Production Acceptance & v1.0 Release Gate

Branch: `agent/phase93-production-acceptance-release-gate` · Base: `35026e4`
(Phase 92 merge #29) · Scope: prove the current release is fit for v1.0 and fix
definite gaps; **no** new large capability. No production system was contacted.

This is the master acceptance report. Companion documents:
`slo-sli-contract.md`, `disaster-recovery-runbook.md`,
`incident-response-runbook.md`, `v1-release-checklist.md`, `go-no-go-matrix.md`.

---

## STEP 1 — Inventory & classification (14 surfaces)

Legend: **VERIFIED** (evidence-backed, meets v1 bar) · **PARTIAL** (works, with a
documented, accepted gap) · **MISSING** · **OBSOLETE** · **DEFERRED**
(needs owner config/destination).

| # | Surface | Status | Evidence / notes |
|---|---|---|---|
| 1 | application / runtime | **VERIFIED** | `next build` passes; health/liveness/readiness routes; App Router server/client boundaries intact. |
| 2 | IAM / session security | **VERIFIED** | Phase 91 sid-bound revocable sessions, fail-closed issuance, atomic generation-gated rotation, replay-safe refresh. Tests: `phase91-*`, `phase92-refresh-correlation`. |
| 3 | tenant isolation | **VERIFIED** | Phase 90/90B owner-context fail-closed (409/503), `ownerWhere`/`ownerCanRead` sentinels, legacy-NULL quarantine. One **Medium** consistency finding on `/api/brain` (STEP 5) — behaviorally safe. Tests: `phase90-*`, `phase90b-*`. |
| 4 | database migrations | **VERIFIED** | 48 additive migrations; `prisma migrate deploy` prod path; fresh + legacy + idempotency rehearsals green in CI (Phase 91/92 jobs). |
| 5 | backup / restore | **VERIFIED** | `backup`/`verify`/`restore` scripts + real CI backup→restore rehearsal (row-count integrity + RTO). **Phase 93 hardening: BACKUP_PERMISSIONS=ENFORCED (umask 077 + 0700 dir + 0600 dumps); RESTORE_ENVIRONMENT_GUARD=FAIL_CLOSED (target-specific confirmation, no more passive countdown)** — `phase93-backup-restore-hardening.test.ts`. Remaining v1.x follow-up: at-rest encryption. |
| 6 | deployment / rollback | **VERIFIED** | `workflow_dispatch`-only deploy, SHA-ancestry gate, Compose project pinned to `hermes`, targeted `--no-deps hermes-web` rebuild. Rollback = commit-rebuild (owner-verified rollback image exists per production baseline). |
| 7 | observability / SLO | **VERIFIED** | Phase 92 metrics/alerts/errors/security/incident libs + `/api/metrics` + `/api/admin/observability` + FA/EN/DE dashboard. SLO/SLI contract was **MISSING** → **authored** in `slo-sli-contract.md`. |
| 8 | alert delivery | **DEFERRED_OWNER_CONFIGURATION** | `alerts.ts` complete (bounded retries, SSRF-safe, never throws). Delivery needs `ALERTS_ENABLED=true` + `ALERT_WEBHOOK_URL` (owner destination). Until then alerts compute in-process; detection via the admin surface. |
| 9 | audit retention | **VERIFIED** | `audit-retention.ts` + `scripts/audit-retention.mjs`: dry-run default, `--apply` gate, protected prefixes, batched deletes, 365-day default. Scheduling is owner config (STEP 8). |
| 10 | incident response | **VERIFIED** | `reconstructIncident(correlationId)` timeline across security/audit/errors; runbook **authored** (`incident-response-runbook.md`). |
| 11 | three-language UX | **VERIFIED** | `ACTIVE_LOCALES=[fa,en,de]`; 65 namespaces / 5491 leaves at three-way parity; identical-value audit gates for FA/DE; ICU placeholder parity. 615 i18n+a11y tests green (STEP 6). |
| 12 | accessibility | **PARTIAL** | Verified invariants: WCAG-AA contrast from live tokens, single-h1 per page, ARIA on interactive components. Gap: no automated axe/landmark full-page sweep (owner manual sweep recommended). |
| 13 | performance / capacity | **PARTIAL** | Deterministic bounds proven: metric cardinality cap, bounded/paginated list queries, tenant-scoped indexes, bounded snapshot sizes. No load test by policy (never load-test production). |
| 14 | release documentation | **VERIFIED** | This Phase 93 doc set (acceptance, SLO/SLI, DR, incident, checklist, go/no-go). |

No surface was found **OBSOLETE**. Nothing was rewritten without a definite gap.

---

## STEP 4 — Failure-mode results (fail-closed)

All exercised in the test environment; none against production.

| Failure mode | Result | Evidence |
|---|---|---|
| PostgreSQL unavailable / DB init failure | **PASS** — fail-closed 503, opaque | `phase91-refresh-atomic`, `phase92-health-coverage`, `phase90-observability` |
| **Redis unavailable** | **PASS (NEW)** — fails **safe** to in-process limiter, degrades observably, never throws, recovers | `phase93-redis-unavailable-failmode.test.ts` (5 tests) |
| Alert webhook unavailable / retry | **PASS** — bounded retries, never loops, never throws | `alerts.test.ts`, `phase92-adversarial-hardening` |
| Malformed correlation ID | **PASS** — reported invalid without querying | `incident.test.ts`, `phase92-observability-route`, `phase92-refresh-correlation` |
| Logger cyclic/deep/hostile values | **PASS** — cycle-safe, depth-bounded, never throws | `phase92-log-schema.test.ts` |
| Metrics cardinality overflow | **PASS** — capped, excess → `overflow`, counted | `metrics.test.ts`, `phase92-adversarial-hardening` |
| Unauthenticated metrics access | **PASS** — 401 anon / 403 non-admin | `phase92-metrics-route.test.ts` |
| Unauthenticated admin observability | **PASS** — 401 anon / 403 non-admin | `phase92-observability-route.test.ts` |
| Ambiguous / null tenant-owner | **PASS** — matches nothing; attribution fails closed | `phase90-tenant-ownership`, `phase90b-*` |
| Refresh-token replay | **PASS** — single-use claim; replay → critical event | `phase91-refresh-atomic`, `phase92-refresh-correlation` |
| Concurrent revoke / rotation | **PASS** — compare-and-set, generation gate | `phase91-revoke-others-atomic`, `phase91-session-revocation` |

Coverage gap closed by Phase 93: **Redis-unavailable** was the only enumerated
failure mode with no test.

---

## STEP 5 — Security acceptance (adversarial)

| Sev | Finding | Disposition |
|---|---|---|
| **HIGH** | Rate-limit bypass: 6 core auth routes keyed the throttle on the client-appendable left-most `X-Forwarded-For`; header rotation minted fresh buckets, defeating login/reset/enumeration throttles. | **FIXED.** All six now use `resolveClientIp` (X-Real-IP only, un-spoofable via nginx `$remote_addr`). Regression test: `phase93-rate-limit-key-hardening.test.ts` (18 assertions across all 6 routes). |
| Medium | `/api/brain` POST resolves owner directly and swallows the `ownerAttribution` throw as best-effort persistence, silently skipping the write on ambiguous/null owner instead of 409/503. | **DOCUMENTED, accepted.** Behaviorally **fail-closed** (no cross-tenant leak, no data written); differs from the 90B route contract only in status code. Aligning it is a scoped v1.x follow-up; changing the primary AI endpoint's write semantics now carries regression risk. |
| Low/Info | CSP `style-src 'unsafe-inline'` (documented necessity for CSS-in-JS/Framer Motion). | Accepted. |
| Info | `register` / `access-request` email-enumeration behavior. | Confirmed generic responses; `forgot-password` returns void (no enumeration). |

Confirmed positive posture (verified in code): sid-bound revocable sessions,
fail-closed issuance, atomic rotation, exhaustive-deny platform authz, per-tenant
& per-action rate-limit key isolation, layered secret redaction with stack
suppression, nonce-based CSP, token-or-admin-gated metrics/observability, and
email-enumeration protection on password reset.

**No Critical or High finding remains open.**

---

## STEP 6 — Trilingual & accessibility acceptance

- **FA/EN/DE parity:** three-way key parity (5491 leaves), FA/DE identical-value
  audits with explicit allowlists, ICU placeholder parity — **615 tests green**
  (`src/i18n/**`, `text-contrast-a11y`).
- **RTL/LTR:** FA is RTL default, EN/DE LTR; routing derives from `ACTIVE_LOCALES`.
- **Contrast AA:** computed from live `globals.css` tokens (≥4.5:1 for body/metadata).
- **Single h1 / landmarks:** single-h1 assertions on localized boundaries, global
  error, and unmatched-route pages; ARIA names on interactive DS components.
- **canonical / hreflang:** derived from `ACTIVE_LOCALES` via `src/lib/seo/config.ts`.
- **Owner manual sweep (recommended, not automated):** a live FA/EN/DE ×
  desktop/mobile pass for horizontal-overflow, focus order, reduced-motion, and
  hydration/console cleanliness on key public + authenticated pages. Translation
  changes are made only for a confirmed defect (none found in this phase).

## STEP 7 — Safe capacity baseline (local/CI only, never production)

| Bound | Result | Evidence |
|---|---|---|
| Metric cardinality | capped per metric; overflow folded + counted | `metrics.test.ts` |
| List queries | named, bounded, status-filtered, paginated | `phase90-tenant-ownership` |
| Tenant scans | indexed on `organizationId` | `phase9x-migration-safety` |
| Session inventory | composite index + captured query plan | `schema-catalog.pg.test.ts` |
| Observability snapshot | bounded (security ≤100, audit ≤50, incident ≤500) | `phase92-observability-route` |

No load/stress test is run — production capacity testing is out of policy. The DR
rehearsal additionally measures restore time (`phase93_dr_rto_ms`) in CI.

## STEP 8 — Operator configuration status (documented, NOT set on production)

| Item | Status |
|---|---|
| `METRICS_TOKEN` | **DEFERRED_OWNER_CONFIGURATION** — set to enable non-admin Prometheus scraping; absent ⇒ endpoint still 401/403 (fail-closed), admin session works. |
| `ALERT_WEBHOOK_URL` + `ALERTS_ENABLED` | **DEFERRED_OWNER_CONFIGURATION** — needs an owner destination to deliver alerts. |
| Audit-retention schedule | **DEFERRED_OWNER_CONFIGURATION** — `scripts/audit-retention.mjs --apply` on a cron; dry-run proven, never run with `--apply` here. |
| Prometheus / Alertmanager integration | **DEFERRED_OWNER_CONFIGURATION** — scrape `/api/metrics` with `METRICS_TOKEN`; no new vendor added. |

---

## Files changed (Phase 93)

Security fix (6 routes): `src/app/api/auth/route.ts`,
`.../forgot-password/route.ts`, `.../reset-password/route.ts`,
`.../verify-email/route.ts`, `.../accept-invite/route.ts`,
`.../access-request/route.ts`.
Tests (new): `src/app/api/auth/__tests__/phase93-rate-limit-key-hardening.test.ts`,
`src/lib/auth/__tests__/phase93-redis-unavailable-failmode.test.ts`.
DR rehearsal: `scripts/ci/phase93-dr-restore-rehearsal.mjs`, `.github/workflows/ci.yml` (new `phase93-dr` job).
Docs: this file + `slo-sli-contract.md`, `disaster-recovery-runbook.md`,
`incident-response-runbook.md`, `v1-release-checklist.md`, `go-no-go-matrix.md`;
`DEPLOYMENT.md` restore-filename correction.

## Final report

See `go-no-go-matrix.md` for the consolidated FINAL REPORT block and the
V1_RELEASE_READY determination.

> **PHASE 100 NOTE.** That determination is a **Phase 93 conclusion** and has
> been superseded. The canonical release verdict is `phase100-ga-closure.json`
> (`npm run eval:phase100:closure`), contract in
> [`phase100-ga-closure-contract.md`](phase100-ga-closure-contract.md). This
> document remains accurate about the Phase 93 acceptance work it describes.

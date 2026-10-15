# Executive Management Dashboard — Stage 1: Pre-change Audit

Status: **AUDIT_ONLY — 0 product bytes changed**
Date: 2026-10-10
Repository state at audit time: `HEAD = 153b8617` (identical to `main`), branch
`feature/hris-workforce-foundation`, **92 uncommitted paths** belonging to the
in-flight HRIS-0.5 / ERP tenant-isolation lane (not this work).

Every row below was read from source. Nothing here is inferred from the presence
of a page or a Prisma model: each claim names the file that proves it.

---

## 1. The screen that exists today

`/[locale]/dashboard` — `src/app/[locale]/dashboard/page.tsx` (44 lines).

| Fact | Evidence |
| --- | --- |
| The data source is a local simulator, resolved on the server and fixed | `page.tsx:25` calls `resolveDashboardSource()`; `src/lib/dashboard-demo/local-demo-adapter.ts:79` returns `LOCAL_DEMO_DESCRIPTOR` with `classification: "SIMULATED"` |
| The numbers are smooth functions of wall-clock time | `src/lib/industrial/simulator.ts:82` `simulateSnapshot(now)` |
| It is labelled SIMULATED in the UI, in every locale | `page.tsx:34` `PageStatusBadge variant="simulated"`, plus `src/components/dashboard/SimulatedDataDisclosure.tsx` |
| There is **no** database read, **no** tenant scope, **no** organization and **no** site on this page | `LOCAL_DEMO_SCOPE = { organizationId: null, siteId: null, scopeKind: "DEMO_NO_TENANT" }` at `local-demo-adapter.ts:62` |
| The polling interval is 5 s, client-side | `src/components/dashboard/DashboardClient.tsx:37` `POLL_MS = 5_000` |
| The whole `dashboard` i18n namespace (279 leaves) is plant-panel vocabulary — OEE, lines, PLC, SCADA. It contains no executive vocabulary at all | `messages/en.json` key `dashboard`; count pinned at `src/i18n/__tests__/german-operations-wave.test.ts:38` |

**Conclusion.** Phase 109-B0 deliberately made this screen an honest, isolated
demo. It is not a broken management dashboard; it is *not a management dashboard
at all*. An executive surface has to be built, not repaired.

`GET /api/dashboard` is unrelated to this page: it serves the global engineering
brain (projects / memories / graph) behind `requireAuthoring()` —
`src/app/api/dashboard/route.ts:27`.

---

## 2. Data-source map

Legend — **OPERATIONAL**: real rows, authenticated, tenant-scoped.
**PARTIAL**: real rows, but a boundary or a value is defective.
**NO SOURCE**: no data source exists in the repository.
**EXTERNAL**: requires a connection this repository cannot create.

| Domain | Verdict | What actually exists | Evidence |
| --- | --- | --- | --- |
| ERP projects / tasks / work orders / approvals / inventory / KPIs | **OPERATIONAL** | 39 `TENANT_MEMBER` handlers; org-scoped queries, cursor pagination, optimistic `version` locking, transactional idempotency, `ErpAuditEvent` on every write, compensation gated by `view_erp_compensation` | `src/lib/erp/operations.ts`, `src/lib/erp/db.ts`, `src/app/api/erp/**`; classification in `docs/security/phase99-route-security-inventory.json` |
| ERP executive aggregate | **OPERATIONAL** | `getErpOverview()` already returns active projects, overdue tasks, open work orders, low stock, pending approvals, budget vs. actual, status histograms and bounded recent activity — and returns `null` rather than zeros when the tenant has no rows | `src/lib/erp/operations.ts:688` |
| Industrial sites / gateways / assets / telemetry | **OPERATIONAL** | `IndustrialSite`, `IndustrialGateway.lastSeenAt`, `TelemetryRecord.timestamp` plus server-set `receivedAt`, indexed `(organizationId, receivedAt)` — so **data freshness is computable from real columns** | `prisma/schema.prisma`, models `IndustrialSite`, `IndustrialGateway`, `TelemetryRecord` |
| Asset alerts | **OPERATIONAL** | `AssetAlert` with severity, `dismissed`, `resolvedAt`, indexed `(organizationId, dismissed, createdAt)`; the org-wide reader `getOrgAlerts()` is site-scoped | `src/lib/industrial/alerts.ts:158` |
| Site-level access control | **OPERATIONAL** | `getAllowedSiteIds()` — OWNER/ADMIN resolve implicitly from `IndustrialSite`, everyone else from explicit `UserSite` rows; returns `[]` (never 500) when there is no access | `src/lib/site/context.ts:120` |
| CMMS maintenance | **OPERATIONAL (re-verify per query)** | 21 handlers and the full `Maintenance*` model family: plans, tasks, executions, downtime, failures, costs | `src/app/api/cmms/**`, `prisma/schema.prisma` |
| Customer-success surface `/dashboard/customers/*` | **PARTIAL — defective** | Six `GET` handlers require **no authentication** and serve a 17-row fixture | `src/app/api/customers/overview/route.ts:2` imports `@/lib/customers/mock-data`; inventory classifies all six `PUBLIC_READ` |
| CRM (leads / accounts / opportunities / pipeline) | **PARTIAL — defective** | Real Prisma reads, but (a) no `organizationId` filter anywhere in the dashboard query, (b) `newLeadsThisMonth` is **fabricated** as `totalLeads * 0.3`, (c) account health on the real-DB path is seeded pseudo-random, (d) any DB error silently falls through to fixtures | `src/lib/crm/db.ts:46-90` — fabrication at `:73`, mock health at `:66`; `src/lib/crm/health-engine.ts:56` |
| `/api/operations/*` (war room, alerts, sites, intelligence) | **PARTIAL — not the manager's plant** | Deterministic projections of a static engineering manifest, identical for every organization, deliberately anonymous and rate-limited. Honest, but **not** tenant telemetry | `src/app/api/operations/overview/route.ts:10`, `src/lib/live-operations/feed.ts:26` |
| Accounting / general ledger / AR / AP | **NO SOURCE** | None of the 275 models is a `JournalEntry`, `Ledger`, `Account`, `Voucher` or `Receivable`. `Invoice` / `Payment` are **SaaS subscription billing** — `Invoice.subscriptionId` is required — so they cannot represent a customer receivable or a project cost | `prisma/schema.prisma`, models `Invoice`, `Payment` |
| Accountant activity trail | **PARTIAL** | `AuditLog` (org-scoped, with `outcome` and `correlationId`) and `ErpAuditEvent` (before/after JSON) exist and are written on ERP writes — but there is no financial-document workflow to audit | `prisma/schema.prisma`, `src/lib/audit/audit-service.ts` |
| Multi-currency | **NO SOURCE** | A `Currency` enum exists on billing rows; there is **no FX-rate table and no rate date**, so cross-currency totals cannot be computed honestly | `prisma/schema.prisma` |
| Digital Twin | **PARTIAL (runtime blocked)** | Org-scoped graph only, no site scoping, UI is an empty shell (separate audit, 2026-10-10) | Phase 36 models in `prisma/schema.prisma` |
| Nightly report / scheduler | **NO SOURCE** | No cron, no BullMQ, no `node-cron`, no server-side `setInterval`, no scheduled workflow and no worker service in any compose file | stated and re-verified at `src/lib/industrial/metering-worker.ts:7-12` |
| Job coordination primitive | **OPERATIONAL (reusable)** | `WorkerLease` plus `acquireLease({ name, ttlMs })` — conditional claim, fencing token, expiry-based recovery. `name` is a parameter, so a second job needs no new primitive | `src/lib/industrial/metering-worker.ts:99` |
| Idempotency primitive | **OPERATIONAL (reusable)** | `IdempotencyKey` scoped `(organizationId, operation, keyHash)`; key row, mutation and audit in one transaction; same key with a different payload is refused | `src/lib/idempotency/transactional.ts` |
| In-app notification | **OPERATIONAL** | `NotificationService.create()` plus SSE push; never throws, degrades silently | `src/lib/notifications/service.ts:23` |
| External notification channels (email / SMS) | **EXTERNAL** | `src/lib/auth/email-service.ts` serves authentication mail only. There is no manager-digest channel and no per-manager channel preference | — |
| Caching | **NO SOURCE** | Zero `unstable_cache` and zero route-level `revalidate` under `src/app/api`. Redis is a bare `getRedis()` client used by the rate limiter | `src/lib/redis/client.ts:12` |
| Performance baseline | **NO SOURCE** | No API latency baseline, no query-count budget and no representative-volume dataset in the repository | — |

---

## 3. Security findings (pre-existing, found during this audit)

These were **not** introduced by this work and are **not** fixed by this audit.

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| EXEC-A-01 | HIGH (integrity + exposure) | `GET /api/customers/{overview,accounts,health,risks,usage,success-plans}` require **no authentication**. The middleware matcher is `"/((?!api|_next|_vercel|.*\\..*).*)"` — it **never runs on `/api`** — and none of the six handlers calls a guard. They answer any anonymous caller with ARR, health scores and named accounts taken from a fixture. | `src/middleware.ts:167`; `src/app/api/customers/overview/route.ts` has no guard; inventory classification `PUBLIC_READ` x6 |
| EXEC-A-02 | HIGH (fabrication in a production path) | `getCrmDashboard()` returns `newLeadsThisMonth: Math.round(totalLeads * 0.3)` on the **real database** path, and derives every account's health from `mockHealthForAccount()`, a seeded pseudo-random function of the account id. | `src/lib/crm/db.ts:66,73`; `src/lib/crm/health-engine.ts:56` |
| EXEC-A-03 | MEDIUM | `getCrmDashboard()` and `getCrmPipeline()` apply **no `organizationId` predicate**. Impact is bounded today because `/api/crm/*` is gated on the platform `admin` capability and `CrmOpportunity` has no `organizationId` column at all — CRM is a **platform-global** model, not a tenant one. That is a design fact the executive dashboard must respect rather than override. | `src/lib/crm/db.ts:46`; `prisma/schema.prisma` model `CrmOpportunity` |
| EXEC-A-04 | MEDIUM | Six CRM / customer data paths fall back to fixtures inside `catch {}`, so a database outage renders as plausible business numbers instead of an error state. | `src/lib/crm/db.ts:85` — `catch { /* fall through */ }` |
| EXEC-A-05 | LOW | A protected page fed by an unauthenticated API: `/[locale]/dashboard/customers/*` is in `PROTECTED_PATHS`, yet its client components fetch the open `/api/customers/*`. The login wall hides the page, not the data. | `src/components/customers/CustomerOverviewClient.tsx:37`; `src/lib/auth/rbac.ts:148` |

---

## 4. Constraints any implementation must respect

1. **i18n leaf counts are pinned.** `dashboard: 279` with a wave total of `648`
   is asserted in `src/i18n/__tests__/german-operations-wave.test.ts`, and
   `erp: 33` with a total of `532` in `german-enterprise-wave.test.ts`. Adding a
   key to a pinned namespace breaks those gates.
2. **German is a third active locale with a zero-carryover ceiling.**
   `src/i18n/__tests__/de-catalog.test.ts:369` sets `CEILING_AFTER_87L6F = 0`:
   every namespace must be listed in `TRANSLATED_NS` and carry genuinely German
   values. FA plus EN alone will not make the suite pass.
3. **`messages/*.json` are CRLF in the worktree and LF in the index.** Editing
   them with a tool that normalises line endings rewrites the whole file.
4. **The working tree is dirty with another lane** (92 paths, HRIS-0.5). This
   work must not be committed on top of it.
5. **There is no `typecheck` script.** Validation is `npm run lint`,
   `npm run test`, `npm run build`.
6. **`prisma format` churns roughly 1287 baseline lines** — run it only when the
   schema has actually changed.

---

## 5. What Stage 1 concludes

* The executive dashboard does not exist. The simulated plant demo at
  `/dashboard` is a different, deliberate artefact and should stay honest.
* The **operational** foundation for an executive surface is real and already
  tenant-safe: ERP (projects, tasks, work orders, approvals, inventory, KPIs),
  industrial sites / gateways / telemetry with computable freshness, asset
  alerts, CMMS, site-scope resolution, audit, idempotency, worker leasing and
  in-app notification.
* The **missing** foundation is accounting (no ledger entity at all),
  multi-currency (no rate table), a scheduler (none exists), caching (none) and
  a performance baseline (none).
* The **defective** foundation is the customer-success surface (unauthenticated
  fixtures) and the CRM dashboard (fabricated and mock-derived values on the real
  database path).

---

## 6. Decisions required before Stage 2

Each of these changes which data sources the main view is permitted to read, so
Stage 2 is blocked until they are answered.

**D-1 — Whose company is the manager looking at?**
`CrmOpportunity` has no `organizationId`; CRM and `CustomerAccount` are
platform-global (they model ZHARFA's own customers). `ErpProject` and
`IndustrialSite` are organization-scoped. So "customers" and "projects" cannot
be read through the same scope. Either the surface is a platform-level view of
ZHARFA's own business, or a tenant-level view of one organization, or the
existing hybrid ERP gate (platform `admin` capability, then active organization,
then `view_erp`).

**D-2 — How far does accounting go?**
There is no ledger. The options are: use only what exists today (billing
invoices and `ErpProjectCost`) and declare the rest a gap; or add a bounded,
explicitly-scoped financial model (customer receivable, payable commitment,
approval state, audit) sized for this dashboard and nothing more.

**D-3 — What happens to the simulated `/dashboard`?**
Either keep it and add a new executive route, or replace the landing dashboard
and move the demo elsewhere. Phase 109-B0 built the simulation disclosure
deliberately and it is covered by tests, so replacing it is a decision, not a
refactor.

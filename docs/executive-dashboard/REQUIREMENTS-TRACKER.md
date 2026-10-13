# Executive Management Center — requirements tracker

Opened: 2026-10-12. **Status: OPEN.**
Baseline: `main = c8cb343b` (PR #132 merged), production deploy of that commit
in progress at the time of writing.

This is the single list the brief is closed against. A row is `DONE` only when
its acceptance criterion has been met **and** the evidence column names where
that was shown. "Built" is not "done": a surface with no evidence stays
`PARTIAL`.

Status vocabulary:

| Status | Meaning |
| --- | --- |
| `DONE` | Acceptance criterion met and evidenced. |
| `PARTIAL` | Some of the requirement ships; the rest is named in the row. |
| `NOT_STARTED` | No implementation exists yet. |
| `BLOCKED` | Cannot proceed without something outside this repository. |

---

## 1. Management view, decision and action centre

| | |
| --- | --- |
| **Status** | `PARTIAL` |
| **Evidence** | `STAGE-2-SLICE-A.md`; `visual-evidence/{fa,en}-desktop-live.jpg`; live run against an isolated database showing OWNER 2 alerts / 3 plants vs a site-scoped VIEWER 1 / 1 |
| **Dependency** | — |
| **Acceptance** | Three layers (today's position, items awaiting a decision, drill-down to records); every figure states definition, source, period and last update; absence rendered as `EMPTY` / `NO_SOURCE` / `UNAVAILABLE` / `FORBIDDEN`, never as health; every drill-down re-checks permission. |
| **Open** | The action centre lists today's breaches but has no ranking or reason — that is row 8. |

## 2. Accounting and oversight of accountant activity

| | |
| --- | --- |
| **Status** | `PARTIAL` — oversight half shipped by slice C; ledger half not started |
| **Evidence** | Gap analysed in `STAGE-5-GAPS-AND-NEXT-SLICE.md`: no `JournalEntry` / `Ledger` / `Voucher` / `Receivable` / `Payable` among the models, `Invoice.subscriptionId` is required, and **no exchange-rate model exists anywhere** |
| **Dependency** | Owner's decision on scope of a ledger domain; none for the oversight slice |
| **Acceptance** | Recorded cost in the period **grouped per currency** (never summed across currencies), who recorded it, approvals awaiting a decision by role and age, approvals decided with actor and time, budget vs recorded cost per project, and a permanent statement of what is *not* covered. Real rows only. |
| **Plan** | Slice C from the existing `ErpProjectCost` / `ErpApprovalRequest` / `ErpAuditEvent` models — zero schema change. The ledger itself is a separate domain with its own schema, to be designed after the oversight slice proves the surface. |
| **Slice C** | `/dashboard/executive/oversight`: cost per currency (never summed), by category, who recorded it, unattributed entries, projects over budget. Proven on an isolated database with two decoys absent; the split axis proven live (ADMIN sees approvals, not money). `STAGE-7-SLICE-C-FINANCIAL-OVERSIGHT.md`. |

## 3. Customers, sales and follow-ups

| | |
| --- | --- |
| **Status** | `PARTIAL` — data, API and audit built and unit-tested (slice G1, not yet merged); UI (G2) and the management-view section (G3) not started |
| **Slice G1** | `STAGE-11-SLICE-G1-CUSTOMERS-DATA.md`: tenant-owned `Party` (the counterparty the accounting plan names for A2, so no parallel customer model) + append-only `PartyInteraction` + `ErpProject.partyId`, all linked by **composite** `(organizationId, partyId)` foreign keys so a cross-tenant link cannot be stored; `/api/tenant/customers/**` (8 handlers, `TENANT_MEMBER`); `view_customers`/`manage_customers` for OWNER/ADMIN/MANAGER; versioned edits, archive not delete, audited writes without PII |
| **Evidence** | `CrmAccount.organizationId` and `CustomerAccount.organizationId` are both `@unique`, and `CrmOpportunity` has no tenant column at all — so no tenant can have many customers today |
| **Dependency** | A new `TenantCustomer` domain (schema + migration + RBAC + UI) |
| **Acceptance** | A tenant-scoped customer record with contacts and follow-ups, created through a real authenticated write path, isolated per organization, with the dashboard reading those rows rather than a fixture. |
| **Note** | The existing `/api/customers/*` handlers are **unauthenticated** and serve a 17-row fixture; that is a separate defect, recorded in `STAGE-1-AUDIT.md`, and must not be the source for this row. |

## 4. Plants, assets, alerts and data quality

| | |
| --- | --- |
| **Status** | `PARTIAL` |
| **Evidence** | Plants-and-connectivity section with per-plant freshness (`Delayed` / `Never reported`), gateway counts, open critical alerts, and a data-quality block naming each gap |
| **Dependency** | — |
| **Acceptance** | Above, plus asset-level coverage (registry counts, criticality, health) reaching the management view. |
| **Open** | Assets are not surfaced at all yet. |

## 5. Team, projects, tasks and manager approvals

| | |
| --- | --- |
| **Status** | `PARTIAL` |
| **Evidence** | Operations section: active projects, overdue tasks, open work orders, approvals awaiting a decision, approvals decided, tasks completed |
| **Dependency** | — |
| **Acceptance** | Above, plus the people dimension (who owns what, who is blocking) and an approvals queue a manager can act on rather than a count. |
| **Open** | No team dimension. Approvals now have a queue by **blocking role and age** (slice C), but it is read-only — the decision itself still happens on the ERP approvals screen. |

## 6. Nightly report and documented archive

| | |
| --- | --- |
| **Status** | `DONE` |
| **Evidence** | `STAGE-4-SLICE-B-NIGHTLY-REPORT.md`, `STAGE-6-REVALIDATION.md` §2–§5; live: `created:3 / notified:3`, two concurrent passes refused by the lease, then `alreadyReported:3 / notified:0`; 3 notifications after 4 passes; archive shows one tenant's row out of three |
| **Dependency** | Row 10 for the *scheduled* execution — the report mechanism is done, its production schedule is not |
| **Acceptance** | One frozen report per organization per finished business day, idempotent by `(organization, date, version)`, corrections as new versions, DST-correct boundaries, coverage and calculation version stored, archive re-checking permission. |

## 7. Per-organization report time and time zone

| | |
| --- | --- |
| **Status** | `DONE` on an isolated database — slice E, not yet merged or deployed |
| **Evidence** | `STAGE-9-SLICE-E-ORGANIZATION-SETTINGS.md`: `ExecutiveSettings` table (one row per organization, database CHECKs proven by raw inserts), `/dashboard/executive/settings` with an owner/admin-only versioned and audited write; live: ZHARFA set to Europe/Berlin 06:00, the management view and priorities cut in Berlin, and one nightly pass produced **2026-10-11 (Berlin, 04:00Z window)** for ZHARFA and **2026-10-12 (Tehran)** for the others while the earlier reports kept Asia/Tehran; `visual-evidence/{en-desktop,fa-mobile}-settings.jpg` |
| **Dependency** | — (the environment variables remain the fallback for organizations with no row) |
| **Acceptance** | Each organization sets its own zone and cutoff; the worker honours it per tenant; existing reports keep the zone they were generated with, because the report already stores it. |

## 8. Tomorrow's priorities, with documented and configurable rules

| | |
| --- | --- |
| **Status** | `PARTIAL` — rules, reasons and validated parameters shipped by slice D; per-organization thresholds by slice E (live: a 2-day threshold brought a 2-day approval into the list); not yet part of the nightly report |
| **Evidence** | `/dashboard/executive/priorities`: nine ordered written rules, three tiers, a reason sentence per item, the rule set printed with the thresholds in force. Proven on an isolated database with five decoys absent; VIEWER sees an empty list with a stated reason per source. `STAGE-8-SLICE-D-TOMORROWS-PRIORITIES.md`. |
| **Dependency** | Row 2 and row 5 feed it, but it can ship on today's sources |
| **Acceptance** | A written, inspectable rule set over criticality, due date, lateness and pending approvals; configurable per organization; **every priority shows the reason it was ranked there**; no opaque score. |

## 9. In-app notification and a connected external channel

| | |
| --- | --- |
| **Status** | `PARTIAL` |
| **Evidence** | In-app notification via the existing `NotificationService`, claimed once per report, carrying no figures |
| **Dependency** | **Owner must choose the channel and supply its credential** (email transport, or another channel) |
| **Acceptance** | The chosen channel is configured, a real delivery is evidenced, and failure to deliver is visible rather than silent. |
| **Blocked on** | Channel choice + credential. Independent work continues meanwhile. |
| **Closed in slice F** | A claim that reached nobody is given back (fenced on its own timestamp) and listed as `undelivered` (`NO_RECIPIENT` / `DELIVERY_FAILED`), logged as a warning, and retried on the next pass; every active owner **and administrator** is told. |

## 10. Runner on the production schedule, failure monitoring and recovery

| | |
| --- | --- |
| **Status** | `PARTIAL` — runner correct for any number of tenants and packaged like every other worker (slice F, not yet merged); **not scheduled in production** |
| **Evidence** | `STAGE-10-SLICE-F-RUNNER.md`: cursor-chained sweep (120 organizations in batches of 50 each visited exactly once, org 51 included), lease renewed and released, Dockerfile stage + compose service `hermes-executive-report-worker` + one-file `.dockerignore` re-include, runner executed against a stub (three-pass chain, exit 2 without a token, exit 1 on 401, clean exit) |
| **Dependency** | A compose service or host timer, plus `EXECUTIVE_REPORT_WORKER_TOKEN` in the production environment |
| **Closed in slice F** | The first-50-organizations limit (cursor), the lease never released or renewed, and the Windows `UV_HANDLE_CLOSING` exit (`process.exitCode`). |
| **Needs the owner** | `EXECUTIVE_REPORT_WORKER_TOKEN` in `.env.production` (or confirm an existing `METERING_WORKER_TOKEN`/`METRICS_TOKEN` is acceptable), then one `docker compose … up -d hermes-executive-report-worker` on the host after the deploy — the deploy workflow starts `hermes-web` only, as for the other workers. Alerting on the runner's `WARN`/`ERROR` lines is an operator choice. |
| **Acceptance** | The runner is scheduled in production, its credential is supplied the way the other worker credentials are, a failed pass is visible, and **a real production run has produced a report** — until then the nightly report is not "automatic and live in production". |

## 11. Performance baseline, optimisation and safe caching

| | |
| --- | --- |
| **Status** | `NOT_STARTED` |
| **Evidence** | — (no latency figure has been claimed anywhere) |
| **Dependency** | — |
| **Acceptance** | A measured before/after baseline for the management view and the archive; any cache is tenant-safe and cannot serve one organization's figures to another. |

## 12. Full FA/EN UI, mobile and accessibility

| | |
| --- | --- |
| **Status** | `PARTIAL` |
| **Evidence** | fa/en/de catalogues at three-way parity (gate total 8399); RTL and LTR screenshots desktop and mobile; the phone-width overflow defect found by measurement, fixed, and locked by a test |
| **Dependency** | — |
| **Acceptance** | Above, plus an accessibility pass: keyboard reachability of the action centre and archive, focus order, contrast, and the table semantics already present verified against a checklist. |
| **Open** | No accessibility audit has been run. Page titles are static English in every locale (dashboard-wide `noIndexMetadata` pattern). Slice E fixed two defects found by looking: Latin digits in the Persian cutoff, and dead colour classes (`bg-base`, `text-fg`) that left form fields white, plus every opacity modifier on a theme colour (Tailwind 3 emits nothing for `bg-signal/10` on a `var()` colour; dead borders fell back to bright `#E5E7EB` row lines) — now guarded by a test that reads the Tailwind config. |

## 13. Database correctness, migrations, security, tenant/site isolation, audit

| | |
| --- | --- |
| **Status** | `PARTIAL` |
| **Evidence** | One additive migration (82 → 83) classified `FORWARD_ONLY_REQUIRES_BACKUP` and rehearsed in CI on real PostgreSQL; tenant and site isolation proven live; `GET /api/executive/summary` is `TENANT_MEMBER`, `POST /api/executive/reports/run` is `PLATFORM_ADMIN` on its own credential; corrections write an `AuditLog` row |
| **Slice E** | Second additive migration (`ExecutiveSettings`, declared in both Phase 102 lists); `PUT /api/executive/settings` classified `TENANT_MEMBER` through a registered guard token, origin and content type refused before the session is read, organization never taken from the body (proven live: a smuggled `organizationId` changed nothing in the other tenant), every change audited inside its own transaction with before/after. |
| **Dependency** | Rows 2 and 3 add schema and must each extend this evidence |
| **Acceptance** | Every new model carries organization scope at the query level, every new route is classified by the Phase 99 inventory, and every write that changes a figure is auditable. |

## 14. Final validation and post-deployment review

| | |
| --- | --- |
| **Status** | `IN_PROGRESS` |
| **Evidence** | CI 24/24 on `7bab3069`; merge `c8cb343b`; production deploy dispatched for `c8cb343b` |
| **Dependency** | Every row above |
| **Acceptance** | The deployed version is confirmed, migrations report clean, health and readiness pass, the FA/EN management view and the report archive are checked on production, tenant/site and financial permission limits are confirmed there, and anything without data reads as "no data source". |

---

## Working order

Rows are taken in this order, smallest reviewable slice first:

1. **Slice C** — row 2's oversight half (no schema change). *Implemented and proven on an isolated database.*
2. **Slice D** — row 8, priorities with visible reasons. *Implemented and proven on an isolated database.*
3. **Slice E** — row 7, per-organization zone and cutoff (one migration). *Implemented and proven on an isolated database.*
4. **Slice F** — row 10, the production runner, with row 9's channel if the
   owner has chosen one by then. *Code and packaging done and tested; production start needs the owner.*
5. **Slice G** — row 3, the tenant customer domain (new schema). *G1 (data/API) built and unit-tested; G2 (UI + live proof) and G3 (management view) next.*
6. **Slice H** — rows 4 and 5, assets and the people dimension.
7. **Slice I** — row 11, the performance baseline.
8. **Slice J** — row 12's accessibility pass.

Rows 13 and 14 are not slices: every slice must extend them, and row 14 closes
the session.

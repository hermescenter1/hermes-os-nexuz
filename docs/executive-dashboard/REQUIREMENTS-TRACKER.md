# Executive Management Center — requirements tracker

Opened: 2026-10-12. **Status: OPEN.**
Baseline: `main = c8cb343b` (PR #132 merged), production deploy of that commit
in progress at the time of writing.

This is the single list the brief is closed against. A row is `DONE` only when
its acceptance criterion has been met **and** the evidence column names where
that was shown. "Built" is not "done": a surface with no evidence stays
`PARTIAL`.

Status vocabulary — FOUR SEPARATE STATES, because "it works on my machine",
"a test proves it", "it is on the server" and "somebody checked it there" are
four different claims and must never be collapsed:

| State | Meaning |
| --- | --- |
| `IMPLEMENTED` | The code exists and is reviewable. Nothing is claimed about whether it works. |
| `VALIDATED` | Proven on an isolated environment: named tests pass and the behaviour was observed against a real database. Still says nothing about production. |
| `DEPLOYED` | The commit carrying it is the one production runs — asserted by ancestry against the deploy run's SHA, not by a redirect, a page load or a merge. |
| `VERIFIED_IN_PRODUCTION` | Someone exercised it in production, authenticated where the surface is authenticated, and the evidence is named here. |

A row carries the HIGHEST state it has reached, and the states below it are
implied. `BLOCKED` and `NOT_STARTED` keep their plain meanings.

**Deployed ≠ verified.** An anonymous request that redirects to the sign-in page
proves only that the path is protected: on 2026-10-13 a route that does not
exist at all (`/en/dashboard/this-route-does-not-exist`) answered with exactly
the same 307, which is why the customer pages are not recorded as verified in
production on the strength of one.

---

## 1. Management view, decision and action centre

| | |
| --- | --- |
| **Status** | `DEPLOYED` (the live view), `VALIDATED` for everything added since |
| **Evidence** | `STAGE-2-SLICE-A.md`; `visual-evidence/{fa,en}-desktop-live.jpg`; live run against an isolated database showing OWNER 2 alerts / 3 plants vs a site-scoped VIEWER 1 / 1 |
| **Dependency** | — |
| **Acceptance** | Three layers (today's position, items awaiting a decision, drill-down to records); every figure states definition, source, period and last update; absence rendered as `EMPTY` / `NO_SOURCE` / `UNAVAILABLE` / `FORBIDDEN`, never as health; every drill-down re-checks permission. |
| **Open** | The action centre lists today's breaches but has no ranking or reason — that is row 8. |

## 2. Accounting and oversight of accountant activity

| | |
| --- | --- |
| **Status** | `DEPLOYED` for the oversight half (in `cd6b1f5d`); the ledger half is `NOT_STARTED` |
| **Evidence** | Gap analysed in `STAGE-5-GAPS-AND-NEXT-SLICE.md`: no `JournalEntry` / `Ledger` / `Voucher` / `Receivable` / `Payable` among the models, `Invoice.subscriptionId` is required, and **no exchange-rate model exists anywhere** |
| **Dependency** | Owner's decision on scope of a ledger domain; none for the oversight slice |
| **Acceptance** | Recorded cost in the period **grouped per currency** (never summed across currencies), who recorded it, approvals awaiting a decision by role and age, approvals decided with actor and time, budget vs recorded cost per project, and a permanent statement of what is *not* covered. Real rows only. |
| **Plan** | Slice C from the existing `ErpProjectCost` / `ErpApprovalRequest` / `ErpAuditEvent` models — zero schema change. The ledger itself is a separate domain with its own schema, to be designed after the oversight slice proves the surface. |
| **Slice C** | `/dashboard/executive/oversight`: cost per currency (never summed), by category, who recorded it, unattributed entries, projects over budget. Proven on an isolated database with two decoys absent; the split axis proven live (ADMIN sees approvals, not money). `STAGE-7-SLICE-C-FINANCIAL-OVERSIGHT.md`. |

## 3. Customers, sales and follow-ups

| | |
| --- | --- |
| **Status** | `DEPLOYED` for the data and API (G1, in `cd6b1f5d`); `VALIDATED` for the pages (G2) and the management-view section (G3), both merged into `b461ac97` and awaiting the deploy of that commit. **Not** `VERIFIED_IN_PRODUCTION`: nobody has signed in there and used them yet. |
| **Slice G1** | `STAGE-11-SLICE-G1-CUSTOMERS-DATA.md`: tenant-owned `Party` (the counterparty the accounting plan names for A2, so no parallel customer model) + append-only `PartyInteraction` + `ErpProject.partyId`, all linked by **composite** `(organizationId, partyId)` foreign keys so a cross-tenant link cannot be stored; `/api/tenant/customers/**` (8 handlers, `TENANT_MEMBER`); `view_customers`/`manage_customers` for OWNER/ADMIN/MANAGER; versioned edits, archive not delete, audited writes without PII |
| **Evidence** | `CrmAccount.organizationId` and `CustomerAccount.organizationId` are both `@unique`, and `CrmOpportunity` has no tenant column at all — so no tenant can have many customers today |
| **Dependency** | A new `TenantCustomer` domain (schema + migration + RBAC + UI) |
| **Slice G2** | `STAGE-12-SLICE-G2-CUSTOMERS-UI.md`: `/dashboard/clients` list (server-rendered search, filters, cursor pages), `new` and `[id]` (details, follow-up, append-only contact log, linked projects with cost per currency) in Persian, English and German, with a sidebar entry. Proven live on an isolated database: created through the UI, read back, contact recorded, project linked; another organization's customer answers 404 and a VIEWER is refused with a sentence rather than an empty list. |
| **Acceptance** | A tenant-scoped customer record with contacts and follow-ups, created through a real authenticated write path, isolated per organization, with the dashboard reading those rows rather than a fixture. |
| **Note** | The existing `/api/customers/*` handlers are **unauthenticated** and serve a 17-row fixture; that is a separate defect, recorded in `STAGE-1-AUDIT.md`, and must not be the source for this row. The new surface reads `Party` rows only. |
| **Slice G3** | `STAGE-13-SLICE-G3-CUSTOMERS-IN-VIEW.md`: five customer metrics in the management view, each with its definition, named source, period, data-as-of time and a link to the records; point counts taken AS OF the end of the period, so the nightly report is the finished day and not live figures (`CALC_VERSION` → `exec-report-2`). Every figure matched an independent SQL count; a real sweep produced a report whose customers section is EMPTY for 2026-10-12 while the live screen shows 1, because that customer was created later. |
| **Open** | Overdue follow-ups are not yet a source for tomorrow's priorities (row 8). |

## 4. Plants, assets, alerts and data quality

| | |
| --- | --- |
| **Status** | `DEPLOYED` for what exists; assets are `NOT_STARTED` |
| **Evidence** | Plants-and-connectivity section with per-plant freshness (`Delayed` / `Never reported`), gateway counts, open critical alerts, and a data-quality block naming each gap |
| **Dependency** | — |
| **Acceptance** | Above, plus asset-level coverage (registry counts, criticality, health) reaching the management view. |
| **Open** | Assets are not surfaced at all yet. |

## 5. Team, projects, tasks and manager approvals

| | |
| --- | --- |
| **Status** | `DEPLOYED` for what exists; the people dimension and an actionable queue are `NOT_STARTED` |
| **Evidence** | Operations section: active projects, overdue tasks, open work orders, approvals awaiting a decision, approvals decided, tasks completed |
| **Dependency** | — |
| **Acceptance** | Above, plus the people dimension (who owns what, who is blocking) and an approvals queue a manager can act on rather than a count. |
| **Open** | No team dimension. Approvals now have a queue by **blocking role and age** (slice C), but it is read-only — the decision itself still happens on the ERP approvals screen. |

## 6. Nightly report and documented archive

| | |
| --- | --- |
| **Status** | `DEPLOYED` (the mechanism); its production SCHEDULE is row 10 |
| **Evidence** | `STAGE-4-SLICE-B-NIGHTLY-REPORT.md`, `STAGE-6-REVALIDATION.md` §2–§5; live: `created:3 / notified:3`, two concurrent passes refused by the lease, then `alreadyReported:3 / notified:0`; 3 notifications after 4 passes; archive shows one tenant's row out of three |
| **Dependency** | Row 10 for the *scheduled* execution — the report mechanism is done, its production schedule is not |
| **Slice G3** | The snapshot now carries the organization's customers for the day it reports on; `CALC_VERSION` moved to `exec-report-2` so a report without customer figures is never compared with one that has them. |
| **Acceptance** | One frozen report per organization per finished business day, idempotent by `(organization, date, version)`, corrections as new versions, DST-correct boundaries, coverage and calculation version stored, archive re-checking permission. |

## 7. Per-organization report time and time zone

| | |
| --- | --- |
| **Status** | `DEPLOYED` — merged (#136) and carried by `cd6b1f5d` |
| **Evidence** | `STAGE-9-SLICE-E-ORGANIZATION-SETTINGS.md`: `ExecutiveSettings` table (one row per organization, database CHECKs proven by raw inserts), `/dashboard/executive/settings` with an owner/admin-only versioned and audited write; live: ZHARFA set to Europe/Berlin 06:00, the management view and priorities cut in Berlin, and one nightly pass produced **2026-10-11 (Berlin, 04:00Z window)** for ZHARFA and **2026-10-12 (Tehran)** for the others while the earlier reports kept Asia/Tehran; `visual-evidence/{en-desktop,fa-mobile}-settings.jpg` |
| **Dependency** | — (the environment variables remain the fallback for organizations with no row) |
| **Acceptance** | Each organization sets its own zone and cutoff; the worker honours it per tenant; existing reports keep the zone they were generated with, because the report already stores it. |

## 8. Tomorrow's priorities, with documented and configurable rules

| | |
| --- | --- |
| **Status** | `DEPLOYED` for the rules, reasons and per-organization thresholds; `DEPLOYED` for overdue customer follow-ups as a fifth priority source (slice J, merged as `56126c31`); `VALIDATED` for the priority list frozen into the nightly report (`exec-report-3`, not merged). |
| **Evidence** | `/dashboard/executive/priorities`: nine ordered written rules, three tiers, a reason sentence per item, the rule set printed with the thresholds in force. Proven on an isolated database with five decoys absent; VIEWER sees an empty list with a stated reason per source. `STAGE-8-SLICE-D-TOMORROWS-PRIORITIES.md`. |
| **Dependency** | Row 2 and row 5 feed it, but it can ship on today's sources |
| **Frozen into the nightly report** | The pass computes the list for the day AFTER the reported day — anchored on the report's day, never on the pass's own clock, or a report about Monday would carry Wednesday's list. All five sources are read in ONE `RepeatableRead` transaction, so the snapshot is not a composite of states that never co-existed. Stored in its own nullable column with the observation time (separate from the record's creation time), the target day, the rules version, each item's reason and a `late` flag. `null` means NOT RECORDED, never "nothing was due". |
| **LIMITATION — stays open** | The frozen list is what was **observed when the report was generated**, NOT the ranking as it stood at the data cutoff. `ErpTask.status`, `.priority`, `.dueDate` and `Party.nextActionAt` are mutable columns with no history, so that earlier state cannot be reconstructed: a date filter returns today's rows filtered by date, which is a different thing wearing the same shape. Freezing at generation is the honest record available today. It does **not** satisfy "the exact state at the cutoff", and that requirement is NOT closed by this slice — closing it needs a history mechanism on those columns, which was not built. The data says so itself: `basis: "OBSERVED_AT_GENERATION"`. |
| **Acceptance** | A written, inspectable rule set over criticality, due date, lateness and pending approvals; configurable per organization; **every priority shows the reason it was ranked there**; no opaque score. |

## 9. In-app notification and a connected external channel

| | |
| --- | --- |
| **Status** | `DEPLOYED` for the in-app channel; the external channel is `BLOCKED` on the owner's choice |
| **Evidence** | In-app notification via the existing `NotificationService`, claimed once per report, carrying no figures |
| **Dependency** | **Owner must choose the channel and supply its credential** (email transport, or another channel) |
| **Acceptance** | The chosen channel is configured, a real delivery is evidenced, and failure to deliver is visible rather than silent. |
| **Blocked on** | Channel choice + credential. Independent work continues meanwhile. |
| **Closed in slice F** | A claim that reached nobody is given back (fenced on its own timestamp) and listed as `undelivered` (`NO_RECIPIENT` / `DELIVERY_FAILED`), logged as a warning, and retried on the next pass; every active owner **and administrator** is told. |

## 10. Runner on the production schedule, failure monitoring and recovery

| | |
| --- | --- |
| **Status** | `VERIFIED_IN_PRODUCTION` for the mechanism — the service is RUNNING on production and a real pass created a report and delivered a notification. **Still OPEN**: that pass was the STARTUP cycle, not a scheduled one. |
| **Evidence** | `STAGE-10-SLICE-F-RUNNER.md`: cursor-chained sweep (120 organizations in batches of 50 each visited exactly once, org 51 included), lease renewed and released, Dockerfile stage + compose service `hermes-executive-report-worker` + one-file `.dockerignore` re-include, runner executed against a stub (three-pass chain, exit 2 without a token, exit 1 on 401, clean exit) |
| **Dependency** | A compose service or host timer, plus `EXECUTIVE_REPORT_WORKER_TOKEN` in the production environment |
| **Closed in slice F** | The first-50-organizations limit (cursor), the lease never released or renewed, and the Windows `UV_HANDLE_CLOSING` exit (`process.exitCode`). |
| **Credential (owner decision, 2026-10-13)** | A dedicated `EXECUTIVE_REPORT_WORKER_TOKEN`; the metering token is **not** shared with this job. It is generated on the production host by `scripts/executive/provision-report-worker-token.sh` and never printed. |
| **Activation** | `RUNNER-ACTIVATION.md`: create the credential on the host → redeploy the same commit so `hermes-web` reads it → start `hermes-executive-report-worker` once → record image, restart policy, first pass. The first pass after a manual start is recorded separately from the first **scheduled** pass. Image built and smoke-tested in CI (`Executive report worker image` job: 22 checks, clean stop in 60 ms). |
| **Production evidence, 2026-10-14** | The service was started on the host by the owner. Worker log at `2026-10-14T09:09:31.249Z`: `created=1, notified=1, failed=0, undelivered=0, leaseLost=false`. So the credential is loaded, the endpoint authorised the call, the lease was held for the whole pass and the notification reached a recipient — the mechanism works end to end in production, which it had never been shown to do. |
| **Still open on this row** | Three things, none of them proven by a startup pass: (1) the NEXT periodic cycle fires on its own, (2) the notification reached only AUTHORIZED recipients, (3) a second pass over the same business date creates no duplicate report and sends no duplicate notification. The first is a question about the schedule, the second and third about idempotence under a real clock. Do NOT re-activate the service to test this: a restart would produce another startup pass and prove nothing about the schedule. |
| **Acceptance** | The runner is scheduled in production, its credential is supplied the way the other worker credentials are, a failed pass is visible, and a real **scheduled** production run has produced a report whose recipients are authorized and which is not a duplicate. The manual first pass is now evidence for the mechanism; it is not evidence for the schedule. |

## 11. Performance baseline, optimisation and safe caching

| | |
| --- | --- |
| **Status** | `DEPLOYED` — merged as `84437c3c` and carried by the production deploy of 2026-10-14 (run 38514426176, migrations 86/86, health gate passed). `VALIDATED` on an isolated environment. **Not** `VERIFIED_IN_PRODUCTION`: no latency has been measured there, and nothing yet attests that the running image was built from that commit (finding DA-3). |
| **Evidence** | `npm run perf:executive` against an isolated PostgreSQL (`STAGE-14-SLICE-I-PERFORMANCE.md`): p50 11.87 ms at 8,007 customers, 24.31 ms at 32,031, 35.71 ms at 64,063; payload flat at ~8.9 kB; doubling the rows costs ×1.37, not ×2. The statement count is proven CONSTANT deterministically in `summary.test.ts` (1 customer and 500 issue the identical number; the customer section is 8 counts, all organization-scoped). `EXPLAIN` found the "new customers in the period" count reading 64,063 rows to return 155; the new index turns it into an index-only scan, 5.704 ms → 0.083 ms, and the whole build 35.71 → 33.24 ms p50 at the same volume. The cache is covered by 19 cases in `cache.test.ts` plus two route cases. **No production latency has been measured or claimed.** |
| **Dependency** | — |
| **Acceptance** | A measured before/after baseline for the management view and the archive; any cache is tenant-safe and cannot serve one organization's figures to another. |
| **Cache rules, each a test** | Read only AFTER the gate, with its output; the key separates organization, role, each authority axis, the site set, zone, cutoff, range and window start, and not the user; a committed write bumps a per-organization generation so nothing from before it is addressable; TTL 60 s is a ceiling and the entry is marked stale past half of it; every answer carries when it was computed and how old it is, and the screen prints it; an `UNAVAILABLE` answer is never stored, so recovery is immediate; the FROZEN nightly report never reads the cache, asserted at source level. |
| **Open** | A production measurement (none exists). The cache under concurrency. The Redis path exercised against a real Redis — only the per-process fallback has been. The two remaining full-table counts if a tenant grows by another order of magnitude; the next lever there is a maintained counter, not an index. |

## 12. Full FA/EN UI, mobile and accessibility

| | |
| --- | --- |
| **Status** | `DEPLOYED` for the surfaces in `cd6b1f5d`, `VALIDATED` for the customer pages; the accessibility pass is `NOT_STARTED` |
| **Evidence** | fa/en/de catalogues at three-way parity (gate total 8399); RTL and LTR screenshots desktop and mobile; the phone-width overflow defect found by measurement, fixed, and locked by a test |
| **Dependency** | — |
| **Acceptance** | Above, plus an accessibility pass: keyboard reachability of the action centre and archive, focus order, contrast, and the table semantics already present verified against a checklist. |
| **Slice G2** | The three customer pages ship in all three languages (gate 8646, measured), RTL at 375 px with Persian digits and no horizontal overflow, with distinct empty / refused / failed / loading states. |
| **Open** | No accessibility audit has been run. Page titles are static English in every locale (dashboard-wide `noIndexMetadata` pattern). Slice E fixed two defects found by looking: Latin digits in the Persian cutoff, and dead colour classes (`bg-base`, `text-fg`) that left form fields white, plus every opacity modifier on a theme colour (Tailwind 3 emits nothing for `bg-signal/10` on a `var()` colour; dead borders fell back to bright `#E5E7EB` row lines) — now guarded by a test that reads the Tailwind config. |

## 13. Database correctness, migrations, security, tenant/site isolation, audit

| | |
| --- | --- |
| **Status** | `DEPLOYED` — three additive migrations applied in production (82 → 85), each rehearsed in CI on real PostgreSQL |
| **Evidence** | One additive migration (82 → 83) classified `FORWARD_ONLY_REQUIRES_BACKUP` and rehearsed in CI on real PostgreSQL; tenant and site isolation proven live; `GET /api/executive/summary` is `TENANT_MEMBER`, `POST /api/executive/reports/run` is `PLATFORM_ADMIN` on its own credential; corrections write an `AuditLog` row |
| **Slice E** | Second additive migration (`ExecutiveSettings`, declared in both Phase 102 lists); `PUT /api/executive/settings` classified `TENANT_MEMBER` through a registered guard token, origin and content type refused before the session is read, organization never taken from the body (proven live: a smuggled `organizationId` changed nothing in the other tenant), every change audited inside its own transaction with before/after. |
| **Dependency** | Rows 2 and 3 add schema and must each extend this evidence |
| **Acceptance** | Every new model carries organization scope at the query level, every new route is classified by the Phase 99 inventory, and every write that changes a figure is auditable. |

## 14. Final validation and post-deployment review

| | |
| --- | --- |
| **Status** | `IN_PROGRESS` — production runs `cd6b1f5d`; the release carrying G2 and G3 (`b461ac97`) is dispatched and waiting for the environment reviewer |
| **Evidence** | Production runs **`f65a1f42`** (deploy run 38366191733, 2026-10-13): backup evidence verified on the host, migrations 82 → 84 applied and verified (84/84, 0 unresolved), `hermes-web` recreated, post-deploy health gate passed (healthy after 15 s, restart_count 0, `/api/health/ready` status ready, database true). Confirmed from outside: `/api/health` ok, `/api/health/ready` ready, `/api/executive/*` 401 for an anonymous caller, `/fa` and `/en` dashboard routes redirect to sign-in. PRs #134–#138 merged in order, each at a verified head with its required checks green. |
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
5. **Slice G** — row 3, the tenant customer domain (new schema). *G1 and G2 merged and deployed; G3 (management view + nightly report) built and proven.*
6. **Slice H** — rows 4 and 5, assets and the people dimension.
8. **Slice J** — row 8, overdue customer follow-ups as a priority source, on a new
   `customers` authority axis. *Implemented and validated on an isolated environment.*
7. **Slice I** — row 11, the performance baseline. *Measured, indexed and cached on an isolated environment; no production figure.*
8. **Slice J** — row 12's accessibility pass.

Rows 13 and 14 are not slices: every slice must extend them, and row 14 closes
the session.

# Executive Management Center — Slice B: the nightly report

Status: **IMPLEMENTED, UNCOMMITTED at time of writing, NOT DEPLOYED**
Date: 2026-10-11
Base: `origin/main = e9961048`, on top of slice A (`555bc3b0`), in worktree
`.claude/worktrees/exec-main`, branch `feature/executive-management-center`.

This is brief §8. It is **one slice**, not the remainder of the brief — §4
(accounting), §5 (customers) and the §10 performance baseline are still open and
are listed at the end with their reasons.

---

## 1. What exists now

A business day that has **finished** is frozen into one report per
organization, on a schedule, without a browser open. The report is readable from
an archive, in all three locales, and the figures in it are the figures of that
night — never recomputed on read.

| Piece | Where |
| --- | --- |
| Storage | `ExecutiveDailyReport` + migration `20261011090000_executive_daily_report` |
| Contract (pure) | `src/lib/executive/report/contract.ts` |
| Generation | `src/lib/executive/report/generate.ts` |
| Reading | `src/lib/executive/report/read.ts` |
| The pass | `src/lib/executive/report/worker.ts` |
| Worker credential | `src/lib/executive/report/auth.ts` |
| Trigger endpoint | `POST /api/executive/reports/run` |
| Scheduler | `scripts/executive/daily-report-worker.mjs`, `npm run executive:report:worker` |
| Archive UI | `/{locale}/dashboard/executive/reports` and `.../reports/[date]` |

Nothing in slice A was replaced. The report renders through the **same**
`ExecutiveSummaryView` the live screen uses, with the range selector swapped for
the report's envelope — which is what makes "the archive shows what the screen
showed" structural rather than a promise.

---

## 2. The guarantees, and how each is enforced

| Brief requirement | Mechanism |
| --- | --- |
| Generated server-side, not dependent on a browser | A bounded pass behind `POST /api/executive/reports/run`, driven by a polling `.mjs` runner — the same shape as the metering worker. |
| Idempotent, keyed by organization + date + version | The unique key `(organizationId, businessDate, version)` **is** the mechanism. Two replicas both INSERT version 1; one wins, the loser re-reads and returns `ALREADY_REPORTED`. There is no check-then-write window. |
| Bounded retry, failure logged, recoverable | The runner backs off exponentially with jitter, treats 401/403 as fatal rather than retrying forever, and logs one line per failed organization so a failure is attributable to a tenant. |
| No duplicate generation **or notification** | Generation: the unique key. Notification: the right to notify is **claimed** by a conditional update (`notifiedAt IS NULL` → now); only the caller whose update affected one row may send. |
| Precise day boundary, DST handled | `resolveCompletedDay` over `businessDayWindow`. A DST day is 23 or 25 hours and is stored as such; the window is refused if it has not finished. |
| Snapshot, generation time, data cutoff, coverage, calculation version | All columns on the row. `dataCutoffAt` is the **end of the window**, not "now" — nothing after the day boundary is in the figures. |
| Original preserved; a correction is a new version | A correction writes version + 1 naming `supersedesVersion`, with `regeneratedBy` and `regenerationReason`. Version 1 is never mutated or deleted — asserted by a test that compares it byte-for-byte before and after. |
| Controlled regeneration with permission and audit | A correction requires an actor and a reason and writes an `AuditLog` row (`executive.report.regenerate`). The routine nightly run is deliberately **not** audited per tenant — an audit row per tenant per night buries the events that matter. |
| Detail links re-check current permission | The archive and detail pages resolve the scope on every request. The date in the URL is a selector, never an authority: queries match on `(organizationId, businessDate)` with the organization from the server. |
| Deterministic, no LLM or embeddings | The same deterministic aggregation as the screen, over a fixed window. `CALC_VERSION` records which arithmetic produced a report so two reports from different code are visibly incomparable. |
| In-app notification; external channels only where configured | In-app only, via the existing `NotificationService`. The notification carries **no figures** — only that a report exists — so it cannot become a side channel around the permission check needed to open it. No email path was invented, because no manager-level channel setting exists in this product. |

### Two deliberate directional choices

**Claim-then-send, not send-then-mark.** A crash between the two loses a
notification rather than duplicating one. The report is in the archive either
way, so a lost notification is recoverable by looking at the dashboard; a
duplicate at 3 a.m. is not recoverable at all.

**Polling, not cron.** Every tenant's day ends at its own cutoff and a report may
only cover a day that has finished, so no single wall-clock time serves them all.
A cheap poll asks "is any night now complete and unreported?", which is correct
for every zone at once and self-heals after an outage — a night missed at 00:15
is picked up at 00:30.

---

## 3. Proven against real data

Same isolated container as slice A (`hermes-exec-pg`, port 45481), three seeded
organizations, driven through the live HTTP endpoint.

| Run | Result |
| --- | --- |
| No token at all | **401** `unauthorized` — the trigger never falls open |
| Invalid `?max=abc` | **400** `INVALID_REQUEST` — refused, not silently defaulted |
| Pass 1 | `leaseHeld:true, businessDate:"2026-10-10", considered:3, created:3, notified:3, failed:0` |
| Passes 2, 3, 4 (two concurrent) | all `leaseHeld:false, considered:0` — the 120 s lease held; coordination works |
| Pass 5 (after lease expiry) | `considered:3, created:0, **alreadyReported:3**, notified:0` — idempotency, live |

Stored state after **five** passes:

* 3 rows, one per organization, all version 1, `Asia/Tehran`, **24-hour** windows
  cut at Tehran midnight (`dataCutoffAt = 2026-10-10T20:30:00Z`);
* `calcVersion = exec-report-1` on each;
* **3 notifications in total**, each row `notifiedAt` set exactly once;
* unique `(org, date, version)` keys: 3 of 3;
* coverage recorded per section, with `customers: NO_SOURCE` and its reason.

### The archive, opened as the owner

The list showed **one** report — this organization's. The other two tenants'
rows were invisible, which is the tenant scope working at the UI layer.

The frozen report for 2026-10-10 showed figures that **differ from the live
screen**, which is the whole point:

| Figure | Live screen (today) | Frozen report (2026-10-10) |
| --- | --- | --- |
| Tasks completed | 2 | **1** |
| Alerts raised | 4 | **1** |
| Plants reporting data | 2 | **1** |

It is a report of a finished day, not a snapshot of "now". Its header states the
data cutoff, the covered period, the zone and the calculation version.

---

## 4. Two defects this slice found in slice A

1. **`previousBusinessDay` returned the day it was given at a non-midnight
   cutoff.** It stepped back one hour from the window's start: at a midnight
   cutoff that lands on 23:00 the previous date and looks right, but at a 06:00
   cutoff it lands on 05:00 the *same* date. The nightly report would have
   compared a day against itself, and `lastCompletedBusinessDay` would never
   have stepped back. Slice A's tests only exercised a midnight cutoff. Replaced
   with calendar arithmetic on the date label — correct for DST days too, since
   a 24-hour subtraction would be wrong by an hour twice a year. Four regression
   tests added, including a leap day. `BusinessDayWindow` now carries its own
   `cutoffMinutes` so stepping to an adjacent day cannot silently revert to
   midnight.
2. **The worker's documented credential was not the one the server checked.**
   The route initially reused `authorizeWorkerRequest`, which reads only
   `METERING_WORKER_TOKEN` / `METRICS_TOKEN`, while the runner documented and
   sent `EXECUTIVE_REPORT_WORKER_TOKEN` — so the live call returned 401. Fixed
   with a dedicated guard rather than by widening the metering one: sharing a key
   would mean the right to produce management reports is also the right to drive
   billing metering.

---

## 5. Files

**Added (10):** the migration, `report/{contract,generate,read,worker,auth}.ts`,
`report/__tests__/{generate,worker}.test.ts`, the run route, the runner script,
the two archive pages, this document.

**Modified (8):** `prisma/schema.prisma` (one model + one back-relation),
`period.ts` (completed-day window, the `previousBusinessDay` fix),
`summary.ts` (optional pre-resolved window), `ExecutiveSummaryView.tsx` (frozen
header + archive link), `package.json` (two scripts), the three message
catalogues, `german-final-gate.test.ts` (8368 → 8395), the Phase 99 classifier
and its inventory, and the guard-recognition test.

---

## 6. Validation executed

| Command | Result |
| --- | --- |
| `npx prisma validate` | valid |
| `npx tsc --noEmit` | **0 errors** |
| `npx eslint` (slice sources) | **0 problems** |
| `node --check` (runner) | syntax OK |
| `npx vitest run` — 40 files | **1034 passed, 0 failed** |
| `generate-inventory.mjs --check` | no drift; `unknown: 0` |
| `npm run build` | see §7 |
| Live HTTP runs against the isolated database | §3 |

`GET /api/executive/summary` stays `TENANT_MEMBER`;
`POST /api/executive/reports/run` is `PLATFORM_ADMIN` via its own registered
token.

Two jsdom `.tsx` suites still **do not run** on this machine (pre-existing
worker-spawn failure, unrelated to this slice).

---

## 7. Still open after this slice

| Brief | Item | Why |
| --- | --- | --- |
| §4 | Accounting oversight — documents, AR ageing, reconciliation, accountant end-of-day | No ledger entity exists. Unchanged from slice A; the surface says so. |
| §5 | Customers, follow-ups, opportunities, risk rules | No tenant-scoped customer source; `CrmOpportunity` has no `organizationId`. |
| §8 | Per-organization report time and zone | Env-level today (`HERMES_EXECUTIVE_TIME_ZONE`, `HERMES_EXECUTIVE_DAY_CUTOFF_MINUTES`). Per-tenant needs a column; the report already **stores** the zone it used, so adding one later does not reinterpret existing reports. |
| §8 | "Tomorrow's priorities" | Not built. It needs a rule about what makes something a priority; inventing one would be the kind of fabricated judgement the brief forbids. The action centre carries today's breaches instead. |
| §8 | External channels (email/SMS) | No manager-level channel setting and no configured transport. In-app only, deliberately. |
| §10 | Performance baseline, caching | Not measured, not built. No latency number is claimed. |
| — | A scheduled runner in deployment | The script and npm scripts exist; wiring it into compose/CI is a deployment decision and is **not** done here. |

# Executive Management Center — Slice D: tomorrow's priorities

Status: **IMPLEMENTED AND PROVEN ON AN ISOLATED DATABASE, NOT YET MERGED**
Date: 2026-10-12
Branch `feature/executive-slice-d-priorities`, stacked on slice C
(`feature/executive-slice-c-financial-oversight`, PR #134) because both slices
move the same pinned counts.

Requirement row 8 in `REQUIREMENTS-TRACKER.md`. It advances to `PARTIAL`:
the rules are written, inspectable and parameterised, and every item states its
reason — but the parameters are product defaults until slice E stores them per
organization.

---

## 1. What a manager sees

`/{locale}/dashboard/executive/priorities`, linked from the management view.

Everything that needs action **before the end of tomorrow** in the reporting
zone, in three tiers — *act first*, *act today*, *plan for tomorrow* — and under
each item one sentence naming the rule that placed it, with its numbers:

> Waiting for a decision for 9 days, past the 7-day critical limit.
> Critical priority and overdue by 1 day.
> High or critical priority, due Oct 13, 2026, 6:29 PM.

Below the list, **the whole rule set**, in order, with the thresholds actually
in force quoted inside each rule, and a note that these are the product
defaults.

## 2. The rules

Ordered; the first rule an item matches decides its tier. Within a tier, the
item under pressure longest comes first (earliest due date for work, earliest
raised for approvals and alerts); ties break on id, so the same records always
give the same list. **There is no score and no weighting.**

| # | Rule | Tier | Parameter |
| --- | --- | --- | --- |
| 1 | Critical task or work order past due | 1 | — |
| 2 | Critical alert still open after *N* hours | 1 | `alertAgeHours` (4) |
| 3 | Approval waiting *N* days or more | 1 | `approvalCriticalDays` (7) |
| 4 | High task or work order past due | 2 | — |
| 5 | High or critical work due before the end of tomorrow | 2 | — |
| 6 | Approval waiting *N* days or more | 2 | `approvalStaleDays` (3) |
| 7 | High alert still open after *N* hours | 2 | `alertAgeHours` (4) |
| 8 | Any other open work past due | 3 | — |
| 9 | Any other open work due before the end of tomorrow | 3 | — |

The parameters are validated and bounded (`validatePriorityConfig`): every
problem is reported at once, a value outside its bounds is refused rather than
clamped, and "critically late" must come strictly after "late", or rule 6 could
never fire. An invalid configuration makes the build refuse — it never ranks
with thresholds nobody chose.

**"The end of tomorrow"** is the end of the next *calendar date* in the zone,
from a new `nextBusinessDay` that shares `previousBusinessDay`'s calendar
arithmetic. It is 23 hours away across a spring-forward day, not a fixed 24, and
it keeps a non-midnight cutoff.

## 3. Security and scoping

* Same gate as the management view, re-run per request. The page takes **no
  client input**: the horizon comes from the server's clock and zone.
* Work orders, tasks and approvals need `view_erp`. Alerts need
  `view_industrial` **and** are narrowed to the reader's sites in the query
  itself. A refused source issues no query and is listed as excluded, with the
  reason. "Nothing to do" and "nothing you may see" are different answers, and
  the page gives the right one.
* Every query carries the server-resolved `organizationId`; each source reads
  at most 200 rows, oldest pressure first, and says when it was cut.
* One failing source makes the whole list `UNAVAILABLE` — a partial ranking
  must not pose as the full one.

## 4. Proven on real data

Isolated PostgreSQL container, seeded with `seed-exec-qa.mjs`,
`seed-oversight-qa.mjs` and `seed-priorities-qa.mjs`. The last one adds the
decoys: a CRITICAL task due **beyond** the horizon, a CANCELLED overdue task,
and **another tenant's** CRITICAL overdue task.

Rendered as the owner, Asia/Tehran, horizon "before Oct 14, 12:00 AM":

| Tier | Item | Reason shown |
| --- | --- | --- |
| 1 | Capital release: stand 3 spares | Waiting 9 days, past the 7-day critical limit |
| 1 | Close out safety interlock test | Critical priority, overdue by 1 day |
| 1 | Bearing temperature trending to limit | Critical alert open for 6 hours |
| 2 | Commission stand 3 drive | High priority, overdue by 3 days |
| 2 | Hydraulic pressure drift | High-severity alert open for 5 hours |
| 2 | Replace descaler pump seal (work order) | High or critical priority, due tomorrow 6:29 PM |
| 3 | Update loop tuning records | Overdue by 8 hours |

**Absent, as they must be:** the task beyond the horizon, the cancelled task,
the other tenant's task, the finished task, the critical alert's 10-minute-old
sibling before ageing (it was inside the grace period), and the 2-day approval
(below the 3-day threshold).

**Permission, live.** The same user switched to `VIEWER` in the isolated
database (no `view_erp`, no site grant): the list is empty, and the sources
block says *why* for each — tasks, work orders and approvals refused for the
role, alerts with no granted plant. Restored to `OWNER` afterwards.

**Persian and phone width.** RTL, Persian digits throughout, and at 375 px
`scrollWidth == clientWidth`.

## 5. Defect found and fixed during the live check

The rule ordinals printed **Latin "1., 2., 3."** in the Persian view — a raw
`{index + 1}`. Now formatted through the locale (`۱. ۲. ۳.`), confirmed live.

## 6. Files

**Added:** `src/lib/executive/priorities.ts`,
`src/components/executive/TomorrowsPrioritiesView.tsx`,
`src/app/[locale]/dashboard/executive/priorities/page.tsx`,
`__tests__/priorities.test.ts` (28 tests),
`__tests__/priorities-i18n-contract.test.ts`, two screenshots, this document.

**Modified:** `period.ts` (`nextBusinessDay`, via a helper shared with
`previousBusinessDay`, whose ten regression tests still pass),
`ExecutiveSummaryView.tsx` (link), `messages/{en,fa,de}.json` (+45 leaves
each), `german-final-gate.test.ts` (8449 → **8494**, measured), route coverage
(292 → **293**, the generator's output).

No schema change, no migration, no new API route.

## 7. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` (executive sources) | 0 problems |
| `vitest` — executive suites, German gates, route coverage | 15 files, 279 passed |
| Live render against the isolated database | §4 |

## 8. Still open

* **Per-organization thresholds** — slice E adds the storage, together with
  the per-organization time zone and cutoff, in one migration.
* The priorities are not yet part of the nightly report; that is a report
  change with its own `calcVersion`.
* The list is read-only: acting on an item happens on its own screen, which
  each item links to.

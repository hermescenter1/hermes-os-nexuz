# Executive Management Center — Slice G3: customers in the management view and the nightly report

Status: **IMPLEMENTED AND PROVEN ON AN ISOLATED DATABASE, NOT YET MERGED**
Date: 2026-10-13
Branch `feature/executive-slice-g3-customers-in-view`, from `main` = `3f4a0a55`
(G2 merged as PR #141).

Requirement row 3 closes its last gap: the management view's customers panel no
longer says "no tenant-scoped source", and the nightly report carries the
organization's customers for the day it reports on.

---

## 1. What the panel shows

Five metrics, each with its own definition, named source, period and
data-as-of timestamp, and each linking to the records behind it:

| Metric | What it counts | Period | Records |
| --- | --- | --- | --- |
| Active customers | Status active, archived excluded | point in time | `clients?status=ACTIVE` |
| Overdue follow-ups | Next action due before the period's end, not rescheduled | point in time | `clients?followUp=overdue` |
| Customers with no owner | Nobody named as follow-up owner | point in time | `clients?owner=none` |
| New customers | Created inside the period | **windowed**, with a real comparison to the previous period of the same length | `clients` |
| Recorded contacts | Contacts that HAPPENED inside the period (by `occurredAt`, not when they were typed) | **windowed**, same comparison | `clients` |

Under them, the same kind of statement the project-cost panel carries:
**these are relationship figures; a customer's receivable, revenue or balance
needs an accounting ledger this product does not have.** No parallel financial
model is invented, and the accounting lane's `Party` remains the single
counterparty table.

## 2. "As of the end of the period", so the nightly report is a snapshot

The point-in-time counts are taken **as of `range.currentEndMs`**, not the
instant of computation:

* on the live screen the current window ends "now", so nothing changes;
* in the nightly report the window ends when the **reported day** ended, so the
  frozen report carries that day's position.

Every customer count is additionally restricted to customers that **existed by
the end of the period** (`createdAt < asOf`), so a customer created afterwards
can never appear in an earlier day's report.

The snapshot's arithmetic changed, so `CALC_VERSION` is now **`exec-report-2`**.
A report carrying `exec-report-1` has no customer figures at all, and comparing
the two as a trend would be wrong.

What cannot be reconstructed is stated rather than faked: `Party` keeps no
history table, so "active" and "no owner" reflect each row's state when the
report was generated, restricted to rows that existed by the period's end.

## 3. Isolation and permission

Every count carries `organizationId` and `kind: "CUSTOMER"` in its own WHERE
clause. The section needs the same ERP authority as the rest of the
organization's commercial records: a reader without it gets **FORBIDDEN with a
stated reason, and no customer query is issued at all** — asserted by a test
that inspects the recorded queries.

An organization with no customers yet gets **EMPTY**, never a wall of zeros
that would read like activity.

## 4. Proven on an isolated database

Counts taken straight from PostgreSQL by independent SQL:
`active 1, overdue 0, unassigned 0`, 1 interaction, 0 customers in other
organizations.

The rendered management view, same moment: **Active customers 1 · Overdue
follow-ups 0 · Customers with no owner 0 · New customers 1 · Recorded contacts
1** — every figure matching the database. Each metric's "Definition" panel shows
its sentence, its named source, its period and its data-as-of time.

Persian: the whole section in Persian with Persian digits, RTL.
`visual-evidence/fa-desktop-customers-section.jpg`.

**The nightly report, run for real:** a sweep produced the 2026-10-12 report
(`created: 1, notified: 1, undelivered: 0`), and the stored snapshot carries

```
calc=exec-report-2  periodEnd=2026-10-12T20:30:00Z
customers: { status: "EMPTY", metrics: [] }
coverage:  { section: "customers", status: "EMPTY", reasonKey: "executive.reasons.noRows" }
```

while the live screen shows 1 active customer — because that customer was
created on 2026-10-13, **after** the reported day ended. That is the exact
property the brief asks for: the report is the finished day, not today's live
figures. Reports generated earlier keep `exec-report-1` and their original
content; nothing was rewritten.

## 5. Files

**Modified:** `src/lib/executive/summary.ts` (the `customersSection` builder, the
published `CustomersSummary` shape, two new source keys, both call sites, and
the removal of the now-false `customersNotTenantScoped` reason),
`src/components/executive/ExecutiveSummaryView.tsx` (the panel renders its
metrics, the stated gap and a link to the records),
`src/lib/executive/report/contract.ts` (`CALC_VERSION` → `exec-report-2`),
`messages/{en,fa,de}.json` (net +14 leaves each; German gate 8646 → **8660**),
`german-final-gate.test.ts`, and the two test fixtures that asserted the old
refusal.

**Added:** this document and the Persian screenshot.

## 6. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `vitest` — the executive summary suite | **38 passed**, including seven new customer tests (isolation, as-of end of period, no customer created later, real period comparison, provenance on every metric, the stated financial gap, FORBIDDEN issuing no query) |
| Figures vs database | §4 — every metric equals an independent SQL count |
| A real nightly sweep | §4 — the frozen report carries the finished day, `exec-report-2` |

Still open: row 10 (a scheduled production run), and the accessibility pass.

One pinned contract moved with the change: `i18n-contract.test.ts` counted
eight refusal reasons and eight named sources; it is now **seven reasons**
(`customersNotTenantScoped` is gone, its claim no longer being true) and **ten
sources** (`party`, `partyInteraction` joined). Full run after the update:
17 files, **335 passed, 0 failed**.

### 6.1 Why those numbers moved, and proof the control still bites

Changing a pinned number to match the code is not evidence that the control
survived — it is exactly what someone would do to silence it. So the change is
stated first and then demonstrated.

**What moved and why.** The census counts the `executive.reasons.*` and
`executive.sources.*` keys the aggregation can actually emit, found by reading
`summary.ts` itself.

| | Before | After | Why |
| --- | --- | --- | --- |
| reasons | 8 | **7** | `customersNotTenantScoped` was deleted. It said "this organization's customers have no tenant-scoped source". Slice G1 created that source, so the sentence became false; leaving the key would have kept a refusal the code can no longer reach, and leaving the count at 8 would have required the dead key to stay. |
| sources | 8 | **10** | `party` and `partyInteraction` were added, because the customers panel now names where each of its five figures comes from. |

Net effect on the catalogue: −1 and +2 leaves plus the metric and definition
copy, which is the +15/−1 measured in the German gate (8646 → 8660).

**The control is unchanged.** Neither the rule nor its scope was touched: the
census still derives the key set from `summary.ts` with the same regex, and
`expectResolvable` still requires every key to resolve in **en, fa and de**.
Only the two expected totals moved.

**Proof by mutation** (run 2026-10-13, each mutation applied, observed, and
reverted; the file was restored from a copy, nothing was discarded):

| Mutation | What the gate did |
| --- | --- |
| Added an eleventh source `executive.sources.mutantSource` to `SOURCE` in `summary.ts`, with no translation anywhere | **RED, twice**: `payload keys — unresolved keys: expected [ 'en: …mutantSource', 'fa: …mutantSource', 'de: …mutantSource' ] to deeply equal []`, and `expected 11 to be 10`. So the census notices an addition *and* names the three locales that lack it. |
| Removed `executive.sources.party` from **de.json only**, leaving the code untouched | **RED, twice**: `unresolved keys: [ 'de: executive.sources.party' ]`, and the three-way key-set comparison reported the missing German leaf. So a key that exists in two languages out of three is still a failure. |

After reverting both, the suite is **15 passed, 0 failed**. A count that can be
made red by adding a key and by deleting one translation is still measuring the
thing it was written to measure.

A second pinned expectation moved, and CI caught it where my local run had not:
`summary-route-isolation.test.ts` asserted the customer section is
`NO_SOURCE` **on every response**. Its fake database had no customer delegate,
so the section threw and was reported `UNAVAILABLE` — the honest answer, but
not what the test expected. The fake now has the two delegates, and the single
obsolete assertion is replaced by two stronger ones: **EMPTY with its reason**
when the organization has no customers, and **UNAVAILABLE with no driver
message, host or stack leaked** when the customer source cannot be read, while
the rest of the dashboard still answers. 26/26 in that suite.

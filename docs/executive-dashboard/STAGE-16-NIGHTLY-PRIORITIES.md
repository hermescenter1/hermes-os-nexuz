# Executive Management Center — tomorrow's priorities, frozen into the nightly report

Status: **IMPLEMENTED AND VALIDATED ON AN ISOLATED ENVIRONMENT — NOT DEPLOYED**
Date: 2026-10-14
Branch from `main` = `56126c31`.
`CALC_VERSION`: `exec-report-2` → **`exec-report-3`**

This closes the second of row 8's two named gaps. The first — overdue customer
follow-ups as a priority source — shipped in slice J.

---

## 1. The question that had to be answered first

*Can the ranking as it stood at a past cutoff be reconstructed?*

**No.** The sources keep no history:

| Source | Fields the ranking reads | History |
| --- | --- | --- |
| `ErpTask` | `status`, `priority`, `dueDate` | none — mutable columns |
| `ErpWorkOrder` | `status`, `priority`, `dueDate` | none |
| `ErpApprovalRequest` | `status`, `createdAt` | `createdAt` is immutable, `status` is not |
| `AssetAlert` | `dismissed`, `resolvedAt`, `severity` | none |
| `Party` | `nextActionAt`, `archivedAt` | none — `version` counts changes but keeps no prior value |

A task that was CRITICAL and overdue at last night's cutoff, and was closed or
down-prioritised this morning, leaves **no trace of what it was**. Running the
ranking today with yesterday's clock would produce **today's rows filtered by
date** — something that looks like history and is not. That is the fabricated
historical report this slice was told not to build.

**So the snapshot is the history.** The list is computed inside the generating
pass and frozen. Nothing is reconstructed, and the data says so about itself.

---

## 2. What is stored, and why each field exists

A new nullable column, `ExecutiveDailyReport.prioritySnapshot`. A **separate
column**, not a key inside `snapshot`, so the meaning of an existing column
never changes under reports already written.

| Field | Why |
| --- | --- |
| `reportBusinessDate` | the day the report is about |
| `targetBusinessDate` | the day the list is FOR — see §3 |
| `timeZone`, `targetEndIso` | the day label and the instants it spans, in the organization's own zone |
| `observedAtIso` | **when the rows were read**, deliberately not the record's creation time — see §4 |
| `rulesVersion` | `PRIORITY_RULES_VERSION`; slice J added two rules, so a list from the previous version could not contain a customer follow-up at all |
| `config` | the thresholds in force, so each reason can be read back literally |
| `late` | the target day had already ended when the rows were read — see §5 |
| `list` | the section itself: every item with its tier, rule and reason, and the per-source exclusions |
| `basis` | `"OBSERVED_AT_GENERATION"` — stated **in the data**, so a future mechanism that genuinely can reconstruct a cutoff state must use a different value rather than silently reuse this one |

`null` means **not recorded**: every report written before `exec-report-3` has
no list, and so does a pass whose priority sources could not be read. It never
means "nothing was due", and the surface says so in all three languages.

---

## 3. The target day comes from the report, not from the clock

`buildTomorrowsPriorities` derived both "today" and the horizon from `nowMs`.
That is right on the live screen and **wrong in the nightly pass**, which runs
*after* the day it reports on has ended: by its own clock "today" is already
the next day, so `nextBusinessDay` would reach for the day after that. **A
report about Monday would carry Wednesday's list** — and nobody would notice
until somebody acted on it.

The function now takes an optional `anchorDay`, supplied by the generator from
the reported day. The live screen omits it and behaves exactly as before.

Tested across midnight, across a month boundary, in two time zones, and with a
non-zero day cutoff. Two zones produce the **same label and different
instants**, which is why a report must not be read against someone else's
midnight.

---

## 4. One instant, not five

The five priority sources are five queries. Run loose, each can see a different
moment, and the frozen list becomes a composite of states that **never existed
together** — a task counted as open beside a follow-up that was already
handled.

They are therefore read inside **one transaction at `RepeatableRead`**. That is
also what makes `observedAtIso` meaningful: one instant, not an average of
five. A test asserts both the single transaction and the isolation level.

`observedAtIso` is **injected**, not read from the wall clock inside the
function. The first cut called `Date.now()` there, which made the frozen list
depend on a clock the caller could not control — untestable, and in a
correction it would disagree with the instant everything else in the pass is
stamped with.

---

## 5. A late pass is a record, not advice

If the pass runs after the target day has already ended — a catch-up, a retry,
a correction days later — the list is a record of what was **still
outstanding**, not a recommendation for that day. `late` is computed in the
data (`observedAtMs >= targetDay.endMs`) and the panel leads with it rather
than leaving the surface to compare dates itself.

A **correction** gets its own, later `observedAtIso` and shows what it actually
saw. The original version is untouched and still readable — asserted by a test
that corrects a night three days later and then reads version 1 back.

---

## 6. Tests

`frozen-priorities.test.ts` (10) and five new cases in `generate.test.ts`:

| Question | Case |
| --- | --- |
| midnight | a report about Monday carries **Tuesday**, though the pass runs Tuesday morning |
| month boundary | 2026-10-31 → 2026-11-01, on the label, not a timestamp |
| time zones | same label, different instants; a non-zero cutoff moves the window twelve hours |
| late pass | `late` flips exactly at the target day's end, not a moment before |
| read consistency | one transaction, `RepeatableRead` |
| edits after generation | the follow-up is rescheduled and the customer renamed — the stored snapshot does not move |
| sources unreadable | `null` recorded, the report still created |
| correction | its own observation time, the newer data, and version 1 intact |

Two real defects were found by these tests and fixed:

* a `scope()` helper cast with `as ExecutiveScope` hid a **missing fourth
  authority axis** from the compiler; at runtime `authority.customers` was
  `undefined`, so the follow-up source issued no query and the list came back
  empty;
* `Date.now()` inside `freezePriorities`, as described in §4.

---

## 7. What this does NOT close

**The exact state at the data cutoff.** Freezing at generation is the honest
record available today; it is not the cutoff state, and the requirement stays
open in the tracker. Closing it needs a history mechanism on
`ErpTask.status/priority/dueDate` and `Party.nextActionAt` — an append-only
trail or a per-day materialisation — which this slice did not build and should
not have pretended to.

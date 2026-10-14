# Executive Management Center — Slice J: a customer authority axis, and overdue follow-ups as a priority

Status: **IMPLEMENTED AND VALIDATED ON AN ISOLATED ENVIRONMENT — NOT DEPLOYED**
Date: 2026-10-14
Branch from `main` = `84437c3c` (PR #143 merged).

Requirement row 8 named two remaining gaps: *"overdue customer follow-ups are
not yet a priority source, and the priorities are not yet part of the nightly
report"*. This slice closes the first. The second is still open and is stated
as such at the bottom.

---

## 1. A defect found on the way, which had to be fixed first

The management view's customer section was gated on the **operations** axis
(`view_erp`). The two permissions do not cover the same people:

| Permission | Roles |
| --- | --- |
| `view_erp` | OWNER, ADMIN |
| `view_customers` | OWNER, ADMIN, **MANAGER** |

So a MANAGER — who can open `/dashboard/clients`, read every customer record,
edit them and log interactions — was told by the management view:

> *Your role does not include operational data for this organization.*

about the **counts** of those same records. The sentence was not true, and a
refusal that states a false reason is worse than no refusal: it sends the
reader to ask for a permission they already hold.

`ExecutiveAuthority` therefore gains a fourth axis, `customers`, resolved from
`view_customers` in `scope.ts` exactly as the other three are resolved from
theirs. Nobody loses anything — `view_customers` is a superset of `view_erp` —
and MANAGER gains what they could already see one click away.

Because the axis is part of the executive cache key, a reader who gains or
loses it cannot be served the other one's entry: `cache.test.ts` has a case for
it beside the other three axes.

**The compiler enforced the decision.** Making the field required turned all 20
places that build an `ExecutiveAuthority` into type errors, and each was given
a deliberate value rather than a blanket `true` — the nightly report at full
breadth, the oversight tests at `false` (that surface never reads customers),
the "reader who may see nothing" fixtures at `false`. That is the behaviour
`cache.ts` promises in its own header: adding an axis without deciding is a
type error, not a silent leak.

---

## 2. The new priority source

`buildTomorrowsPriorities` gains a fifth source, `customerFollowUps`, reading
`Party` where the organization's own customers have a `nextActionAt` before the
horizon. Two rules:

| Tier | Rule | Fires when |
| --- | --- | --- |
| 2 | `FOLLOW_UP_OVERDUE` | the promised date has passed |
| 3 | `FOLLOW_UP_DUE_SOON` | it falls due before the end of tomorrow |

**Why tier 2 for an overdue follow-up when overdue LOW work is tier 3.** A task
that slips is internal. A follow-up date is a commitment to somebody outside
the organization who is waiting and cannot see why nothing happened. That is a
judgement, and it is written into `priorities.ts` where it can be argued with
rather than buried. The rule itself stays a rule: it fires on a date that has
passed, nothing else. No score, no weighting.

**No new threshold, no migration.** The other sources have configurable
thresholds because "late" needs defining for them; an overdue promise does not.
If a per-organization threshold is wanted later it belongs in `PriorityConfig`
beside the others — and that would carry a migration, which this slice does
not.

**Permission.** The follow-up source is gated on the new `customers` axis, not
on operations, because a follow-up item carries the customer's **name**. The
summary's customer section publishes only counts; this publishes an identity,
so it is governed by the permission over the customer records themselves. A
reader without the axis causes **no query at all**, and a test asserts the name
never appears anywhere in the payload.

**Cost.** The query is `(organizationId, kind, archivedAt, nextActionAt < horizon)`,
ordered by `nextActionAt`, bounded by `CANDIDATE_LIMIT`. It lands on the
`(organizationId, nextActionAt)` index that already existed — no new index.

---

## 3. Tests

Four new behavioural cases in `priorities.test.ts`, beyond the fixtures:

1. **Ranking** — a follow-up overdue by 2 days outranks a LOW task overdue by
   5 days, because tier decides before age; the item carries the customer's
   name and `dashboard/clients/<id>`.
2. **Horizon** — a follow-up still ahead names its date and sits in tier 3, and
   anything past the horizon is excluded **by the query**, asserted on the
   `where` clause rather than on the output.
3. **Refusal** — without the axis, no customer query is issued, the source is
   reported as excluded with `forbiddenCustomers`, and the customer's name does
   not appear in the serialised result.
4. **Customers-only reader** — a reader holding *only* that axis still gets
   their list; `party` is the only delegate called.

Two in `summary.test.ts`: the old "without ERP authority" case became "without
**customer** authority" and now also checks the reason key, and a new case
proves the MANAGER shape — `customers: true, operations: false` — gets
`OPERATIONAL` figures and really reads the source.

One strengthened control: the query-scoping test asserted `calls` had length 4.
It now asserts the **set** of delegates, so a source silently dropped fails too
— a count alone would have stayed green.

---

## 4. Pinned contracts that moved, and why

| Contract | Before | After | Why |
| --- | --- | --- | --- |
| German catalogue total | 8663 | **8670** | +7 leaves, measured: one kind, two reasons, two rule texts, one source name, one refusal |
| `i18n-contract` refusal census | 7 | **8** | `executive.reasons.forbiddenCustomers` |
| priorities query census | length 4 | the delegate **set** | strengthened, not merely renumbered |
| three `authority` deep-equals | 3 axes | 4 axes | values derived from each role's permissions, not copied from the failure output |

---

## 5. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| `vitest src/lib/executive src/app/api/executive src/i18n` | **967 passed, 0 failed** (42 files) |

**Two suites could not be run on this machine and are NOT claimed as passing**:
`german-enterprise-render.test.tsx` and `german-operations-render.test.tsx`
never started a worker (`[vitest-pool]: Failed to start forks worker … Timeout
waiting for worker to respond`). This is the machine, not the change: an
unrelated jsdom suite (`src/components/ds/__tests__`) hits the same error on the
same machine, and the failure happens **before** any test file is loaded. CI
runs both on a clean Linux runner; their result there is the evidence, not this
note.

---

## 6. Still open on row 8

* **The priorities are not part of the nightly report.** Unchanged by this
  slice and deliberately out of its scope: the frozen report carries a summary,
  and adding a ranked list to it is a contract change to the stored report
  shape with its own `CALC_VERSION` question.
* A per-organization threshold for follow-ups, if the owner wants one.

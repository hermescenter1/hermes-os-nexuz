# Executive Management Center — Slice C: financial activity and approvals

Status: **IMPLEMENTED AND PROVEN ON AN ISOLATED DATABASE, NOT YET MERGED**
Date: 2026-10-12
Base: `main = 7020b43c`. Branch `feature/executive-slice-c-financial-oversight`.

Requirement rows closed or advanced (see `REQUIREMENTS-TRACKER.md`): **row 2**
(the oversight half of accounting) and **row 5** (an approval queue that says
whose decision is blocking). Neither row is `DONE` after this slice; each says
why below.

---

## 1. What a manager can now see

A new page, `/{locale}/dashboard/executive/oversight`, linked from the
management view's header. Two sections, each on its own permission axis:

**Recorded project cost** — `view_erp_compensation`
* cost recorded in the period, **one total per currency**, each compared with
  the previous equal period;
* the same broken down by category, ordered by currency first;
* **who recorded it**, counted from the `createdBy` on each cost row and
  windowed on when the row was entered — the accountant-activity question,
  answered from records rather than from logins;
* entries with no recorded author, counted exactly and shown as such;
* projects whose recorded cost exceeds their budget, largest overrun first.

**Approvals** — `view_erp`
* pending approvals, exact count, and the oldest one's age;
* the queue broken down by the **approver role of the earliest step still
  pending** and by how long each has waited (<1, 1–3, 3–7, >7 days);
* requests that are pending but have no pending step, as their own bucket — a
  workflow fault, not a role;
* decisions in the period by outcome, and by decider.

## 2. What it deliberately does not do

| Refusal | Why |
| --- | --- |
| No cross-currency total anywhere | There is no exchange-rate model in the product and `ErpProjectCost.currency` is a free string. The shape carries `exchangeRateAvailable: false`, and a permanent note says so on the page. |
| Not presented as accounting | No ledger, receivable, payable or reconciliation entity exists. `ledgerAvailable: false`, and the not-accounting note is permanent — not shown only when the section is empty. |
| No guessing whose an unattributed entry is | A cost row or decision with no actor is counted as unattributed. |
| Budget vs cost carries its caveat | `ErpProject.budget` and `.actualCost` have no currency column, so they are compared as stored and the page says so. |
| No query on a refused axis | The axis is checked before the database is touched, not applied to the result. |

## 3. Security and tenant isolation

* Same gate as the management view (`resolveExecutiveScope()`), re-run on every
  request; `range` is a validated selector, never an authority.
* **Every** query carries the server-resolved `organizationId`. The tests
  assert this on the query object each fake delegate receives, not on the
  output. Legacy rows whose `organizationId` is `NULL` are excluded by that
  same equality.
* Names are looked up once for both sections, selecting **only** `id` and
  `name` — never the email.
* One failing source marks only its own section `UNAVAILABLE`; driver messages
  never reach the page.
* Bounded: every list and every group-by that can grow carries `take`, and
  truncation is detected by reading one row beyond the limit, then stated.

## 4. Proven on real data

Isolated PostgreSQL container (port 45481), seeded with
`.data/seed-exec-qa.mjs` plus `.data/seed-oversight-qa.mjs`, which adds two
decoys that must never appear for organization A: a **EUR 999,999** row in
another organization, and a **GBP 777,777** legacy row with no organization.

Rendered as the owner of organization A, range "today", Asia/Tehran:

| Figure | Seeded | Rendered |
| --- | --- | --- |
| IRR cost | 48,000,000 + 12,000,000 | **IRR 60,000,000**, 2 entries, from zero |
| USD cost | 1,250 + 300 today, 1,000 yesterday | **$1,550.00**, 2 entries, **+550 (+55%)** |
| Decoys (EUR, GBP) | another tenant / NULL org | **absent** |
| Recorders | owner 2, viewer 1, one with none | owner 2 (IRR 48,000,000 · $300), viewer 1 ($1,250), **1 entry has no recorded author** |
| Over budget | pilot line 100,000 vs 137,500 | **1 of 4**, overrun **+37,500** |
| Pending | 3 | **3**, oldest 9 days |
| Blocking role | capital release → FINANCE_MANAGER (step 1); overtime → step 1 PROJECT_MANAGER **approved**, step 2 FINANCE_MANAGER pending; contractor → no steps | **FINANCE_MANAGER 2** (1 in 1–3 days, 1 over 7 days), **no pending step 1** |
| Decided today | 1 approved by the owner | **Approved 1**, owner 1 approved · 0 rejected |

The overtime request is the one that proves the blocking-role rule: its first
step is already approved, so it is attributed to the role of its *second* step.
A query on "any pending step" or "the first step" would have filed it under
PROJECT_MANAGER.

**Split axes, live.** The same user's role in organization A was set to
`ADMIN` in the isolated database (ADMIN holds `view_erp` but not
`view_erp_compensation`), and the page re-rendered with the cost section
refused — *"Your role does not include financial figures"*, no amount anywhere
in the page text — while the approvals section stayed live. The role was then
restored to `OWNER`.

**Persian and phone width.** `/fa/...` renders RTL with Persian digits, and at
375 px `document.scrollWidth == clientWidth` (375 = 375): the wide tables
scroll inside their cards, and the `relative` containment from slice A's fix
is used on every new scroll wrapper.

## 5. A defect found and fixed during the live check

The decider line rendered **"1 تأیید · 0 رد"** — Latin digits inside Persian.
A bare ICU argument hands the formatter a raw JavaScript number; plurals and
`, number` localise digits, a bare `{approved}` does not. Fixed in all three
catalogues (`{approved, number}`, and the same for the sample note), confirmed
live as **"۱ تأیید · ۰ رد"**, and locked by a test that forbids a bare count
argument anywhere in `executive.oversight`.

## 6. Files

**Added:** `src/lib/executive/oversight.ts`,
`src/components/executive/FinancialOversightView.tsx`,
`src/app/[locale]/dashboard/executive/oversight/page.tsx`,
`src/lib/executive/__tests__/oversight.test.ts` (19 tests),
`src/lib/executive/__tests__/oversight-i18n-contract.test.ts`, two screenshots,
this document.

**Modified:** `ExecutiveSummaryView.tsx` (exports its shared shells instead of
having them duplicated, and links the new page), `messages/{en,fa,de}.json`
(+50 leaves each, `executive.oversight`), `german-final-gate.test.ts`
(8399 → **8449**, measured), `docs/design/phase-104/03-route-coverage.md`
(291 → **292**, the generator's own output).

No schema change, no migration, no new API route.

## 7. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` (executive sources) | 0 problems |
| `vitest` — executive suites, every i18n gate, route coverage | 34 files, 824 passed |
| Live render against the isolated database | §4 |

Two German render suites (`german-enterprise-render`, `german-operations-render`)
do not get a worker in this worktree — the known 60-second jsdom boot limit on
this machine. **Attributed, not assumed:** both were run in a clean checkout of
`main` with this slice's three catalogues copied in, and passed (5/5 and
16/16), with environment setup alone taking 46–53 s. They import nothing else
this slice touches. CI runs them.

## 8. Still open after this slice

* **Row 2** stays `PARTIAL`: receivables, payables, invoices to customers and
  reconciliation have no source. A ledger is a separate domain with its own
  schema and is not started.
* **Row 5** stays `PARTIAL`: the queue says whose decision blocks, but it is
  read-only — deciding still happens in the ERP approvals screen, which the
  page links to. The team dimension (who owns what) is not built.
* The nightly report does **not** include this page's figures yet; its
  `calcVersion` stays `exec-report-1`. Adding them is a report change with its
  own version bump.

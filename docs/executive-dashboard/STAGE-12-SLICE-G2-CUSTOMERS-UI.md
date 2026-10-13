# Executive Management Center — Slice G2: the customer pages (FA/EN/DE)

Status: **IMPLEMENTED; NOT YET MERGED; LIVE PROOF IN PROGRESS**
Date: 2026-10-13
Branch `feature/executive-slice-g2-customers-ui`, from `main` = `fb609173`
(slice G1 merged as PR #138).

Requirement row 3. G1 built the data, the API and the audit; G2 is the surface
a manager actually uses. G3 still connects the management view.

---

## 1. The pages

| Route | What it does |
| --- | --- |
| `/{locale}/dashboard/clients` | The organization's customers: search over name, legal name, email and phone; filters for status, follow-up state, owner and archived; cursor pages of 25. Each row links to the customer. |
| `/{locale}/dashboard/clients/new` | Record a customer. Only the name is required; the creator is pre-selected as follow-up owner. |
| `/{locale}/dashboard/clients/[id]` | Details, follow-up, the append-only contact log (paged), and the organization's projects for this customer with their recorded cost **per currency**. |

The list and both pagers are **server-rendered**: the filter form is a plain GET
form and the pagers are links, so searching and paging work with no client
JavaScript. Only the four write surfaces are client components — the customer
form, the contact form, the archive toggle and the project linker.

A sidebar entry (`Customers` / `مشتریان` / `Kunden`) sits in the Business group,
next to Customer Success, which is the **platform's** view of its own customers
and is left untouched.

## 2. Access, decided on the server

`resolveCustomerPageScope()` repeats the API's trust chain: signed session →
the session's active organization → an ACTIVE membership re-read now →
`view_customers`. It returns what the reader may do, and the pages render
accordingly:

| Role | Opens the pages | Creates / edits / archives | Sees linked projects | Links projects |
| --- | --- | --- | --- | --- |
| OWNER, ADMIN | yes | yes | yes | yes |
| MANAGER | yes | yes | no (needs `view_erp`) | no |
| Everyone else | no — refusal, not an empty list | | | |

A reader with several organizations and no selection gets the organization
chooser; one with none, or whose selection is stale, gets 404 — the same answer
as an organization that does not exist. **Hiding a control is a convenience: every
one of these rules is enforced again by the API**, which is what the route tests
assert.

## 3. States the pages render honestly

* **Empty** — "no customers yet" (with an invitation to create one when the
  reader may), distinct from "no customer matches these filters".
* **Refused** — the reason, in the reader's language, never an empty list.
  Project data refused for the role says so instead of showing nothing.
* **Failed** — a section that could not be read says so; it never renders as a
  successful empty one.
* **Loading** — a skeleton with the page's shape and no invented values.
* **Archived** — a banner, the edit and contact forms withdrawn, and a restore
  button. Nothing is ever deleted.

## 4. Language

`executive.customers`: **120 leaves per language**, plus the sidebar label — all
three catalogues, genuinely German (`Kundenstatus`, `Kundenname`, so no leaf is
identical to English), Persian with ی and ک and no Latin digits. German gate
8525 → **8646**, measured. `customers-i18n-contract.test.ts` derives the keys
from the page sources and the label builder, so a key a page starts using
without its sentence fails in all three languages.

Dates and times render in the **organization's reporting zone** (slice E), while
the two `datetime-local` inputs are the reader's own local time, converted to an
instant on submit — and filled only after mount, so the server and the browser
cannot disagree during hydration.

## 5. Proven on an isolated database

`hermes-exec-pg` (port 45481, `hermes_exec_test`), G1's migration applied with
`prisma migrate deploy`: **"All migrations have been successfully applied"**.

Composite foreign keys, attempted as raw SQL **around** the application, each in
a rolled-back transaction:

| Attempt | Result |
| --- | --- |
| Org A's project linked to org A's customer (control) | accepted |
| Org B's project pointed at org A's customer | **refused** — `ErpProject_organizationId_partyId_fkey` |
| An org B interaction on org A's customer | **refused** — `PartyInteraction_organizationId_partyId_fkey` |
| A blank customer name | **refused** — `Party_displayName_nonblank` |

Zero rows left behind. A cross-tenant link is impossible in the database itself,
whatever any code does.

**The UI walk-through, as an owner of ZHARFA Steel Works**

| Step | What happened |
| --- | --- |
| Open the list, signed out | redirected to sign-in |
| Open the list with two memberships and no selection | the organization chooser, not a guess |
| After choosing an organization | "This organization has no customers yet. Record the first one." |
| Create with country `IRN` | **422**; the country field says "This value is not valid" and the form says "Check the highlighted fields" |
| Create with a blank name | **422** on `displayName` |
| Create "Sepahan Steel Rolling" with contact details, an owner and a next action | **201**, and the browser opened the new customer's page |
| The detail page | every stored value is read back: email, phone, city, IR, notes, "Last contact: Never", the follow-up owner, and "Oct 15, 2026, 12:00 PM · Scheduled" |
| Record a contact | "Recorded."; the entry appears with its kind, time and who recorded it, and "Last contact" is no longer Never |
| Link "Hot Mill Modernisation" | linked; recorded cost shows **IRR 60,000,000** and **USD 1,000** on separate lines, with the note that currencies are never added together |

**Refusals, live**

| Attempt | Answer |
| --- | --- |
| `GET /api/tenant/customers` signed out | 401 |
| `POST` with no Origin, and from `https://evil.example` | 403 `ORIGIN_NOT_ALLOWED` |
| Read, edit or log a contact on **another organization's** customer | **404** every time — never 403 |
| As a VIEWER: list and create through the API | 403 `FORBIDDEN` |
| As a VIEWER: open the page | the refusal sentence; no table, no "New customer" |

Restored afterwards: the QA role back to owner, and the two probe customers
removed from the isolated database.

**Persian at phone width:** `/fa/dashboard/clients` at 375 px — RTL,
`scrollWidth == clientWidth`, Persian digits throughout (zero Latin digits in
the page text), filters and table legible.
`visual-evidence/en-desktop-customer.jpg` and `fa-mobile-customers.jpg`.

## 6. Files

**Added:** `src/app/[locale]/dashboard/clients/{page,loading}.tsx`,
`new/page.tsx`, `[id]/page.tsx`; `src/components/tenant-customers/`
(`CustomerForm`, `InteractionForm`, `ArchiveToggle`, `ProjectLinker`,
`request.ts`, `labels.ts`); `src/lib/customers/page-scope.ts`; tests
`page-scope.test.ts`, `customers-i18n-contract.test.ts`; this document.

**Modified:** `src/lib/customers/service.ts` (+`eligibleOwners`,
`linkableProjects`, both bounded and organization-scoped) and its tests,
`src/lib/navigation/app-nav.ts`, `messages/{en,fa,de}.json`,
`german-final-gate.test.ts` (8646), the Phase 104 route-coverage document
(294 → **297**), and the colour-token guard (now covering the new directories).

## 7. Validation executed

*(filled as each command completes)*

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` (customers lib, components, pages, app-nav) | 0 errors (3 pre-existing warnings in `src/lib/customers/mock-data.ts`, untouched by this slice) |
| `vitest` — customer service and routes, page scope, i18n contract, colour tokens, German gates, de-catalog, Phase 104 coverage, Phase 99 completeness | 9 files: **167 passed, 0 failed**. The first run reported the Phase 99 completeness file as failed at **72 s** against the repository's 60 s per-test limit — a known cold-filesystem effect on this machine. Re-run warm: **21/21 passed**, and the authoritative CLI (`generate-inventory.mjs --check`) reports the committed inventory matches the source tree. |
| `prisma migrate deploy` (isolated QA database) | all migrations applied, including G1's |
| Composite-key and CHECK refusals by raw SQL | §5 |
| Live UI walk-through and refusals | §5 |

Not done here: an accessibility audit (row 12), and the management-view
section (G3).

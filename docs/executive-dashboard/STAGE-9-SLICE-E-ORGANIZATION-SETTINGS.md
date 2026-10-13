# Executive Management Center — Slice E: per-organization settings

Status: **IMPLEMENTED AND PROVEN ON AN ISOLATED DATABASE, NOT YET MERGED**
Date: 2026-10-13
Branch `feature/executive-slice-e-org-settings`, stacked on slice D
(`feature/executive-slice-d-priorities`, PR #135) because all three slices
move the same pinned counts.

Requirement row 7 in `REQUIREMENTS-TRACKER.md` advances to `DONE` for its
acceptance criterion; row 8's "configurable per organization" half is closed by
the same slice.

---

## 1. What a manager sees

`/{locale}/dashboard/executive/settings`, linked from the management view and
from the priority rule set.

* **Settings in force**, with where they come from: *Set for this
  organization* or *Product defaults*, and when they last changed (in the
  organization's own zone).
* For an **owner or administrator**, a form: reporting time zone (the runtime's
  own IANA list), the hour the business day turns over, and the four priority
  thresholds. Anyone else sees the values and one sentence saying who can
  change them — no disabled form to guess at.
* A plain note that changing the zone or cutoff moves today's figures and the
  coming nightly reports, and that **reports already generated keep the zone
  they were made with** (the report row stores it).

## 2. The data

One additive table, `ExecutiveSettings`, keyed by `organizationId` (one row per
organization, `ON DELETE CASCADE`), migration
`20261012120000_executive_settings`:

| Column | Default | Database bound |
| --- | --- | --- |
| `timeZone` | — | non-blank, ≤ 64 chars; validity against the tz database is the application's |
| `dayCutoffMinutes` | 0 | 0 – 1439 |
| `approvalStaleDays` | 3 | 1 – 60 |
| `approvalCriticalDays` | 7 | 1 – 120, and **strictly greater than** `approvalStaleDays` |
| `alertAgeHours` | 4 | 0 – 168 |
| `priorityMaxItems` | 25 | 5 – 100 |
| `version` | 1 | ≥ 1 (optimistic-concurrency token) |
| `updatedAt`, `updatedBy` | | |

The bounds repeat the application's validation so a row written around the
application still cannot invert the thresholds (which would silence a priority
rule) or move the day boundary somewhere meaningless. **No row means the
product defaults, exactly as before** — applying the migration changes no
figure. Rollback: `DROP TABLE "ExecutiveSettings";`. Declared in both Phase 102
migration lists (the vitest one and the CI-only one).

## 3. Reading and writing

**Reading** (`loadExecutiveSettings`): one `findUnique` by primary key. A row
the runtime can no longer use (say, a zone a newer tz database dropped) is set
aside **as a whole** — its valid thresholds are not kept, because that would be
a combination nobody chose — and the page says so. A failed read falls back to
the defaults rather than failing the page.

**Every executive surface takes its zone and cutoff from here**: the scope
resolver loads the organization's settings, so the management view, the
oversight page, the priorities page and the archive all cut days in the
organization's zone. The priorities page takes its thresholds from here and
says whether they are the organization's or the defaults.

**The nightly worker** reads all organizations' settings in **one bounded
query** per pass (`loadExecutiveSettingsMany`, `in` + `take`) and cuts each
organization's night in its own zone and cutoff. One pass can therefore
produce reports for different business dates; the pass report counts them
(`distinctBusinessDates`).

**Writing** (`PUT /api/executive/settings`):

1. Trusted origin, else `403 ORIGIN_NOT_ALLOWED` — before the session is read.
2. JSON content type, else `415`.
3. The executive gate (session → active organization → active membership).
4. `update_org` for the member's role (owner, admin); an unknown role string
   fails closed.
5. Body bounded to the small-JSON limit (`413`), parsed **without coercion**:
   a number sent as a string is refused, not converted; `expectedVersion` is
   required.
6. One transaction: read the row, compare the version (`409 VERSION_CONFLICT`
   with the current version), create version 1 or `updateMany` **where
   organization and version match**, and write the audit event
   `executive.settings.update` with before and after **through the same
   transaction client** — a change whose audit write fails is not committed.
   Two first saves racing to create meet the primary key and the loser gets
   `409`, not `503`.

The organization is **always the server-resolved one**; the body has no field
for it. The route is registered in the Phase 99 inventory through the
`authorizeExecutiveSettingsWrite` guard token (`TENANT_MEMBER`), and the
recognition test pins the guard order.

## 4. Proven on real data

Isolated PostgreSQL container, same seed as slices A–D. Dev server pinned to it.

**Refusals without a session**

| Request | Answer |
| --- | --- |
| `PUT` from `Origin: https://evil.example` | `403 ORIGIN_NOT_ALLOWED` |
| `PUT`, same origin, no session | `401 AUTHENTICATION_REQUIRED` |
| `PUT`, form-encoded body | `415 UNSUPPORTED_MEDIA_TYPE` |
| `GET`, no session | `401` |

**Constraints bypassing the application** (raw `INSERT` in a rolled-back
transaction): a valid row accepted; cutoff 1440, cutoff −1, critical = stale,
stale 0, alert age 200 h, list of 3 and a blank zone **each refused by its
named constraint**; zero rows left behind.

**As the owner of ZHARFA Steel Works**

* Page showed *Product defaults*, Asia/Tehran, 00:00, 3 / 7 / 4 / 25.
* Saved critical = stale = 5 → `422`, and the form showed *"Must be greater
  than the number of days after which an approval is late"* on that field.
* Saved Europe/Berlin, 06:00, 2 / 5 / 1 / 30 → `200`, version 1; the page
  switched to *Set for this organization*, last changed 04:33 (Berlin).
* A write naming version 0 → `409 VERSION_CONFLICT, currentVersion 1`.
* `maxItems: "25"` → `422 NOT_AN_INTEGER`.
* A valid write carrying `organizationId` of **Quiet Plant Holdings** →
  `200`, and the database shows the change on **ZHARFA** (version 2) while
  Quiet Plant still has no row.
* Exactly **two** audit events, versions 1 and 2, the first with `before:
  null`, the second with the full before/after; the refused 409 and 422 wrote
  nothing.

**The settings take effect**

* Tomorrow's priorities: horizon *"before Oct 14, 6:00 AM · Europe/Berlin"*,
  the rule set quoting 1 h / 5 days / 2 days, and the note *"These thresholds
  were set for this organization"*. The **2-day approval** ("Overtime
  authorisation week 41"), absent in slice D under the 3-day default, now
  appears in *Act today* under rule 6.
* The management view reports *Time zone: Europe/Berlin*.
* One nightly pass at 02:49 UTC: ZHARFA (Berlin, 06:00 cutoff, still before
  its cutoff) got **2026-10-11**, window 04:00Z → 04:00Z; the two Tehran
  organizations got **2026-10-12**, window 20:30Z → 20:30Z. The 2026-10-10
  reports made earlier **kept Asia/Tehran**.

**As a viewer** (same user, role switched in the isolated database): the
settings in force are readable, the form is absent, the read-only sentence is
shown, and a `PUT` is refused `403 FORBIDDEN`.

**Persian at phone width**: RTL, the cutoff reads `۰۶:۰۰`, no Latin digit in
the panel, `scrollWidth == clientWidth` at 375 px.

Restored afterwards: role back to owner, the settings row deleted (isolated
database only).

## 5. Defects found during the live check

1. **The cutoff printed Latin `06:00` in Persian.** A padded `String()`; now
   two-digit `formatNumber` through the locale (`۰۶:۰۰`).
2. **The form's inputs were white with near-white text.** The executive
   surface used `bg-base` and `text-fg`, which **do not exist** in
   `tailwind.config.ts`; Tailwind emits nothing for an unknown colour, so
   panels merely looked transparent while form controls fell back to the
   browser's white field. Every occurrence (8 files, including the merged
   slice A/B pages) now uses the design-system tokens — `text-text-primary`
   (the same `#EDF7FA` those elements inherited, so no visible change),
   `bg-surface-primary` for inner panels, and the design-system input pair
   (`bg-surface-interactive`, `border-border-default`) for form controls.
3. **Every opacity modifier on a theme colour was dead too.** All 77 colours
   in the config are bare `var(--…)`, and Tailwind 3.4 cannot apply `/40` to a
   value it cannot parse, so it emits nothing: the compiled stylesheet carries
   `border-amber-400/40` but no `bg-signal/10` or `border-line/50`. A dead
   border colour is worse than none — measured live, it falls back to the
   default `#E5E7EB`, so **every executive table had bright grey row lines** on
   the dark interface. 32 uses (merged pages included) now use tokens that
   carry their own tint: `bg-surface-glass`, `border-border-subtle`,
   `bg-signalDim` / `border-signalDim`, `bg-status-warning-subtle` /
   `border-status-warning-border`. Measured afterwards: row separator
   `rgba(237,247,250,0.06)`, panels `rgba(12,23,32,0.78)`, the selected period
   `#0D3D32` with a `#1EC8A4` border. `visual-evidence/en-desktop-live-tokens.jpg`.

`executive-colour-tokens.test.ts` reads the Tailwind config and fails on any
executive colour utility it does not define **and** on any opacity modifier on
a config colour; both halves were proven by reintroducing `bg-base` and
`bg-signal/10` and watching it name the file.

## 6. Defects found and recorded, not fixed here

* **The nightly worker only ever reaches the first 50 organizations.** It reads
  `organization.findMany({ orderBy: id, take: 50 })` with no cursor and no
  "already reported" filter, so every pass takes the same 50 ids, while its own
  comment promises progress across thousands of tenants. Slice F.
* **A notification that was never sent is recorded as sent.** The worker takes
  the notify-once claim, then looks for an active owner; with none (observed
  live: the only owner had just been made a viewer), nothing is sent, yet the
  report row says notified and the claim is spent. Undelivered must be visible
  (row 9's acceptance). Slice F.
* **On Windows the runner prints a libuv `UV_HANDLE_CLOSING` assertion at exit**
  after a completed pass. Production runs on Linux; slice F confirms the exit
  code there.
* **Executive page titles are static English** (`noIndexMetadata("…")`) in
  every locale — the dashboard-wide pattern (20 pages under `/dashboard` use
  it, 2 use `generateMetadata`). Row 12.

## 7. Files

**Added:** migration `20261012120000_executive_settings/migration.sql`,
`src/lib/executive/settings.ts`, `src/lib/executive/settings-auth.ts`,
`src/app/api/executive/settings/route.ts`,
`src/components/executive/ExecutiveSettingsForm.tsx`,
`src/app/[locale]/dashboard/executive/settings/page.tsx`, tests
`settings.test.ts`, `settings-auth.test.ts`,
`settings-i18n-contract.test.ts`, `executive-colour-tokens.test.ts`, three
screenshots, this document.

**Modified:** `prisma/schema.prisma` (+31 lines: the model and the relation),
`contract.ts`, `scope.ts`, `summary.ts`, `report/worker.ts` (+ its tests),
the priorities page and view, `ExecutiveSummaryView.tsx` (link), the colour
fix in the other executive views and pages, `messages/{en,fa,de}.json` (+31
leaves each; German gate 8494 → **8525**), route coverage (293 → **294**),
the Phase 99 guard registry, regenerated inventory and recognition test, both
Phase 102 migration lists.

## 8. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors (after the last edit) |
| `npx eslint` (executive lib, components, pages, API) | 0 problems |
| `vitest` — executive suites + Phase 104 route coverage | 16 files, 264 passed (final run) |
| `vitest` — the above + guard recognition, Phase 99 completeness, Phase 102 migration safety, German gates, formatter hygiene | 22 files, 449 passed |
| `dashboard-nav-exposure.test.tsx` | **not run locally** — the worker cannot start for any jsdom suite in this worktree (pre-existing, forks and threads both); slice E does not touch the navigation; CI runs it |
| `npx prisma validate` | valid |
| `node scripts/security/phase99/generate-inventory.mjs --check` | committed inventory matches the source tree |
| Database constraints by raw insert | §4 |
| Live check against the isolated database | §4, §5 |

No production system was touched. The settings row, the role change and the
reports created during the check exist only in the isolated QA container.

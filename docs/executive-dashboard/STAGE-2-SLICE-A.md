# Executive Management Center — Stage 2, Slice A

Status: **IMPLEMENTED ON `origin/main`, UNCOMMITTED, NOT DEPLOYED**
Written 2026-10-10, ported and re-validated against real `main` on 2026-10-11.

**Where this version lives:** worktree `.claude/worktrees/exec-main`, detached on
`origin/main = e9961048`. This is the authoritative copy — the one that can be
committed. Nothing is committed, staged, stashed or pushed.

## 0. Why this was ported, and what the port changed

The slice was first written in `E:\hermes-os-nexuz` on branch
`feature/hris-workforce-foundation`, whose tree carried the HRIS-0.5 / ERP work
as uncommitted paths. Two facts later made that base unusable:

1. **That branch is poisoned.** Its seven commits `fc787a27..489bc872` are a
   **stale copy** of HRIS-0.5, which had already shipped on `main` as `357c5a3c`
   and is deployed. Those commits are to be discarded. They were not touched.
2. **`main` had moved** to `e9961048`, well past the `153b8617` the slice was
   written against.

The code turned out to be **100% portable**: every symbol, component, permission
and translation key it depends on is present on `main` — `getErpOverview` and
`ErpOverviewView` (with `financialsVisible`), `getActiveOrganizationContext`,
`listErpMemberships`, `ErpError` / `erpFailure`, `getAllowedSiteIds`, all three
permission axes (`view_erp`, `view_erp_compensation`, `view_industrial`),
`ErpOrganizationChooser` and `enterpriseOperations.tenantScope.chooseOrganization`.

Only the two **numeric / generated** artifacts were wrong against `main`, because
both had been computed from the stale baseline. Both were recomputed from main's
real tree:

| Artifact | Stale-branch value | Correct on `main` |
| --- | --- | --- |
| German catalogue total (`german-final-gate.test.ts`) | 8159 → 8275 | **8252 → 8368** (+116 = 115 namespace leaves + 1 nav label) |
| Phase 99 route inventory | 411 files / 569 handlers | **413 files / 573 handlers**, `TENANT_MEMBER` 195 → **196**, tenant coverage 330 → **331** |

The remaining six edits applied to main's versions unchanged. The inventory diff
on `main` is again **exactly** the one new handler, with no existing
classification altered.

### One defect the port introduced, and how it surfaced

Re-applying the catalogue total with a `re.sub` whose replacement contained a
`\1` group reference wrote two literal `0x01` bytes into
`german-final-gate.test.ts`: the escape was collapsed by the shell heredoc layer
and Python read `\1` as an octal escape. Both the oxc transformer and `tsc`
rejected it (`TS1127: Invalid character`), so it could not have shipped. Repaired
line-wise with no backreferences, and all seven touched files were then scanned
for control characters — the other six were never damaged.

---

## 1. Decisions taken, and the reasoning

The audit ended on three decisions. Rather than block, each was resolved the
conservative way — the option that is additive, reversible and reuses a reviewed
boundary. Any of the three can be revisited without rework of the others.

| # | Decision | Taken | Why |
| --- | --- | --- | --- |
| D-1 | Whose company does the manager see? | The **existing hybrid ERP gate**: platform `admin` capability → server-side active organization → org permission. Customers are reported as `NO_SOURCE` with the reason stated. | It widens no boundary. CRM and `CustomerAccount` are platform-global (`CrmOpportunity` has no `organizationId` at all), so a tenant-scoped customer figure does not exist and inventing one would be the brief's prohibited fabrication. |
| D-2 | How far does accounting go? | **Use only what exists**, label it honestly as project cost control, and state the gap on the surface. Zero schema change, zero migration. | There is no ledger entity in the 275 models. The brief explicitly warns against turning this into an unbounded ERP project, and a half-built ledger is worse than a stated gap. |
| D-3 | What happens to the simulated `/dashboard`? | **New route** at `/dashboard/executive`. The Phase 109-B0 simulation screen is byte-for-byte untouched. | That screen is a reviewed, tested artefact that deliberately discloses itself as SIMULATED. Replacing it would retire reviewed work in order to add new work. |

---

## 2. What the manager gets, and the real source of each part

Route: **`/{fa|en|de}/dashboard/executive`**, reachable from the sidebar
(*Executive Center* / *مرکز مدیریت* / *Leitungszentrale*), first entry in the
Intelligence group.

| Element | Source of truth | Status |
| --- | --- | --- |
| Decisions awaiting the manager (pending approvals, overdue tasks, low stock, open critical alerts, silent plants) | `ErpApprovalRequest`, `ErpTask`, `ErpInventoryItem`, `AssetAlert`, `IndustrialGateway` | OPERATIONAL |
| Active projects, overdue tasks, open work orders, pending approvals, items below reorder point | `getErpOverview()` on the resolved organization | OPERATIONAL |
| Tasks completed, approvals decided — **with a real period-over-period change** | `ErpTask.completedAt`, `ErpApprovalRequest.decidedAt`, counted in two windows | OPERATIONAL |
| Approved budget, recorded cost, remaining budget | `ErpProject.budget` / `.actualCost`, gated on `view_erp_compensation` | OPERATIONAL — and labelled *not accounting* |
| Per-plant connectivity, gateways online, last signal, freshness verdict | `IndustrialSite` + `IndustrialGateway.lastSeenAt` | OPERATIONAL |
| Open critical/high alerts, alerts raised in the period | `AssetAlert`, joined through the asset to the permitted sites | OPERATIONAL |
| Organization-wide telemetry recency | `TelemetryRecord.receivedAt` (server-stamped) | OPERATIONAL |
| Customers | — | **NO_SOURCE**, with the reason shown on the surface |
| Accounting / ledger / AR / AP | — | **NO_SOURCE** (see D-2) |

Every figure carries its own envelope: a one-sentence definition, the named
system of record, the window it covers (or *counted at this moment*), the data
cutoff, and a link to the records. The link is a navigation hint only — the
destination re-checks the reader's permission.

---

## 3. The three defects this design refuses to commit

These are not features; they are the failure modes the brief names, each closed
in one testable place.

**1. Absence is never health.** `SectionStatus` has five values —
`OPERATIONAL`, `EMPTY`, `FORBIDDEN`, `UNAVAILABLE`, `NO_SOURCE` — and none of
them is `0`. A plant with no gateway classifies `NEVER`, not "fresh" and not
"disconnected". A metric with no value is `null`, never coerced. A refused axis
renders its reason, never an empty panel.

**2. A percent change is not always definable.** `computeDelta` returns
`FROM_ZERO` for a zero baseline (0 → 4 is "+4 from none", not "+400%"),
`INCOMPARABLE / PARTIAL_PERIOD` when the baseline window has not finished,
`INCOMPARABLE / NO_BASELINE` when no earlier value exists, and flags a
low-baseline percentage so the UI leads with the absolute. Point-in-time counts
carry no trend at all, because the schema stores no snapshot of yesterday's open
count and a comparison would have to be fabricated.

**3. A day boundary is not `setHours(0,0,0,0)`.** Business days are cut in an
explicit IANA zone. A DST day is 23 or 25 hours and is computed as such; a
wall-clock reading that occurs twice resolves to the **earlier** instant so no
hour is counted twice; one that does not exist resolves past the gap and reports
itself as inexact.

---

## 4. Security boundaries

The gate chain is the one HRIS-0.5 established, unchanged and unwidened:

```
signed access token → live session → server-side ACTIVE organization
  → ACTIVE OrganizationMember re-read now → platform `admin` capability
```

On top of it, **three permission axes are checked independently** — `view_erp`
(operations), `view_erp_compensation` (financial) and `view_industrial` +
`getAllowedSiteIds()` (industrial). A reader holding one and not another gets
data for what they hold and a stated refusal for what they do not. A reader
holding none is refused the page (`NO_ACCESSIBLE_AXIS`).

* No `organizationId`, `siteId`, `userId` or role is read from the request. The
  resolver takes **no arguments at all**.
* An empty site allow-list **fails closed before the database** — zero
  industrial queries are issued, and it never widens to the organization.
* Alert counts carry the site predicate in the query (`asset.siteId in …`),
  double-scoped with `organizationId`, so a site id from another tenant resolves
  to nothing.
* The response is `no-store`. There is no cache layer: a cached executive figure
  must be keyed by organization, role, site set **and** range before it is safe,
  and a narrower key would serve one reader's plants to another.
* Failures never carry a driver message, a host, a stack or an internal id.
* `resolveExecutiveScope` is registered as a tenant-scope guard in the Phase 99
  classifier, and `scripts/__tests__/executive-guard-recognition.test.ts` locks
  the other half — that it really performs the five checks the registration
  vouches for. `GET /api/executive/summary` classifies `TENANT_MEMBER`, and the
  whole-tree tenant analysis stays at zero violations on all five dimensions.

---

## 5. Files

### Added (14 files, 4,203 lines)

| Path | Lines | What |
| --- | --- | --- |
| `src/lib/executive/contract.ts` | 378 | The measurement contract: section lifecycle, provenance, `computeDelta`, `classifyFreshness`. **Pure** — no I/O. |
| `src/lib/executive/period.ts` | 364 | Business-day and range resolution in an explicit IANA zone, DST-correct. **Pure**. |
| `src/lib/executive/config.ts` | 57 | Reporting zone and day cutoff from the environment, never from a request. |
| `src/lib/executive/scope.ts` | 145 | The gate chain and the three authority axes. |
| `src/lib/executive/summary.ts` | 816 | The aggregation, with per-section failure isolation. |
| `src/app/api/executive/summary/route.ts` | 74 | `GET /api/executive/summary`, `no-store`, validated range. |
| `src/app/[locale]/dashboard/executive/page.tsx` | 90 | The page. Server-rendered. |
| `src/components/executive/ExecutiveSummaryView.tsx` | 550 | The surface, three layers. Server components only. |
| `src/components/executive/ExecutiveScopeNotice.tsx` | 58 | The refusal states. |
| `src/lib/executive/__tests__/contract.test.ts` | 201 | 20 tests — delta and freshness edge cases. |
| `src/lib/executive/__tests__/period.test.ts` | 258 | 27 tests — DST gaps, repeats, 23/25-hour days. |
| `src/lib/executive/__tests__/summary.test.ts` | 614 | 29 tests — isolation, fail-closed, failure isolation. |
| `src/lib/executive/__tests__/i18n-contract.test.ts` | 191 | 15 tests — keys re-derived from source, resolved in three locales. |
| `src/app/api/executive/__tests__/summary-route-isolation.test.ts` | 407 | 20 tests — isolation **at the route**. |
| `scripts/__tests__/executive-guard-recognition.test.ts` | 139 | 14 tests — the guard registration, both halves. |

### Modified (8 files)

| Path | Change |
| --- | --- |
| `messages/en.json`, `messages/fa.json`, `messages/de.json` | +116 leaves each: the new `executive` namespace (115) plus `appShell.nav.items.executiveCenter`. Genuinely translated in all three; zero DE==EN, zero FA==EN; exact key and ICU parity. |
| `src/lib/navigation/app-nav.ts` | +1 nav item so the page is reachable. |
| `scripts/security/phase99/route-inventory.mjs` | +1 registered tenant-scope guard token, with the five checks it vouches for written out. |
| `docs/security/phase99-route-security-inventory.json` | Regenerated. Diff is **exactly** the one new handler: +1 route file, +1 handler, +1 `TENANT_MEMBER`, tenant coverage 329 → 330. No existing classification changed. |
| `src/i18n/__tests__/de-catalog.test.ts` | `executive` registered in `TRANSLATED_NS` (the zero-carryover ceiling). |
| `src/i18n/__tests__/german-final-gate.test.ts` | Catalogue total 8,159 → 8,275, with the delta recorded in the file's own convention. |

No migration. No schema change. No Prisma change. No change to any existing
route, guard, permission matrix or component.

---

## 6. Validation actually executed

Every command below was run **in the `origin/main` worktree**, after the port.
Results are reported as observed.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` (whole project) | **0 errors.** |
| `npx eslint` on the ported and modified files | **0 problems.** |
| `npx vitest run` — the 6 new suites, the whole `src/i18n/__tests__` directory, the 2 navigation suites and the 4 Phase 99 security gates | **38 files, 987 tests, 0 failures.** |
| `node scripts/security/phase99/generate-inventory.mjs --check` | **No drift** against main's tree. |

Earlier, on the stale branch, the same slice also recorded: live `GET
/api/executive/summary` with no session → **401** `{"error":"AUTHENTICATION_REQUIRED"}`
with `cache-control: no-store`; live `GET /{fa,en,de}/dashboard/executive` with no
session → **307** to `/{locale}/auth/login?from=…`; and `npm run build` → **exit 0**,
992/992 pages, with the page at 3.52 kB / 141 kB and the API at 1.25 kB. The build
has **not** been re-run on main (126 minutes on this machine); `tsc`, ESLint and
the full gate set have.

### Two defects found by these tests, not by review

1. **`instantOfWallClock` returned the wrong instant on a fall-back night.** The
   first implementation probed the offset at the naive instant and corrected
   once; on a DST repeat both probes agree, so it returned the *later* of two
   instants while reporting it as exact — attributing an hour to the wrong
   business day. `period.test.ts` fails against that implementation. Replaced
   with the bracketing algorithm (probe one day either side).
2. **The Action Center would have rendered `MISSING_MESSAGE`.** The
   `sitesWithoutData` decision item had no `metrics.*` label in any locale — the
   exact Phase 102 failure mode. `i18n-contract.test.ts` caught it because it
   re-derives the key set from the source instead of trusting the catalogue.

### Render mode — checked, not assumed

The build summary prints `● (SSG)` for `/[locale]/dashboard/executive`. That is **not** a
prerendered authenticated page, and it was verified rather than reasoned about:

* `.next/prerender-manifest.json` contains **no** entry for `/fa|/en|/de` +
  `/dashboard/executive`, and nothing in `dynamicRoutes` either;
* `.next/server/app/[locale]/dashboard/executive/` holds only `page.js` — no `.html` and
  no `.rsc` artifact.

The marker reflects `generateStaticParams` on the locale segment, which is why the
existing, reviewed `/[locale]/erp` — also `force-dynamic`, also cookie-reading — prints
`●` as well. Across the app 248 routes print `●` and 454 print `ƒ`, the `ƒ` set being
those with their own dynamic segment. `export const dynamic = "force-dynamic"` is
respected, and middleware runs ahead of any response regardless.

### One transient failure, attributed rather than retried away

On the first post-commit run, `phase99-route-inventory-completeness.test.ts`
failed — but on **time**, not on an assertion: "Test timed out in 60000ms". The
same comparison via the CLI gate
(`generate-inventory.mjs --check`) passed in the same breath, which was the first
signal that this was not a correctness failure.

It was measured rather than assumed. `renderInventory()` took **61.4 s** in plain
node at that moment; re-timed warm, three consecutive runs gave **894 / 895 /
905 ms**, and the two halves separately are 409 ms (route walk) + 477 ms (tenant
analysis). The 61 s was a cold-filesystem event on this Windows machine, right
after a 126-minute build had written a large `.next` tree. The gate then passed
21/21 with `tests 1.23s`.

No code regression: the slice adds one route to a 570-route walk.

### Environment finding, pre-existing, not caused by this work

**Every jsdom `.tsx` suite fails to start a worker on this machine** —
`Failed to start forks worker … Timeout waiting for worker to respond` — including
files this change cannot touch (`runtime-notifications.test.tsx`,
`german-operations-render.test.tsx`). Five `app-shell` suites and two `i18n`
render suites are affected. They are therefore **NOT RUN**, not passed.

Worse, vitest reported `Test Files 24 passed (24)` on the i18n directory while
two of those files never executed, surfacing only as "unhandled errors". A green
summary here does not mean every file ran. This is worth a separate look.

---

## 6b. Run against real data in an isolated environment (2026-10-11)

The slice was exercised end to end against a **throwaway PostgreSQL container**
(`hermes-exec-pg`, port 45481, database `hermes_exec_test`), seeded with
synthetic data and driven through the real sign-in form. Nothing touched the
project's own dev database or production: the dev-server wrapper refuses to
start unless `DATABASE_URL` names that container, and the project's `.env` files
were never read — the instance was given its own generated test secrets.

The seed is shaped to exercise states, not just to fill tables: three plants with
three different freshness verdicts, four alert decoys that must NOT count, a task
that is overdue **and** done, and a second organization that no reader belongs
to as an isolation control.

### What the live run proved

| State | Observed |
| --- | --- |
| Organization selection | The chooser lists only the two organizations the reader belongs to — never the control organization. |
| **Populated** | Every figure matched the seed exactly: 3 overdue (the done-but-overdue excluded), 3 pending approvals, **2** open critical alerts out of 6 alert rows (dismissed, resolved, LOW and foreign-tenant rows all excluded), 2 active projects, budget 3,370,000 / cost 1,638,900 / remaining 1,731,100. |
| **Real trend** | "Tasks completed 2, +1 (+100%), small baseline" against yesterday's 1 — and "Approvals decided 1, Unchanged" for 1 vs 1. Both computed from real rows in two windows. |
| **Point-in-time honesty** | Every non-windowed count reads "Not comparable: no earlier value is recorded" rather than inventing a trend. |
| **Freshness** | Up to date / Delayed / **Never reported** ("No gateway registered") on the three plants. Absence rendered as absence. |
| **Empty tenant** | "No records yet" on operations and finance — not zeros. |
| **Permission denied** | A VIEWER sees operations and finance refused *with their own distinct reasons* and zero figures anywhere in the payload. |
| **Two readers, one organization** | With one site granted, the VIEWER sees **1** open critical alert where the OWNER sees **2**, and one plant where the OWNER sees three. The site predicate narrows the COUNT, not merely the list. |
| **Zero baseline** | That same reader shows "Alerts raised 3 — 3 more than none", the FROM_ZERO rule rendering in production rather than "+300%". |
| **No axis at all** | `GET /api/executive/summary` → **403 `NO_ACCESSIBLE_AXIS`**; the page shows the localized refusal and no data. |
| **Trilingual** | Persian renders RTL end to end with Persian digits and Jalali dates; English LTR. Both captured at 1440x900 and at 375x812. |

### Two findings from the live run

1. **A defect in this slice, found and fixed.** An organization with no records was
   told *"this source could not be read"* by the action centre, because the code
   treated only OPERATIONAL as "answered". EMPTY is also answered — the source
   WAS read and was empty. `decisionItems` now accepts `OPERATIONAL || EMPTY`,
   while FORBIDDEN and UNAVAILABLE still refuse, so a reader who may see nothing
   is never told there is nothing to decide. Two tests lock both halves.
2. **A total database outage never reaches the section-level UNAVAILABLE state.**
   Stopping the container made the page answer "Please sign in again", because
   the session check needs the database and fails closed. That is correct
   security posture, and it means the per-section UNAVAILABLE path is proven by
   unit tests (a section's query throwing while the session is valid), not by a
   full outage.

### Not reproducible from the screenshots alone

Port 3000 is required, not incidental: `allowedOrigins()` whitelists only
`localhost:3000` / `127.0.0.1:3000` in development, so the organization chooser's
POST is refused `403 ORIGIN_NOT_ALLOWED` on any other port. Observed on :3100.

## 7. What is NOT done, and the exact reason

| Brief section | Item | Status | Blocker / reason |
| --- | --- | --- | --- |
| §11 | **FA/EN/DE screenshots of the populated dashboard** | **BLOCKED** | The page requires a platform-admin session with an active organization. Reaching it needs either (a) explicit approval to seed a local database from `prisma/seed.ts` and sign in with seeded test credentials, or (b) an authenticated session provided by the owner. I will not handle real credentials. The refusal path is verified live (307 → login, all three locales). |
| §4 | Accounting oversight (documents created/posted, AR ageing, reconciliation, accountant end-of-day) | **NOT BUILT** | No ledger entity exists. Decision D-2. The gap is stated on the surface, not hidden. |
| §5 | Customer follow-up, opportunities, risk rules | **NOT BUILT** | No tenant-scoped customer source. Decision D-1. Reported as `NO_SOURCE` with the reason shown. |
| §8 | Nightly manager report | **NOT BUILT** | Needs a new snapshot model and a worker. Every primitive is already present and reusable — `WorkerLease` + `acquireLease({name})`, `IdempotencyKey` + the transactional helper, `NotificationService` + SSE, and the DST-correct `businessDayWindow`/`businessDateKey` in this slice, which is what the report's unique key needs. This is the next slice. |
| §9 | Per-organization reporting time zone | **NOT BUILT** | No zone column in the schema. Today it is environment-level (`HERMES_EXECUTIVE_TIME_ZONE`, `HERMES_EXECUTIVE_DAY_CUTOFF_MINUTES`), and an invalid value raises a data-quality warning on the surface rather than silently cutting the day elsewhere. |
| §10 | Performance baseline (p50/p95, query budget, representative volume) | **NOT MEASURED** | No baseline harness and no representative dataset exist in the repository, so **no latency number is claimed**. The build did measure two things, and they CORRECT an earlier draft of this row: the page's own route chunk is **3.52 kB** with a **141 kB** first load, of which **102 kB is the baseline shared by every route in the app**. So the honest claim is not "zero client JavaScript" — it is that this surface contributes **no client component of its own** (the range selector and every drill-down are plain links; the only client component reachable in the tree is the organization chooser, and only on the refusal path), and that it is **32 kB lighter on first load than the existing `/dashboard`** (18 kB / 173 kB). Structurally, one request issues at most ~14 bounded, org-scoped queries with no N+1 path. |
| §10 | Caching with TTL and invalidation | **NOT BUILT** | Deliberate. A safe key needs organization + role + site set + range; until that exists, `no-store` is correct rather than slow. |
| §2 | Saved layout per manager | **NOT BUILT** | Needs a preferences store. Range selection works today via the URL. |
| §6 | Per-site telemetry recency | **DEFERRED, documented in code** | Needs `@@index([organizationId, siteId, receivedAt])` on `TelemetryRecord`. Adding an index to the telemetry table is a rollout decision (`CREATE INDEX CONCURRENTLY`), so per-site recency is reported from the gateway heartbeat — a small, server-stamped table — and the index is recorded rather than an unindexed scan shipped. |

---

## 8. Deployment and rollback

This slice is **uncommitted** and must not be deployed from this working tree:
the tree also carries 92 paths belonging to the HRIS-0.5 lane.

To ship it:

1. Create a branch from `main` and apply only the 22 paths in §5. Note that the
   HRIS-0.5 lane is now committed on `feature/hris-workforce-foundation` but is not
   yet on `main`; this slice depends on none of its code, only on `getErpOverview`,
   which predates it. If it lands on `main` first, no rebase of this slice is needed
   beyond the four shared files, where the diffs are disjoint.
2. Run the validation in §6, plus the jsdom suites on a machine where they start.
3. Open a pull request. CI runs the Phase 99 gates, the i18n gates and the build.

Rollback is a revert of that one commit. There is no migration, no schema change
and no data change, so a revert is complete — nothing persists from this slice.
Two optional environment variables are read; both have safe defaults and an
invalid value degrades to the product default **and says so on the surface**.

# Phase 109-C-UI.3 — SCADA Control Room / OT Connectivity Workspace · LOCK

**Status:** implementation complete, gates green, visual sign-off withheld.
**Branch:** `design/phase109-cui3-scada-control-room`
**Base commit:** `7edffafa414d4749331f76a1ed8a8f780c99ab17`
**SCADA_VISUAL_LOCK = NO**

This document locks what was built, what was measured, and what was deliberately
left unproven. Every number below came from a run recorded in this phase; none is
carried over from an earlier phase or estimated.

---

## 1. Phase and route

| Item | Value |
|---|---|
| Phase | 109-C-UI.3 — SCADA Control Room / OT connectivity workspace |
| Route | `/[locale]/engineering/scada-control-room` |
| Rendered locales | `/en/engineering/scada-control-room`, `/fa/…`, `/de/…` |
| Component kind | React server component, `export const dynamic = "force-dynamic"` |
| Indexing | `robots: { index: false, follow: false }` |
| Client JavaScript | none — no `"use client"`, no timer, no polling, no socket |

The route sits under the `engineering` prefix on purpose. That prefix is already
registered in `PROTECTED_PATHS` and routed to `canAccessEngineering`. A new
top-level segment that is absent from that registry is PUBLIC, and for a tenant's
plant estate that failure mode is not worth managing when it can be removed.

Authorisation happens twice. Middleware proves a platform role for the prefix;
the page then resolves its own tenant context and re-checks the organisation
permission and the site grant, because middleware proves nothing about which
organisation the reader belongs to.

| Layer | Check |
|---|---|
| Tenant | `resolveTenantContextFromServerSession` |
| Organisation permission | `can(orgRole, "view_industrial")` |
| Site grant | `getAllowedSiteIds(tenant.userId, tenant.organizationId)` |
| Engineering records | `can(orgRole, "view_engineering_project")` |

An unknown organisation role is narrowed to `null` and refused rather than
assumed harmless: the tenant resolver speaks a fifteen-value vocabulary while the
permission matrix speaks seven.

---

## 2. Trilingual surface and direction

All visible text is a catalogue lookup. There is no locale ternary anywhere on
the surface, which is the defect that shipped English into German pages in three
earlier phases.

| Locale | `lang` | `dir` | Shell title | Page `h1` |
|---|---|---|---|---|
| en | `en-GB` | `ltr` | Control room | SCADA Control Room |
| fa | `fa-IR` | `rtl` | اتاق کنترل | اتاق کنترل اسکادا |
| de | `de-DE` | `ltr` | Leitwarte | SCADA-Leitwarte |

Layout uses logical properties only (`text-start`, `ms-`, `me-`); no physical
`text-left`, `ml-`, `pl-` appears in the workspace. Persian therefore renders
right-to-left without a second code path.

ISO timestamps carry `dir="ltr"` on the `<time>` element. Inside a Persian
paragraph the bidirectional algorithm otherwise reorders an ISO instant into an
unreadable sequence; isolating the run fixes the glyph order without changing the
paragraph's direction.

Catalogue counts, measured after this phase:

| Measure | Value |
|---|---|
| Flattened leaves per catalogue (en = fa = de) | 7362 |
| `otEdge.controlRoom` leaves per catalogue | 79 |
| `engineeringHub.nav.controlRoom` | present in all three |
| German leaf pin in `german-final-gate.test.ts` | 7362, stated twice |
| German values identical to English on this surface | 0 |
| Persian values identical to English on this surface | 0 |
| Arabic YEH / KAF in the Persian block | 0 |

---

## 3. Honesty contract

The surface never invents a value. Where the platform holds no data, the screen
says so in words rather than rendering an empty panel that reads as "all clear".

| Rule | Implementation |
|---|---|
| Connectivity is derived, never read from a column | `deriveConnectivity` uses `lastSeenAt`, `revokedAt` and the freshness windows |
| Stored status is labelled as reported, not live | rendered as "Reported online" and its translations |
| Absent data is named | `PRODUCTION_LINES`, `LIVE_ALARM_EVENTS`, `LIVE_PLC_DIAGNOSTICS` each render a `DATA_UNAVAILABLE` panel with a reason |
| Alarms are definitions | ordered most-severe-first, never shown as firing; the platform has no evaluator |
| Capped panels say they are capped | `alarmsTruncated`, `protocolsTruncated` |
| Withheld panels say why | `engineeringNotPermitted` |
| Every value carries provenance | source, uncertainty and observed-at on each reading |
| No credential reaches the view | `apiKeyId` and `metadata` are absent from the gateway projection |

Connectivity states are exactly `CONNECTED`, `DEGRADED`, `NOT_CONNECTED`,
`UNKNOWN`. A site rollup takes the worst state; an empty rollup is `UNKNOWN`,
never `CONNECTED`.

---

## 4. Implementation manifest

Digests are the first sixteen hex characters of the SHA-256 of the file as
committed on this branch.

### New files

| Digest | Lines | Path |
|---|---|---|
| `57aec61d96e6104b` | 142 | `src/app/[locale]/engineering/scada-control-room/page.tsx` |
| `b189056f25730905` | 352 | `src/components/scada-control-room/ControlRoomWorkspace.tsx` |
| `5aa1f4742f8a1438` | 55 | `src/components/scada-control-room/ConnectivityBadge.tsx` |
| `07b172064495cf9a` | 42 | `src/components/scada-control-room/AccessRefusal.tsx` |
| `db11eaf1faf73a32` | 388 | `src/lib/scada-control-room/contract.ts` |
| `b6b6c16a0313a1f5` | 279 | `src/lib/scada-control-room/view.ts` |
| `4fae81ae145eea2d` | 175 | `src/lib/scada-control-room/__tests__/phase109cui3-contract.test.ts` |
| `827bc5829f4a3972` | 250 | `src/lib/scada-control-room/__tests__/phase109cui3-view-isolation.test.ts` |
| `1caf85e36e72cde4` | 371 | `src/lib/scada-control-room/__tests__/phase109cui3-route-and-surface.test.ts` |

### Modified files

| Digest | Lines | Path | Change |
|---|---|---|---|
| `26d4ffc35e1630fe` | 194 | `src/components/engineering/Sidebar.tsx` | one navigation entry plus its icon |
| `3dca400eb0ef565b` | 70 | `src/components/engineering/TopBar.tsx` | one title-map entry so the shell heading names this page |
| `1855eadd57c096dc` | 582 | `src/i18n/__tests__/german-final-gate.test.ts` | leaf pin moved to 7362, stated twice |
| `43297472ab6f7a7f` | 9742 | `messages/en.json` | `otEdge.controlRoom` plus one navigation leaf |
| `c5ab9d3bef8cdf52` | 9742 | `messages/fa.json` | same keys, Persian values |
| `7ee3ac885ce8f9a2` | 9742 | `messages/de.json` | same keys, German values |
| `f3c06e4dcdd216ef` | 177 | `docs/design/phase-104/03-route-coverage.md` | three derived counts re-measured |

Seventeen paths in total, including this document.

---

## 5. Preservation manifest

The following were verified untouched by this phase. The count is the number of
working-tree entries reported for that path.

| Area | Entries changed |
|---|---|
| `docs/design/live-operations` | 0 |
| `docs/design/industrial-brain` | 0 |
| `docs/design/automation-studio` | 0 |
| `src/lib/industrial` | 0 |
| `src/components/dashboard` | 0 |
| `src/components/industrial-brain` | 0 |
| `src/components/automation-studio` | 0 |
| `prisma` | 0 |
| `src/middleware.ts` | 0 |
| `src/components/app-shell` | 0 |
| `deploy` | 0 |
| `docker-compose.yml` | 0 |
| `package.json`, `package-lock.json` | 0 |
| `scripts` | 0 |

No migration was added. No dependency was added or upgraded. No route-protection
registry and no middleware matcher was edited — the route inherits protection
from a prefix that already had it.

Branch pointers at lock time:

| Ref | SHA |
|---|---|
| This branch, base | `7edffafa` |
| `origin/main` | `51e0e4c8` |
| Live Operations branch `design/phase109-cui2-live-operations` | `87b3c07f`, untouched |

---

## 6. Measured results

Every figure below is from a run on a machine with no development server, no
build and no competing test process.

### Full suite

Command: the repository's `test` script with file parallelism disabled and one
worker.

| Measure | Value |
|---|---|
| Exit code | 0 |
| Test files | 499 passed, 9 skipped, 0 failed (508) |
| Tests | 12234 passed, 145 skipped, 0 failed (12379) |
| Unhandled errors | 0 |
| Duration | 447.44 s |

### Scoped suites and gates

| Gate | Exit | Result |
|---|---|---|
| SCADA suites (`src/lib/scada-control-room`) | 0 | 3 files, 121 passed, 0 failed |
| i18n suites (`src/i18n`, serial) | 0 | 26 files, 658 passed, 0 failed |
| TypeScript, no emit | 0 | zero diagnostics |
| Lint | 0 | zero errors, zero warnings |
| Production build | 0 | 976 static pages |
| Whitespace diff check | 0 | clean |
| Route inventory, check mode | 0 | zero unclassified routes |

The build manifest contains 660 route rows: 281 under `/[locale]` and 376 under
`/api`. The control room appears for all three locales:

```
● /[locale]/engineering/scada-control-room   1.17 kB   104 kB
    /fa/engineering/scada-control-room
    /en/engineering/scada-control-room
    /de/engineering/scada-control-room
```

### Repeat run of the previously slow file

| Run | Exit | Result | Duration |
|---|---|---|---|
| 1 | 0 | 24 passed, 0 failed | 29.32 s |
| 2 | 0 | 24 passed, 0 failed | 28.85 s |

---

## 7. The earlier timeout, and why it is not counted as a pass

An earlier run of the full suite reported failures in `phase100-closure-eval` and
four other files. Those were **not** assertion failures. Every one carried the
same two signatures:

```
Error: [vitest-pool]: Failed to start forks worker for test files …
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

The cause was contention: that run executed in parallel while a development
server and a production build were running and roughly nineteen unrelated Node
processes held memory. Workers could not be spawned inside the pool's response
window, so files timed out or never started at all.

Two things were done about it, and neither was to call the run green:

1. The suite was re-run serially on a free machine. It passed with exit code 0.
2. The slow file was then run twice on its own. Both runs finished in under
   thirty seconds against a sixty-second budget, so the timeout did not recur.

Because the timeout did not reproduce, **no harness change and no test change was
made**. No SCADA source file was touched to make any gate pass.

One related observation is recorded rather than hidden, because it recurred after
the first re-run. Two jsdom render files, `german-enterprise-render` and
`german-operations-render`, intermittently fail to spawn a worker and are
reported as unhandled errors rather than as failing tests. This was seen twice:
once in a parallel i18n run, and once in a serial i18n run started immediately
after a typecheck and a lint on the same machine. In both cases the reported
totals were 24 files and 637 tests with the remaining two files never starting.

The two files were then run on their own on a quiet machine: 2 files, 21 tests,
exit 0. That restores exactly the 26 files and 658 tests recorded in section 6,
which is also what the green full suite produced with no unhandled errors at all.

The conclusion is that these two files are sensitive to machine load at worker
startup, not that they are broken. No incomplete run is counted as a pass, and no
test, configuration or source file was changed to hide the effect. A future phase
may want to give the pool a longer startup budget; that is a harness change and
does not belong in a SCADA scope.

### Skipped tests

Nine test files are skipped in full, and their test counts sum to 122. A further
23 individual tests are skipped inside three media files, giving the 145 total.
None is related to the SCADA Control Room, and every one is gated on an
environment that is absent here rather than on a failure.

| File | Tests | Gate |
|---|---|---|
| `scripts/__tests__/phase931-backup-verify-regression.test.ts` | 10 | POSIX shell required |
| `scripts/__tests__/phase932-backup-verifier-pipefail.test.ts` | 3 | POSIX shell required |
| `src/lib/ai-governance/__tests__/hallucination.live.test.ts` | 8 | live evaluation flag and API key |
| `src/lib/ot-edge/__tests__/openbao-approle-least-privilege.live.test.ts` | 7 | live credential plane address and token |
| `src/lib/ot-edge/__tests__/openbao-approle-token-provider.live.test.ts` | 1 | same |
| `src/lib/ot-edge/__tests__/openbao-secret-manager.live.test.ts` | 1 | same |
| `src/lib/ot-edge/__tests__/ot-persistence.integration.test.ts` | 10 | integration database URL |
| `src/lib/ot-edge/persistence/__tests__/adapters.integration.test.ts` | 24 | integration database URL |
| `src/lib/ot-edge/services/__tests__/services.integration.test.ts` | 58 | integration database URL |

Files matching `*.pg.test.ts` are excluded by configuration and did not run in
this suite at all; they belong to the separate PostgreSQL configuration.

---

## 8. Mutation evidence

The first version of the route-and-surface suite was proved inadequate before it
was trusted. Three defects were injected into the surface and the suite stayed
green at 63 of 63, because each assertion matched a doc comment or an import line
rather than the code that does the work.

| Control | Injected defect | Verdict against the current suite |
|---|---|---|
| M9 | organisation permission swapped for a different predicate | CAUGHT |
| M10 | site grant replaced by an organisation-wide read | CAUGHT |
| M11 | every logical-alignment class stripped from the workspace | CAUGHT |
| M12 | alarm ordering reversed so the cap drops the severe rows | CAUGHT |
| M13 | engineering permission gate removed | CAUGHT |
| M14 | truncation flag pinned false | CAUGHT |
| M15 | permission argument dropped at the call site | CAUGHT |
| M16 | alarm code column re-headed with the section heading | CAUGHT |

Eight of eight caught. File digests before and after the battery were identical,
so the restore was byte-exact.

---

## 9. Honest limitations

**Screenshots are incomplete.** The rendered surface was inspected on a
disposable database in all three locales at desktop and mobile widths. Structure,
direction, translation, scroll containment and target size were read from the
live document and from the server-rendered markup, and those readings are
reliable. Several screenshots, however, returned partially painted frames because
the browser window was not in the foreground while the page was being captured. A
partially painted frame is not visual evidence.

For that reason **SCADA_VISUAL_LOCK = NO**. Visual approval is not claimed, and
the owner's own review of the rendered page is still outstanding.

**Two headings.** The page renders an `h1` and the engineering shell renders its
own. This matches the sibling pages under the same shell and was left as-is
rather than changed unilaterally.

**The engineering permission has no effect today.** `view_engineering_project`
and `view_industrial` currently hold identical role sets, so no reader's access
changes. The gate exists so that the page follows the matrix on the day the two
diverge, which is what the matrix separates them for.

**A rehearsal volume remains.** The rehearsal used a disposable PostgreSQL 16
container on a non-default port with a uniquely named volume. The container was
removed. Its volume, named `hermes-109cui3-vol`, is still present and is
deliberately being kept: it must not be deleted without a separate, explicit
instruction from the owner. It holds only synthetic rehearsal fixtures and no
tenant data.

---

## 10. Change control

1. This document and the manifest in section 4 describe the locked state. Any
   later change to a listed file must update the corresponding digest here in the
   same commit.
2. The scope of this phase is the SCADA Control Room route, the engineering
   navigation entry that reaches it, the catalogue keys it renders, and its own
   tests. Work outside that scope belongs to another phase and must not ride
   along in a commit on this branch.
3. Adding a catalogue key to this surface requires the German leaf pin to move in
   lockstep, in both places it is stated, with the new count measured rather than
   assumed.
4. A new assertion about this surface must fail when the protection it describes
   is removed. An assertion that survives removal of its own subject is not
   evidence and must not be added.
5. No migration and no dependency may be introduced on this branch without a
   separate approval.
6. Skipped, timed-out and flaky results are never recorded as passes. The run
   that produced a number must be named alongside it.

---

## 11. Delivery state

| Action | State |
|---|---|
| Committed on `design/phase109-cui3-scada-control-room` | yes |
| Pushed to `origin` on the same branch | yes |
| Merged | **no** |
| Deployed | **no** |
| `origin/main` modified | **no** — it remains `51e0e4c8` |
| Rebased, cherry-picked or force-pushed | **no** |
| Other branches touched | **no** |
| Rehearsal volume removed | **no**, by instruction |

Merge and deployment are explicitly out of scope for this phase and were not
performed. The branch is offered for review only.

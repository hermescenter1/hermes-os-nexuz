# Hermes Industrial Brain — Dashboard Alignment — Visual Lock Record

```text
PHASE=HERMES INDUSTRIAL BRAIN — DASHBOARD ALIGNMENT
ROUTE=/[locale]/industrial-brain
LOCALES=fa / en / de
INDUSTRIAL_BRAIN_VISUAL_LOCK=YES
OWNER_VISUAL_APPROVAL=PASS_WITH_ONE_REFINEMENT (refinement applied and approved)
INDUSTRIAL_BRAIN_STATUS=DESIGN_LOCKED
INDUSTRIAL_BRAIN_LOCK_BASE_SHA=0f4d83e61ca6725800c549d11800306a9d9c5f30
LOCKED_ON=2026-09-05
LOCKED_BY=OWNER
BRANCH=design/industrial-brain-dashboard-alignment
BASELINE=6cd12af3db4c2559d2059b164600b4de70fe973f (= origin/main at branch time)
PAGE07_LOCK_IS_ANCESTOR=NO
PR=NOT_PERFORMED · MERGE=NOT_PERFORMED · DEPLOY=NOT_PERFORMED
```

## The seven implementation files

Everything the locked design consists of, and nothing else:

| # | File |
|---|---|
| 1 | `src/app/[locale]/industrial-brain/page.tsx` |
| 2 | `src/components/industrial-brain/IndustrialBrainWorkspace.tsx` |
| 3 | `src/components/industrial-brain/ReferenceDiagnosticPanel.tsx` |
| 4 | `messages/en.json` |
| 5 | `messages/fa.json` |
| 6 | `messages/de.json` |
| 7 | `src/i18n/__tests__/german-final-gate.test.ts` |

File 7 carries no design: it is the pinned whole-catalogue tally, moved
`7147 -> 7158` because files 4–6 gained eleven leaves. Files 4–6 add keys and
change no existing translation's meaning.

## What this record locks

| Aspect | Locked state |
|---|---|
| Shell | `PublicPageShell noAmbient`. The route stays PUBLIC and is not moved onto AppShell. |
| Container | `max-w-[1600px]`, gutters `px-6 lg:px-8` |
| Grid | Twelve columns from `xl`: workspace `xl:col-span-8 2xl:col-span-9`, context rail `xl:col-span-4 2xl:col-span-3`. DOM order is workspace → rail → reference. |
| Header | One compact band: eyebrow, h1, subtitle, advisory tagline, two in-page anchors, demoted marketing links, and a measured provenance card. No hero block. |
| Provenance | Engine version, corpus checksum (16), systems/nodes/edges — all derived from `bridgeFingerprint()` at render time. No constant may be presented as liveness. |
| Capability rail | The six capabilities as a numbered workflow rail with a connecting spine, sticky from `xl` (`xl:sticky xl:top-24`) |
| Local navigation | Sticky section rail at `top-16`, `z-20`, real `<a href="#…">` anchors, `scroll-mt-32`. Result anchors render only when a result exists. |
| Result order | decision summary → primary hypothesis → reasoning map → alternative hypotheses → evidence and uncertainty → risk → human validation gate → safe verification path → report |
| Primary hypothesis | Rank 1 promoted into its own dominant panel; the ranked list keeps ranks 2+ |
| Reasoning map | Row 1 `lg:grid-cols-3` Evidence → Cause → Risk with logical `border-s`/`ps` stage rules; Row 2 full-width Action nodes at `lg:grid-cols-2`. No orphan connector. |
| Human gate | `reference.validation.heading` + `checklist.warning` as a standalone band BEFORE any recommendation |
| Typography floor | No content below 11px on this route. 11px metadata, 12px labels, 13px prose, 14px+ body. |
| Contrast | No `text-slate-500` / `text-slate-600` foreground on this route |
| Palette | Navy canvas, ice-blue/cyan intelligence, violet reasoning, amber caution, red critical, emerald healthy — the estate's shipped accents, unchanged |
| Decoration | One ambient glow, one dot grid. No pulsing dots, no window-chrome dots, no animation, no observers. |
| Print | The form card and the rail are `print:hidden`; `.ib-report-print` and the reference panel print. |

## Preservation manifest — measured, not asserted

| | Result |
|---|---|
| PRESERVE-01 `PublicPageShell noAmbient` | PASS |
| PRESERVE-02 metadata / canonical | PASS |
| PRESERVE-03 trilingual behaviour | PASS |
| PRESERVE-04 seventeen form controls, names and validation attributes | **IDENTICAL** 17 → 17, order-independent comparison |
| PRESERVE-05 three sample scenarios | **BYTE-IDENTICAL** block |
| PRESERVE-06 analyze API contract | PASS (17/17 anchors) |
| PRESERVE-07 `can(user?.role, "authoring")` save gate | PASS — anonymous SSR payload carries `canSaveCase:false` |
| PRESERVE-08 copy summary / copy full / print | PASS |
| PRESERVE-09 `ReferenceDiagnosticPanel` executes the corpus | PASS (12/12 anchors) |
| PRESERVE-10 `?case=` fail-closed | PASS — unknown id and repeated parameter render one identical message, no result blocks |
| PRESERVE-11 evidence, citations, provenance | PASS |
| PRESERVE-12 human validation before actions | PASS |
| Result panels | 16/16 still rendered |
| `ReferenceDiagnosticPanel` diff | typography/contrast ONLY — re-applying that transform to the previous file reproduces the new one byte for byte |
| Reasoning-map data and logic (R1) | UNCHANGED — data sources, translation keys, field selection, colour maps, enum echoes, map count and the absence of any filter/slice all compare equal |

## Validation

Run against the locked tree.

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | no output |
| `npm run lint` | 0 | 0 errors, 123 warnings repo-wide |
| `npx vitest run` — 25 surface/contract/Phase-104/i18n files | see note | 1026 passed, 2 timed out under two-worker contention |
| `npx vitest run --maxWorkers=1` — those same 2 scanner files | 0 | 2 files / 172 passed |
| `npx vitest run --pool=forks --maxWorkers=1` — 4 accessibility/estate files, individually | 0 each | 7 + 38 + 46 + 27 = 118 passed |
| `node scripts/design/phase104-route-inventory.mjs --check` | 0 | 280/280, 0 unclassified |
| `git diff --check` | 0 | no output |
| `npm run build` | 0 | 973/973 static pages, route emitted for fa/en/de |

The two failures in the 25-file batch were `Test timed out in 60000ms` on two
whole-repository source scanners — `phase104-signature-contract` and
`cross-module-journeys`. Both are green in isolation in 16 seconds. Recorded as
environment contention, not as passes obtained by weakening anything.

The single lint warning inside these files — `'isFa' is defined but never used`
in `ReportHeader` — is pre-existing: the parameter is unused on the baseline
commit too, and this stage deliberately did not touch it.

## Responsive evidence

`overflow` is `document.documentElement.scrollWidth - clientWidth`, measured
live in the page.

| Viewport | Workspace | Rail | Overflow | Note |
|---|---|---|---|---|
| 1920×1080 | 1144px | 360px | 0 | workspace card top y=499 |
| 1600×900 | 1133px | 356px | 0 | workspace card top y=499 |
| 1440×900 | 897px | 432px | 0 | card y=547, examples y=724 — both above the fold |
| 1280×800 | 790px | 379px | 0 | card y=546 |
| 768×1024 | 705px | stacked | 0 | single column, DOM order workspace → rail → reference |
| 390×844 | 342px | stacked | 0 | zero interactive controls under 44px |

Wide content scrolls inside its own `overflow-x-auto` container; the page body
never scrolls horizontally at any tested width.

Sticky clearance, measured at the moment of capture after clicking the local
navigation: section `scroll-margin-top` 128px against a sticky rail whose
bottom sits at 122px — **+6px**, on both `#ib-reasoning` and `#ib-actions`.

Accessibility, measured: one `<h1>`; outline h1 → h2 → h3 → h4; 29 interactive
controls with a minimum height of 44px and none below; every one carrying
`ds-focus`; zero elements below 11px inside the route's content.

## RTL evidence

Persian renders with `dir="rtl"` at 1440 and 390 with `overflow=0` at both. The
provenance values, the corpus identifiers and the reference panel's node ids
stay left-to-right inside explicit `dir="ltr"` elements. The reasoning map
mirrors correctly — Evidence first at the inline start, then Cause, then Risk —
because the stage rules use logical `border-s`/`ps` and the chevrons carry
`rtl:-scale-x-100`. German was measured at 1440 and 390 with zero overflow and
zero clipped headings, paragraphs or list items.

## R1 screenshot manifest

Captured from the local development server on this tree with headless
Chrome 152 over CDP. Full resolution, one file per view.

| File | Locale | Viewport | Rendered px | SHA256 |
|---|---|---|---|---|
| `R1-01-en-1440-reasoning-map.png` | en | 1440×1500 | 920×1071 | `c7611795d052541f9553b26263383ba6abf3ae10e6c488411152945d2d75d3f7` |
| `R1-02-fa-1440-reasoning-map.png` | fa | 1440×1500 | 920×1297 | `d2ee78cdaddced7b1c966d7fe08f7f3c7395d9ee8e3054468fa2f7592779f9fc` |
| `R1-03-en-390-workspace.png` | en | 390×844 | 366×2696 | `a0fe8fe243a85b25643101a76bfe105995570f32f01c7b04f94c28f50cd53d03` |
| `R1-04-en-390-reasoning-map.png` | en | 390×844 | 366×2071 | `e98cf1f76a487651b15302461a047054dbb24db630f7411ecc2a860cf3a89506` |
| `R1-05-fa-390-reasoning-map.png` | fa | 390×844 | 366×2210 | `2bc733beb3faa371da956aa81a3a82565adf310713f59241bcd4c3a90f193063` |
| `R1-06-en-390-gate-safe-actions.png` | en | 390×844 | 366×3686 | `b728f41c9d39ea10f4d0b478c1609d9c055992ff344ab53726417325b16eb8dd` |

Every capture reported `scrollWidth == clientWidth` and `overflow = 0`. Images
1, 2, 4, 5 and 6 were taken with a real analysis rendered. The images are
review evidence and are not committed to the repository.

Two capture-time notes, recorded so the images are not over-read:

1. The first-visit cookie banner was hidden with `display:none` immediately
   before each exposure. Nothing was clicked and no consent state was written.
2. The browser profile was fresh, so the captures show the ANONYMOUS branch of
   the report actions — "Sign in to save as an engineering case", not the
   active save control.

## Accepted note — the Next.js "N" badge

A small circled **N** appears at the left edge of several captures. That is the
Next.js development-tools indicator injected by `next dev`. It is a
**development overlay, not production UI**: it is not part of this design, not
produced by any file in the manifest above, and is absent from `next build`
output. It is recorded here so a future reader does not mistake it for a
locked element or try to remove it from the route.

## Scope boundary

This lock covers **`/[locale]/industrial-brain` only**.

- No other route, shell, layout or shared component is covered or altered.
- `src/app/globals.css`, `tailwind.config.ts`, `src/components/ds/*`,
  `src/components/app-shell/*`, `src/components/dashboard*/*`, Prisma,
  middleware and deployment are untouched by this stage.
- The Phase 104 signature and token contracts are unaffected: this route
  declares none of the pinned custom properties.
- Nine catalogue keys retired from display — `industrialBrain.status.*` and
  `industrialBrain.workspace.online` — remain in all three catalogues on
  purpose. Six German extraction gates assert their German values; deleting
  them would break gates unrelated to this route.

## Page 07 relationship — stated, not resolved

```text
PAGE07_LOCK_COMMIT=94390cb6255e2e19c5e220e3647d6bccffca9d53
PAGE07_LOCKED_SHA=9c93acf9655ae933684f9fefe8bde426156febc0
PAGE07_LOCK_IS_ANCESTOR=NO
MERGE_BASE_WITH_PAGE07_LOCK=b0138d4b812157c84777b08781facc8cebcd4eef
PAGE07_FILES_MODIFIED_BY_THIS_STAGE=0
```

The Page 07 workflow-detail lock lives on `claude/hermes-automation-design-handoff-f50e62`,
which has not been merged to `main`. This stage branched from live `origin/main`
and therefore does not carry it. **This is reported, not resolved.** No merge,
rebase, cherry-pick or ancestry repair was performed, and none should be
inferred from this record.

The three files that lock names — the automation workflow page module, its
client surface and the scoped `.hermes-ops-navy` block in `globals.css` — were
verified blob-identical to this branch's baseline before and after every commit
in this stage.

## Change control

A locked page is not frozen forever, but it stops being a design decision an
implementer can make alone. Any change to the characteristics in the tables
above requires **explicit owner authorization** and a new entry in this record.
Behavioural, security, tenancy, i18n-correctness and accessibility fixes are
**not** gated by this lock.

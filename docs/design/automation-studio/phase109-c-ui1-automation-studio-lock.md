# Hermes Automation Engineering Studio — TIA + SCADA/HMI Workspace — Visual Lock Record

```text
PHASE=109-C-UI.1 (design/UX stage; rounds R0 -> R1 -> R2)
ROUTE=/[locale]/engineering/studio
LOCALES=fa / en / de
AUTOMATION_STUDIO_VISUAL_LOCK=YES
R2_FINAL_REVIEW=PASS
OWNER_VISUAL_APPROVAL=PASS (after two independent Codex review rounds)
AUTOMATION_STUDIO_STATUS=DESIGN_LOCKED
LOCKED_ON=2026-09-07
LOCKED_BY=OWNER
BRANCH=design/phase109-automation-studio-tia-scada-workspace
BASELINE=cfc6d89841f9a72ed74762aa6834f199475d9341 (= origin/main at branch time)
AUTOMATION_STUDIO_LOCK_BASE_SHA=<this commit>
EVIDENCE_ARCHIVE=PHASE109-C-UI1-R2-CODEX-REVIEW.zip
EVIDENCE_ARCHIVE_SHA256=bf12a1920a603fcb0ef3f7de54640e23f01e3fcf7473360fee3663f2fb10973e
PAGE07_LOCK_IS_ANCESTOR=NO
PR=NOT_PERFORMED · MERGE=NOT_PERFORMED · PUSH=NOT_PERFORMED · DEPLOY=NOT_PERFORMED
```

`AUTOMATION_STUDIO_LOCK_BASE_SHA` is the commit that carries this file. A commit
cannot contain its own hash, so it is recorded in the commit message and in the
delivery report rather than substituted here.

## The fifteen implementation files

Everything the locked design consists of, and nothing else.

| # | File | Role |
|---|---|---|
| 1 | `src/components/automation-studio/StudioWorkspace.tsx` | the workspace: command header, layout, inspector drawer, companion |
| 2 | `src/components/automation-studio/ArtifactSurface.tsx` | **new** — the central pane for artifacts with no textual source |
| 3 | `src/components/automation-studio/SourceView.tsx` | source pane; now always renders its tab panel |
| 4 | `src/components/automation-studio/Inspector.tsx` | properties / cross-reference / diagnostics / AI review |
| 5 | `src/components/automation-studio/OutputPanel.tsx` | problems / validation / references / **changes** / tests / output |
| 6 | `src/components/automation-studio/ProjectExplorer.tsx` | artifact kind announced as text |
| 7 | `src/lib/automation-studio/artifact-dossier.ts` | **new** — the allowlisted artifact projection and label maps |
| 8 | `src/lib/automation-studio/index.ts` | module surface |
| 9 | `src/components/automation-studio/__tests__/phase109cui1-workspace-surfaces.test.tsx` | **new** — 49 behavioural assertions |
| 10 | `src/lib/automation-studio/__tests__/phase109cui1-artifact-dossier.test.ts` | **new** — the projection contract |
| 11 | `messages/en.json` | |
| 12 | `messages/fa.json` | |
| 13 | `messages/de.json` | |
| 14 | `src/i18n/__tests__/german-final-gate.test.ts` | pinned whole-catalogue tally, `7237 -> 7282` |
| 15 | `src/lib/tia-companion/__tests__/phase109c2-c1-policy-unchanged.test.ts` | the C2.0 byte lock over C1's source, re-pinned |

Files 11–13 add keys and change no existing translation's meaning. File 14
carries no design: it is the tally, moved because 11–13 gained forty-five leaves
across the three rounds.

**File 15 is the one path outside this stage's own directories.** It lives in the
`tia-companion` tree and was edited under explicit owner authorisation in R1 §7
and again in R2. It is not a C2.1 file: the C2.1 lane
(`src/lib/tia-archive-ingest/**`, branch
`feature/phase109-c21-secure-archive-ingestion` at
`c3173f7d4320e3e9ae86c0e5a08a9e3ec49ae3af`) was never checked out and is
untouched.

```text
C1_LOCKED_FILE_COUNT=31
C1_LOCKED_DIGEST=a064dd381083c40228ce7c09bbd70a6acb2f1cb2f584afd857daacecf7fccb13
```

## What this record locks

| Aspect | Locked state |
|---|---|
| Shell | The engineering shell. The route stays authenticated; authorization is `src/middleware.ts` only, and the page adds no guard of its own. |
| Generation | `●` prerendered for all three locales. The page is a pure function of committed constants — no cookie, header, database or environment read. |
| Command header | Eyebrow, title, project · site, then an instrument cluster of five facts — target, working version, workspace mode, validation, save state — each a label above a value with a rule between. Then the disclosure strip. |
| Disclosure | Simulation workspace · no live controller · no download · data classification · engineering authority. Stated in text, in every locale, on every render. |
| Explorer | ARIA `tree` with roving tabindex; folders derived from artifact paths; artifact kind announced as text, not by glyph alone; modified and severity badges carry words. |
| Central surface | Switches on **whether the artifact has textual source**, never on discipline. Source → editor with line numbers and diagnostics gutter. No source → the artifact dossier. |
| Artifact dossier | Kind, identity, provenance and disclosure, declared symbols, bindings / alarms / reads / writes with line and source context, findings, and the tests covering the symbols it touches. **Nothing else.** |
| Inspector | Four tabs. Below `xl` an overlay **drawer** on the logical end edge (`absolute inset-y-0 end-0`, opaque, bordered, shadowed); at `xl` the same inline column (`xl:static`). The centre's width does not move when it opens. |
| Inspector keyboard flow | Opening moves focus to the drawer's close control; Escape from the focused descendant closes it; focus returns to the exact opener. None of this happens for the inline column. |
| Output panel | Six tabs. `changes` renders every version with approval state, author, summary and changed artifacts, plus what this session edited. |
| Symbols surface | Text search plus scope, data type and problems-only filters, all wired to `querySymbols`; data types derived from the project. |
| Companion | Phone and small tablet mount the companion; the desktop branch is **absent from the DOM**, not hidden. Order: overview → artifacts → problems → symbol lookup. Read-only: zero textarea, zero contenteditable, no save control. 44 px minimum hit area. |
| Direction | Chrome follows the locale. SCL, paths, checksums, symbol names, version labels and adapter identifiers are `dir="ltr"` **per value**, never by forcing a whole container. |
| Vocabulary | No raw union member is ever visible: artifact kind, reference access and data origin all resolve through the catalogue. The classification `SIMULATED` remains on screen as a **code** beside its localised label, the way a diagnostic code sits beside its message. |
| Media queries | The Studio consults **exactly one** — the `lg` branch query. Drawer-vs-column is asked of the DOM, never of a second query. |
| Decoration | No animation, no canvas, no observer, no polling, no new dependency. |

## Preservation manifest — measured, not asserted

All 28 behaviours the stage was required to preserve, verified against source and
tests. Full table in the evidence archive's `PRESERVATION-MANIFEST.md`.

| | Result |
|---|---|
| PRESERVE-01 authenticated, fail-closed route | PASS — no file under `middleware`/`auth` touched |
| PRESERVE-02 three real locales, `lang`/`dir` | PASS — 247 leaves, exact 3-way parity |
| PRESERVE-03 Persian RTL; code and identifiers LTR | PASS — measured per cell |
| PRESERVE-04 simulation-only disclosure | PASS — `SIMULATED` / `none` on all 40 cells |
| PRESERVE-05 no PLC, SCADA, TIA or OT connection | PASS — `liveConnection` is the literal `null` by type |
| PRESERVE-06 no fetch, polling, telemetry, provider call | PASS — the fetch-rejecting test still passes |
| PRESERVE-07 no persistence | PASS |
| PRESERVE-08 local edits, undo, redo, local save | PASS — `edit-state.ts` unmodified |
| PRESERVE-09 validation and revalidation | PASS — `validation.ts` unmodified |
| PRESERVE-10 symbol search | PASS, and extended with the filters the engine already had |
| PRESERVE-11 reads / writes / bindings / alarms | PASS in the inspector; on the dossier the rows perform *Inspect symbol*, which is what they can honestly do |
| PRESERVE-12 tree and keyboard navigation | PASS, extended to the inspector drawer |
| PRESERVE-13 command palette | PASS — `CommandPalette.tsx` unmodified |
| PRESERVE-14 seeded diagnostics, stable AES codes | PASS — `demo-project.ts` and `contract.ts` unmodified |
| PRESERVE-15 provenance, version, approval state | PASS, and now rendered |
| PRESERVE-16 no compile / download / online / force control | PASS — asserted over every control label in three locales |
| PRESERVE-17 AI advisory, engineer approval, no change applied | PASS — stated on every render |
| No-fabrication boundary | **STRUCTURAL** — the dossier projects an allowlisted copy; an artifact carrying `currentValue` / `activeAlarms` / `lastReading` / `isOnline` is fed to the builder and none survives |

## Validation

Run against the locked tree, sequentially, with nothing else competing.

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | no output |
| `npm run lint` | 0 | 0 errors; 24 warnings repo-wide, none in this stage's paths |
| Studio suites (`--pool=threads --maxWorkers=2`) | 0 | 11 files / **335 passed** |
| `src/i18n` suites | 0 | 26 files / 658 passed |
| C2.0 lock, isolated (`--maxWorkers=1`) | 0 | **15 / 15** |
| `npm test -- --maxWorkers=2` | 0 | 503 files / **11,917 passed, 0 failed**, 145 skipped |
| `npm run build` | 0 | `●` prerendered, 23.6 kB / 138 kB, fa + en + de |
| `git diff --check` | 0 | no output |
| `node scripts/design/phase104-route-inventory.mjs` | 0 | 280 routes |

Every red run across the three rounds, with its cause, is recorded in the
evidence archive's `TEST-EVIDENCE.txt`. None was converted into a pass.

## Responsive and accessibility evidence

40 measured cells across 8 viewports and 3 locales, plus 2 resize cells.
`scrollWidth == clientWidth` on **all 40**; console errors **0**.

| Width | Mounted and painted |
|---|---|
| 1920 / 1600 / 1440 / 1280 | workspace + explorer + inspector (inline) |
| 1024 | workspace + explorer; the inspector is one press away as a drawer |
| 768 / 390 / 320 | companion only — the desktop branch absent from the DOM |

The drawer costs the centre **0 px**, measured in both directions:

| Cell | Centre before | Centre after | Delta | Inspector box |
|---|---|---|---|---|
| `after-en-1024x768-inspectorOpen` | 544 px | 544 px | **0** | w=288, x=736 (end edge) |
| `after-fa-1024x768-inspectorOpen` | 544 px | 544 px | **0** | w=288, x=0 (mirrored) |

Keyboard, measured in a real browser: `ok:focus-in-drawer` and
`ok:focus-restored-to-opener` in EN and FA at 1024 px; `ok:row-focused` on the
companion in EN and FA. `aria-expanded` follows the width with no press at all —
`false → true → false` in both locales — while `data-inspector-open` stays
`auto`.

## Accepted note — the Next.js "N" badge

The circled **N** in the captures is the Next.js development-tools indicator
injected by `next dev`. It is a **development overlay, not production UI**: it is
absent from `next build` output and is produced by no file in the manifest above.
It is recorded per cell in the evidence manifest as `devOverlayPresent` so a
future reader does not mistake it for a locked element.

## Scope boundary

This lock covers **`/[locale]/engineering/studio` only**.

- No other route, shell, layout or shared component is covered or altered.
- `src/app/globals.css`, `tailwind.config.ts`, `src/components/ds/*`,
  `src/components/app-shell/*`, the dashboard, the Industrial Brain, the Alarm
  Center, `src/app/api/*`, Prisma, middleware, `package.json`,
  `package-lock.json` and deployment are untouched by this stage.
- No dependency was added. The Monaco decision stands: `MONACO_DEPENDENCY_DECISION
  = DEFERRED`, because the platform CSP sets `worker-src 'none'`.
- Catalogue leaves retired from display are **not** deleted; six German
  extraction gates assert their values.

## Page 07 relationship — stated, not resolved

```text
PAGE07_LOCK_COMMIT=94390cb6255e2e19c5e220e3647d6bccffca9d53
PAGE07_LOCKED_SHA=9c93acf9655ae933684f9fefe8bde426156febc0
PAGE07_LOCK_IS_ANCESTOR=NO
MERGE_BASE_WITH_PAGE07_LOCK=b0138d4b812157c84777b08781facc8cebcd4eef
PAGE07_FILES_MODIFIED_BY_THIS_STAGE=0
```

The Page 07 workflow-detail lock lives on
`claude/hermes-automation-design-handoff-f50e62`, which has not been merged to
`main`. This stage branched from live `origin/main` and therefore does not carry
it. **This is reported, not resolved** — the ancestry is unrelated to this route
and remains unresolved. No merge, rebase, cherry-pick or ancestry repair was
performed in any round, and none should be inferred from this record.

## Change control

A locked page is not frozen forever, but it stops being a design decision an
implementer can make alone. Any change to the characteristics in the tables above
requires **explicit owner authorization** and a new entry in this record.

Two further rules are specific to this route:

1. **The C2.0 byte lock is part of the contract.** Any edit under
   `src/lib/automation-studio`, `src/components/automation-studio` or
   `src/app/[locale]/engineering/studio` moves
   `phase109c2-c1-policy-unchanged.test.ts`. Re-pin it in the same commit, with
   the reason written down, and never by weakening an assertion. The origin
   policy that file guards — `PERMITTED_ORIGINS_ROUND_1` admitting exactly
   `simulated` and `authored` — is not re-pinnable and must not change here.
2. **The no-fabrication boundary is structural, not editorial.** A new field on
   `EngineeringArtifact` does not reach this route until it is added deliberately
   to `ArtifactProjection` and to `project()`. Widening that projection is a
   product decision about what the Studio claims to know, and needs owner
   authorization like any other locked characteristic.

Behavioural, security, tenancy, i18n-correctness and accessibility fixes are
**not** gated by this lock.

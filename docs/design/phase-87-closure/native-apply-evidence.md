# PHASE 87 — Native Figma Apply: execution evidence & fidelity audit

> Records the successful **native, local, Starter-compatible** productionization
> of the Phase 87 design foundation into the Figma file **"Hermes OS – Design
> System"** (`ahckSQbXwY4NVY3uxEZtLg`) via the local *Hermes Design System
> Builder* plugin. This supersedes the `BLOCKED_BY_FIGMA_WRITE_ACCESS` status in
> [`README.md §0/§7`](README.md): native Variables/Styles/Components **were**
> created — locally, on the free Starter plan, through the official Figma Plugin
> API — with the two plan-gated capabilities explicitly deferred (below).

## 0. ✅ FINAL RESULT — repaired Apply SUCCEEDED (owner-run, 2026-07-30)

After the repair (§4″), the owner ran the repaired bundle (dist sha
`0fff3ca023f06ca3`):

- **Repair Apply completed successfully — zero reported errors.** The 36
  assemblies were materialised via in-place orphan adoption (ids preserved),
  no duplicate frames.
- **Verify: 173 / 173 assets present, no drift.**
- **Final idempotency Dry Run: `create 0 · update 0 · skip 173 · prune 0`** —
  per kind: variables 46, collections 4, paint styles 29, text styles 8, effect
  styles 4, component sets 44 (352 native variants), assemblies 36, sections 2,
  all **skip**. Rerunning never duplicates.

**Top-level frame count — correct breakdown (do NOT call all of them unmanaged
references):** the file now has **70 top-level frames = 34 original reference
frames + 36 generated managed assemblies**.

- The **34 original** reference frames are **unmanaged** (carry no `hermesDSB`
  marker), **byte/node-preserved, never touched** by the plugin.
- The **36 generated assemblies** are **MANAGED** plugin assets (tagged, tracked
  in the manifest/index, present-and-no-drift in Verify). They are reference
  *assemblies built from native instances* — **not** unmanaged reference frames.

The plugin's Verify output reflects this split: `originalReferenceFramesPreserved`
counts only the 34 unmanaged originals; `managedAssembliesPresent` counts the 36
managed assemblies separately.

## 1. Execution evidence (owner-run, 2026-07-30)

Plugin source: `tools/figma/hermes-design-system-builder/` · immutable commit
**`8d49c4481388813a4bd6ff6624b3616e0ae568cf`** (pushed to
`agent/phase87-premium-visual-foundation`, Draft PR #23).

**Initial Dry Run** — 135 create · 0 update · 0 skip · 0 prune
(4 collections, 46 variables, 29 paint styles, 8 text styles, 4 effect styles,
43 component sets, 126 component variants, 1 managed section).

**Apply** — success · `runId: run-ms7q88mf-1` · created 135 · updated 0 ·
skipped 0 · no reported errors.

**Verify** — all assets present · no drift · **135 / 135** · all **34** unmanaged
top-level reference frames preserved.

**Second Dry Run (idempotency)** — 0 create · 0 update · **135 skip** · 0 prune.
Rerunning the plugin never duplicates. Rollback was not invoked.

**Font fallbacks reported at Apply** (honest, non-silent):
`Estedad Bold → Inter Bold` · `Estedad Semi Bold → Inter Bold` ·
`Vazirmatn Semi Bold → Vazirmatn Regular`. See §5.

## 2. Status: local native productionization = SUCCESSFUL (with explicit limits)

✅ **Native, local, Starter-compatible** creation of semantic color Variables +
collections; spacing/radius/sizing Variables; local Paint/Text/Effect Styles;
23 primitive + 13 core + 7 industrial Component Sets with Variants + Component
Properties + Auto Layout; deterministic, idempotent, rollback-safe; the 34
original reference frames preserved (unmanaged), the 36 generated assemblies
managed. This is a **real** result, not a scaffold-as-frames workaround.

**Explicitly NOT complete — `DEFERRED_REQUIRES_FIGMA_PROFESSIONAL` (do not claim):**
- **Multiple variable modes** (light/dark, per-locale FA/EN/DE). Starter = 1 mode
  per collection; `addMode()` throws `Limited to 1 modes only`.
- **Publishing a shared Team Library.** Libraries are paid-only on Figma.

These remain deferred; the foundation ships as single-mode local assets.

## 3. Fidelity audit — native assets vs. code, token-contract & references

Compared the generated Component Sets against `src/components/ds/*.tsx`,
`src/components/ds/token-contract.ts`, and the six approved reference
experiences (`README.md §2`: Homepage/Platform/Login/Copilot/Dashboard/
IndustrialBrain, each Desktop/Mobile × EN/FA).

**Foundation (variables/styles): production-grade.** Colors are bound 1:1 to the
token contract (paint styles bound to color variables); spacing/radius/sizing
variables and E1–E4 effect styles match `globals.css` exactly. No drift.

**Components (revision 1, as applied): FOUNDATION SCAFFOLDS — NOT production
fidelity.** This is stated plainly and must not be reported otherwise. Each of
the 43 families was generated as a real but minimal token-bound Component Set
(a labelled auto-layout frame + a variant chip, tone-coloured fills, variant
axis, TEXT/RTL property *definitions*, a native annotation). Systematic gaps vs.
the React components:

| Dimension | rev-1 scaffold | Production target (ds/ + references) | Gap |
|---|---|---|---|
| Anatomy | title label + variant chip | per-family structure (Button: label+icon+states; Input: field+label+border; StatusIndicator: dot+label; Alert: icon+title+message+dismiss; KpiCard: label+value+trend; DataTable: header+rows; …) | **large** |
| State | variant value shown as text only | real visual states (hover/focus/disabled/checked fills, borders) | **large** |
| Spacing | fixed 16/12 padding | token-driven per-component (control-x/y, card, panel) | medium |
| Typography | Title/S on label only | per-element type ramp | medium |
| Auto Layout | vertical hug only | horizontal/vertical, fill/hug, alignment | medium |
| Component props | TEXT/RTL **definitions only** | bound to layers (properties drive content) | **large** |
| Accessibility | description + 1 annotation | per-element contrast pairing, focus, label assoc. | medium |
| Token exercise | fills only | radius/spacing variables + effect styles wired in | medium |
| Reference assembly | isolated stubs | composed into the 6 reference experiences | **large** |

**CONFIRMED_FIDELITY_GAPS = YES.** The scaffolds are a correct, safe *foundation*
for native productionization but are **not** production-ready components, so
runtime surface implementation (Phase 87 continuation §C) remains **gated** and
is not started.

## 4″. Apply run `run-ms7vkx9n-1` — "Applied with issues" + repair (assembly rev 2)

**Owner-run execution evidence (the FINAL revision's first Apply):**

- Reported: **38 created · 51 updated · 84 skipped**, status **"Applied with issues"**.
- Repeated error on the reference assemblies:
  `set_characters: Property "characters" failed validation: Required value missing`.

**ROOT CAUSE.** The tri-lingual rewrite made each assembly heading a
**pre-localized string** (`locale-strings.js`), but the executor still read a
locale off it — `t.characters = asm.locale === 'fa' ? item.heading.fa :
item.heading.en` (old `figma-exec.js`). `("…string…").fa` is `undefined`, and
Figma rejects `TextNode.characters = undefined`. The throw happened INSIDE
`upsertAssembly`, AFTER `figma.createFrame()`/`appendChild` but BEFORE `tag()`,
and was caught per-assembly in `run()` — so each of the 36 assemblies left an
**un-tagged, partial, unmanaged** frame in the managed section. (The reported
"38 created / 51 updated" are the *planned* counts; in reality only the 2
non-assembly creates — the assemblies section + the Icon family — and the 51
component/text-style updates were actually tagged. Components were unaffected:
their text path always passed real strings.)

**CURRENT PARTIAL-STATE IMPLICATIONS.**

- Managed + correct: 43 component sets (updated, origin run preserved), 8 text
  styles (updated), Icon family + assemblies section (created under
  `run-ms7vkx9n-1`), all foundation (untouched). The 34 original reference
  frames are untouched.
- NOT managed: the 36 assemblies — physical partial frames exist in the
  assemblies section but carry **no `hermesDSB` marker**, so they are invisible
  to the plan/verify/rollback (they look like user content).
- `run-ms7vkx9n-1` is recorded as a **partial historical run** owning exactly 2
  managed assets (assemblies section + Icon family).

**REPAIR STRATEGY (no rollback, no re-apply of the defective bundle).**

1. **Fix the executor**: headings now assign the pre-localized string directly
   through a defensive `setChars()` that throws a structured error on any
   non-string / empty / whitespace value (never stringifies `undefined`, never
   substitutes placeholder text). Instance text props get the same contract.
2. **Fail-closed preflight** (`validate.js` → `validateAssemblyText`): runs
   during Dry Run AND at the start of Apply **before a runId is generated or any
   Figma API is called**. It re-derives every string for all 36 assemblies and
   rejects undefined/null/non-string/empty/whitespace/missing-key, identifying
   *assembly key · experience · locale · viewport · text role · source catalog
   key*. Proven by a stubbed-Figma test: on invalid text, **zero** create/
   update/set/load calls occur and no runId is produced.
3. **Repair in place via orphan adoption**: `assembly` revision bumped 1→2, so
   the 36 assemblies re-plan; because they were never tagged they plan as
   **create**, and the executor adopts the single exact-name unmanaged frame in
   the section (clearing its partial children and rebuilding into the SAME node
   — **id preserved**), then tags it. Two same-name matches ⇒ fail closed. No
   duplicate frames are produced.

**EXPECTED REPAIR DRY RUN (vs the current partial state):**
**`create 36 · update 0 · skip 137 · prune 0`** (total 173). It is *create*, not
*update*, precisely because the failed run never tagged the assemblies — the
marker index does not contain them — yet the executor materialises those 36
"creates" as **in-place adoptions** of the existing partial frames, so nothing
duplicates. The 137 skips are every already-correct managed asset (foundation +
43 components + 8 text styles + Icon + both sections).

**Rollback isolation of the repair run**: the 36 repaired assemblies are tagged
with the repair runId; `rollback(repairRun)` removes only those 36 and can never
touch earlier runs' assets (components/text/foundation stay under
`run-ms7q88mf-1`; section+Icon stay under `run-ms7vkx9n-1`). No transactional
restore of pre-update content is claimed — recovery is forward (rerun) only.

**⛔ DO NOT roll back or re-apply the defective bundle** (dist sha
`18ef2107e762e0ff`). Apply only the repaired bundle (this build). Rolling back
would delete good managed assets; re-applying the old bundle would re-throw and
create more orphan frames.

## 4′. FINAL production-fidelity revision (supersedes §4 below — built + validated, NOT yet applied)

Per the owner's decision, the intermediate revision 2 was **not** committed or
applied; all confirmed fidelity gaps were folded into ONE final Starter-
compatible revision (`REVISIONS = { component: 3, textStyle: 2, assembly: 1 }`).

**What FINAL delivers (all local, all Starter-supported):**

- **44 component sets / 352 variant components** — full anatomy blueprints
  (child-layer hierarchy with semantic role names), token-bound fills/strokes/
  radius/spacing/typography, production Auto Layout, min-width/height + 40px
  touch targets, interaction states (Default/Hover/Focus/Active/Disabled/
  Loading where applicable), data states (Error/Empty/Loading for DataTable,
  MetricCard, TimelineEventRow; Offline for IndustrialSignalTile), TEXT/
  BOOLEAN properties **bound to layers** (`componentPropertyReferences`),
  INSTANCE_SWAP icon slots (new geometric `Icon` utility family = the 44th),
  Direction=LTR/RTL variant axes on row-anatomy families (mirrored ordering +
  right-aligned text), long-FA/DE text wrapping (fixed-width, auto-height),
  per-family accessibility contracts written into descriptions + native
  annotations. Renames completed safely on the SAME managed assets:
  KpiCard→MetricCard, TopNav→TopNavigation, Timeline→TimelineEventRow.
- **36 managed native reference assemblies (TRI-LINGUAL — FA/EN/DE)** in a
  second managed section ("Hermes DS · Native Reference Assemblies"): the six
  approved experiences × Desktop/Mobile × **EN/FA/DE**, built ONLY from
  component instances (+ headings), never flattened. FA versions are RTL
  (reversed rows, RTL instance variants, right-aligned text); EN/DE are LTR;
  real widths (1200/390). **German is first-class, not deferred**: every DE
  string is copied VERBATIM from the repository catalogs (`messages/de.json`)
  via a snapshot module whose values are test-asserted byte-for-byte against
  the catalogs — never invented copy. The one catalog key whose German value is
  currently an English carryover in the repo itself (`copilot.title`) is used
  as-is and explicitly flagged. Long German compounds ("Werksdashboard",
  "Maßnahmenpfade", the long Copilot placeholder) are exercised and a
  longest-unbreakable-word width heuristic is test-enforced per style/context;
  mobile assemblies never use Display/XL. Locale switching covers FA↔EN↔DE
  (LanguageSelector Locale axis + per-locale assemblies). The 24 EN/FA
  assemblies record their original reference node ids; **the 12 DE assemblies
  have no Figma original — they are clearly marked `· generated` / 
  `newlyGenerated`** and derive purely from the approved component system +
  repo translations. The Apply report + on-canvas manifest store the mapping
  original ref → assembly node → instances used. The 34 original **unmanaged**
  reference frames are never touched; the 36 assemblies are **managed** and are
  counted separately from the originals (see §0 — 70 top-level frames total).
- **Fail-closed safety**: Apply is blocked BEFORE any mutation on (a) duplicate
  managed markers (ownership ambiguity) and (b) missing canonical fonts unless
  the owner explicitly ticks the documented-fallback checkbox
  (see [`font-installation-manifest.md`](font-installation-manifest.md)).
- **Transactional limitation (documented + tested):** Figma has no
  transactions. An interrupted Apply leaves per-asset state that **converges on
  rerun** (finished assets skip, stale ones update — proven by the
  partial-upgrade recovery test); `Rollback(runId)` removes only assets FIRST
  created by that run. Pre-update content of already-existing assets is not
  snapshot-restored — recovery is forward (rerun), not backward.

**Expected managed-update Dry Run vs the applied rev-1 file:**

| Action | Count | Which assets |
|---|---:|---|
| create | **38** | assemblies section (1) + 36 tri-lingual assemblies + Icon family (1) |
| update | **51** | 43 component sets (rev 3) + 8 text styles (rev 2) |
| skip | **84** | 4 collections + 46 variables + 29 paint + 4 effect + section 1 |
| prune | **0** | renames kept their asset keys — nothing orphaned |

(Total 173 assets. Family descriptions state the FA·EN·DE localization
contract; per-locale visible strings live in the assemblies.)

**Validation:** `tsc --checkJs` OK · Vitest **83/83** (anatomy/property/token/
Auto-Layout/RTL contracts; 36 tri-lingual assembly contracts incl. verbatim
catalog assertion + DE compound-overflow heuristic + locale-switch coverage;
ownership-ambiguity, partial-upgrade recovery, rollback run-isolation, rerun
idempotency, font gate, zero-network + zero-secret scans, manifest/build
consistency) · bundle `node --check` OK.

## 4. [SUPERSEDED] Revision 2 (intermediate — never committed, never applied)

Because gaps are confirmed, the local plugin source was enhanced (only the
plugin; no repo/runtime changes). Deterministic revision markers
(`REVISIONS = { component: 2, textStyle: 2 }`, `constants.js`) are woven into the
component-set and text-style content hashes so the uplift rolls out as a
**surgical UPDATE** of exactly the managed assets that changed — never a
duplicate, never touching foundation or reference frames.

**Revision 2 enhancements (real, incremental — NOT full production parity):**
- component anatomy: a header row (state **dot** + title) + a state label, per
  variant, replacing the bare scaffold label;
- token-driven control spacing (`--space-control-x/-y`), `--radius-md`;
- Card variants bind the **E1–E3 elevation effect styles**;
- typography via the Title/S + Caption text styles;
- font **weight-name aliasing** in resolution (see §5).

**Managed-update Dry Run (vs. the applied rev-1 file) — enumerated & explained:**

| Action | Count | Which assets | Why |
|---|---:|---|---|
| create | **0** | — | every managed asset already exists |
| update | **51** | 43 component sets + 8 text styles | their `rev` marker changed the hash |
| skip | **84** | 4 collections + 46 variables + 29 paint + 4 effect + 1 section | foundation payloads unchanged |
| prune | **0** | — | no managed asset was removed from the spec |

**Rollback ownership & run isolation across revisions (proven in tests):** every
managed asset keeps its **first-creation** run id; an upgrade that only UPDATES
re-attributes nothing to itself, so `rollback(upgradeRunId)` removes nothing and
`rollback(originRunId)` / all-managed removes everything. Component-set rebuilds
read and preserve the origin run before recreating.

**Validation:** `tsc --checkJs` OK · Vitest **24/24** (adds mutation / idempotent-
upgrade / surgical-update / run-isolation tests) · `node --check` on the bundle
OK · adversarial review (1 defect found — Card-elevation branch keyed on the
wrong id — **fixed** & re-validated). The executor rendering is validated by
type-check + tests + review only; its in-Figma result must be confirmed by the
owner's next Dry Run → Apply → Verify.

**STOP:** the owner is NOT asked to Apply revision 2 until they have reviewed the
enumerated plan above (green tests, proven rollback). The revision-2 source is
currently **uncommitted** in the worktree pending the owner's decision.

## 5. Font finding decision (no blind typography change, no untrusted install)

Repo fonts are self-hosted **variable** woff2 (`weight: "100 900"`) via
`next/font/local` in `src/app/[locale]/layout.tsx`:
`src/fonts/Estedad.woff2`, `Vazirmatn.woff2`, `Inter.woff2`.

- **Are the weights genuinely unavailable?** In the owner's **Figma environment**,
  yes: Estedad is not installed at all (all weights fell to Inter) and Vazirmatn
  is present only in Regular (Semi Bold fell back). This is a *Figma font
  availability* gap, not a design gap.
- **Do repo assets contain suitable weights?** Yes — Estedad/Vazirmatn are
  variable (100–900), covering Bold/Semi Bold. But they are **woff2 (web)**,
  which Figma does not consume for its local font list; Figma needs OS-installed
  **desktop** fonts (TTF/OTF).
- **Should the Figma file use different canonical weights?** No — the ramp
  weights are canonically correct. One real sub-cause is addressed safely in the
  plugin: **weight-name aliasing** now tries `Semi Bold` ↔ `SemiBold` ↔ `600`
  (etc.) before downgrading, so a weight that IS installed under an alternate
  style name resolves instead of falling back. Name-alias hits are reported
  separately from real substitutions — typography drift is never silent.
- **Is a separate safe font installation required?** Yes, and it is an **owner**
  action: install the official OFL **desktop** builds of Estedad and Vazirmatn
  (matching the versions already vendored as woff2) so Figma resolves the real
  weights. The agent does **not** install fonts. After installation, a re-Apply
  updates the 8 text styles to the correct fonts and clears the fallbacks.

**Decision:** keep canonical typography; ship font-name aliasing (safe, no
install); recommend the owner install the two desktop font families; never
accept silent drift (fallbacks are reported at every Apply).

## 6. Next owner action

1. Review the revision-2 managed-update plan (§4). Decide whether to commit the
   revision-2 source to PR #23.
2. (Optional, recommended) install official Estedad + Vazirmatn **desktop** fonts.
3. In Figma Desktop (edit-access session): run the plugin → **Dry Run** (expect
   `0 create / 51 update / 84 skip / 0 prune`) → **Apply** → **Verify**.
4. Runtime surface implementation (public shell, login, dashboard shell,
   Industrial Brain) stays **gated** until the relevant component families reach
   production fidelity across future gated revisions.

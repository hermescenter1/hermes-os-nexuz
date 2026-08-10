# Hermes Phase 102 Media Hub Builder — local Figma plugin

A local, auditable Figma **development** plugin that generates the complete
**Phase 102 "Hermes Media & Video Hub"** design — natively, on the free
**Starter** plan, with **no network access** and **nothing leaving the file**.

- File: **Hermes OS — Phase 102 Media & Video Hub**
- File key: `bbnzt84t6A95I0GqtmKekH`
- Runs entirely inside **Figma Desktop → Plugins → Development**.
- Not published to Community. No telemetry. No secrets.

This is the same architecture and build approach as
`tools/figma/hermes-design-system-builder` (the proven Phase 87 route): a
dependency-free bundler, pure/testable spec+plan logic separated from the
handful of `figma.*` calls, shared-plugin-data markers for idempotency, and a
Dry Run / Apply / Verify / Rollback UI. It does **not** reuse that plugin's
code (separate file, separate manifest) — it mirrors its proven pattern.

---

## Why a plugin, and not the Figma MCP

The Hermes Figma account is on the **Starter plan** and has a very small
**global MCP tool-call quota (~8 calls)**, after which every Figma MCP tool —
including reads — fails. A design system this size (≈300 native assets) is
not deliverable through 8 tool calls. A native plugin run by the owner inside
Figma is **quota-free**.

---

## What it creates (native, local) — exactly 3 pages

Figma Starter caps a file at **3 pages total**. The plugin manages exactly:

| Page | Contents |
|---|---:|
| **01 Foundations** | 4 variable collections (Colors/Spacing/Radius/Sizing, 1 mode each), 49 colour variables + 49 bound paint styles (transcribed verbatim from `src/app/globals.css`), 8 text styles, 5 effect styles (Elevation E1–E4 + a `Glass/Overlay` BACKGROUND_BLUR+shadow pair), and 5 on-canvas documentation specimens (colour swatch grid, type ramp, spacing scale, radius scale, elevation/glass strip). |
| **02 Components** | 23 component sets (22 media-domain families + a shared `Icon` utility), ~151 variant components total. |
| **03 Screens** | 54 responsive screen frames — 6 screen types × 3 breakpoints (Desktop 1440 / Tablet 768 / Mobile 390) × 3 locales (FA/EN/DE). |

If the file already has a default page (e.g. "Page 1"), the plugin **renames
it** to become `01 Foundations` instead of creating a 4th page — see
"Starter-plan honesty" below.

### Foundations page

Colour variables/paint styles for every `--color-*` token currently in
`src/app/globals.css` (background/surface/brand/text/border/status incl. the
"-subtle"/"-border" badge-fill pairs/reasoning/focus — 49 total), the
`--space-*` and `--radius-*` scales, a derived type ramp, and effect styles
for Elevation E1–E4 **and** the requested glass elevation (`Glass/Overlay`:
`BACKGROUND_BLUR` 14px + a soft drop shadow, transcribed from the `.ds-glass`
CSS rule). A small "Sizing" collection (border/focus-ring/touch-target
values) is included for consistency with the app's `ds/*.tsx` components;
where globals.css has no literal `--size-*` custom property, the token is
honestly labelled as a documented convention rather than a fabricated CSS
binding (see `src/lib/tokens.js` `SIZE_TOKENS`).

### Components page (22 media families + Icon)

video card, video hero, player control bar (timeline, buffering, error,
ended states), playlist/chapter navigation, transcript panel, subtitle
toggle, search field, filter chip, category chip, progress indicator,
instructor profile card, related content card, favourite button,
continue-watching row, analytics card, upload workflow step, editorial
workflow badge (**Draft/Submitted/InReview/Published/Rejected/Archived — the
exact 6-state transition table from `docs/phase102/architecture.md` §11, each
a real variant**), moderation review card, empty state, error state, loading
state, dialog (confirm/destructive/info) — plus the shared `Icon` utility used
as the `INSTANCE_SWAP` default for every icon slot.

**Focus is a real variant value** (not decoration) on every interactive
family — see `src/lib/components.js`.

### Screens page (54 frames)

video library, video detail/watch, search results, instructor profile,
continue watching / favourites, upload + editorial workflow — each at
Desktop/Tablet/Mobile and in FA (RTL) / EN (LTR) / DE (LTR). FA frames
genuinely mirror: horizontal groups reverse their child order and headings
right-align (`src/lib/screens.js`, same convention as the Phase 87 plugin's
`assemblies.js`).

### The player-timeline RTL rule (read this before reviewing the FA frames)

Time always flows left-to-right, even inside an RTL layout. The player's seek
bar and the watch-progress meters are **locked LTR**: `src/lib/rtl.js`
defines `PROTECTED_LTR_ROLES` (`Timeline`, `Track`, `Fill`, `Playhead`,
`TimeElapsed`, `TimeRemaining`, `Meter`, `DurationBadge`, …). During RTL
mirroring, any subtree rooted at one of these role names is left **completely
untouched** — not reordered, not right-aligned — while everything around it
(the transport controls row, titles, labels) mirrors normally. The whole
protected block can still move to the other side of its parent row (that's
correct — the block mirrors, its internal time-flow does not). This is
enforced identically in the pure test suite (`computeMirrorPlan`, no Figma
needed) and in the real Figma renderer (`figma-exec.js` `mirrorRtl`), off the
exact same `rtl.js` source of truth.

---

## Starter-plan honesty

Verified against the empirical limits in the task brief and official Figma
documentation:

**Supported on Starter (all created natively):** local variables &
collections; local paint/text/effect styles (incl. `BACKGROUND_BLUR`); a
single default variable mode per collection; components, component sets &
variants; component properties; auto layout; sections; variable→paint-style
binding; **up to 3 pages**.

**Deferred — `DEFERRED_REQUIRES_FIGMA_PROFESSIONAL` (never faked):**

- **Multiple variable modes** (e.g. light/dark, per-breakpoint or per-locale
  modes) — `collection.addMode()` throws `"Limited to 1 modes only"` on
  Starter. This plugin uses **separate variable collections** instead of
  modes wherever an axis was needed (it never needed one in practice — the
  Foundations page has 4 single-mode collections).
- **A 4th page** — `figma.createPage()` throws `"The Starter plan only comes
  with 3 pages"` on the 4th. `src/lib/pages.js` plans page creation/rename so
  the file NEVER exceeds 3, and fails the whole plan closed (before any
  mutation) rather than silently dropping a page if it ever would.
- **Team library publication** — paid-only; not attempted.

> **File-edit access is separate from plan tier.** The Figma Desktop session
> must be signed in as a user with **"can edit"** access to the file — a
> viewer seat cannot run a write plugin at all.

---

## Controls

| Control | Effect |
|---|---|
| **Stage** selector | `All` / `1. Foundations` / `2. Components` / `3. Screens` — Apply and Dry Run operate on ONE stage at a time. |
| **Dry Run** | Computes the plan for the selected stage against the live file and reports it (create/update/skip counts, text-validation result, page plan). **Writes nothing.** |
| **Apply Stage** | Executes the plan for the selected stage. Creates/updates only changed assets; skips unchanged (preserving node IDs). |
| **Verify** | Confirms every planned asset exists (across all 3 pages) and its recorded content hash matches; reports missing/drifted assets and page presence. |
| **Rollback** | Deletes assets this plugin created (optionally scoped to one `runId`). Never touches unmanaged content, and never deletes/renames the 3 pages themselves. |

### Incremental, resumable, idempotent by design

- **Staged apply.** A single "Apply All" click is fragile inside Figma for a
  build this size. Instead, run `1. Foundations` → `2. Components` →
  `3. Screens` (or use `All` for convenience) — each stage is independently
  safe to re-run. If a stage is interrupted partway through, just click
  **Apply Stage** again: per-asset content hashes converge (finished assets
  skip, unfinished/changed ones create or update) — nothing is duplicated.
- **Screens reference Components.** If you run the `Screens` stage before
  `Components` has ever been applied, the affected instances are skipped with
  a clear `unresolved` list in the result (never a crash) — run `Components`
  first.
- **Idempotency key:** every managed asset carries a stable `assetKey` +
  content hash in the `hermesP102` shared-plugin-data namespace. A rerun
  reconciles by key (create/update/**skip**) and never duplicates.
- **Fail-closed before mutation:** invalid/empty text anywhere on the Screens
  page, a page plan that would exceed the Starter 3-page cap, or ambiguous
  ownership (two nodes claiming the same managed asset) all block Apply
  *before* a single `figma.create*`/`figma.createPage` call.
- **Fonts never block Apply.** `figma.listAvailableFontsAsync()` is checked at
  runtime; if "Estedad-VF" (the one verified Persian-capable face on this
  account) isn't present, the build **gracefully falls back** to Inter and
  reports the substitution — it never throws or blocks, per the task brief.

---

## Security posture

- `manifest.json` → `networkAccess: { "allowedDomains": ["none"] }` — no
  network access.
- No `fetch`/`XMLHttpRequest`/`WebSocket`/external URLs/CDNs/remote fonts
  anywhere in `src/` or the UI (enforced by a test). The UI talks only to the
  plugin thread via `postMessage`.
- No telemetry/analytics. No file contents, tokens or secrets leave the file.
- Only namespaced **shared** plugin data on assets the plugin itself creates.

---

## Build, typecheck, test

This package declares **no dependencies** and must not change the repo
package manager or root lockfile. Its scripts resolve `tsc`/`vitest` from the
repository root `node_modules`. Run them **from this directory**:

```bash
npm install          # no-op (no deps) — safe to run
npm run typecheck     # tsc --checkJs over the source (no emit)
npm run test          # vitest — pure token/component/screen/rtl/plan/pages core
npm run build          # bundle src/ -> dist/code.js + dist/ui.html + build-report.json
npm run build -- --dry-run   # also prints the pure plan + page plan (what Apply would create)
```

The Figma sandbox loads one classic script, so `build.mjs` bundles the
CommonJS source modules into a single self-contained `dist/code.js` using a
tiny inlined `require` runtime — no third-party bundler. The same source
modules load unchanged in Vitest (a plain Node environment; nothing here
touches the `figma` global except `src/lib/figma-exec.js`, which is the ONLY
module the pure test suite has to stub).

---

## Import into Figma Desktop

> Requires Figma **Desktop** (development plugins can't be imported in the
> browser) and a session with **edit access** to the file.

1. **Build once:** from this directory run `npm run build`. This produces
   `dist/code.js` and `dist/ui.html` (already committed, but rebuild to be
   sure).
2. Open **Figma Desktop** and open the **Hermes OS — Phase 102 Media & Video
   Hub** file (`https://www.figma.com/design/bbnzt84t6A95I0GqtmKekH/...`). Do
   **not** try to rename the file — it is already correctly named, and
   `figma.root.name = …` throws.
3. Menu: **Plugins → Development → Import plugin from manifest…**
4. Select this file: `tools/figma/hermes-phase102-media-hub/manifest.json`
5. Run it: **Plugins → Development → Hermes Phase 102 Media Hub Builder**.
6. Pick a stage (start with `1. Foundations`), click **Dry Run** and review
   the plan, then **Apply Stage**. Repeat for `2. Components` and
   `3. Screens`. Use **Verify** to confirm, and **Rollback** to undo.

---

## Layout

```
manifest.json              Figma plugin manifest (main: dist/code.js, no network)
package.json                isolated, no deps; typecheck/test/build scripts
tsconfig.json                strict-ish checkJs config (validates the JS source)
build.mjs                    dependency-free bundler + packager + dry-run harness
vitest.config.mjs             isolated Vitest project (pure core)
src/
  figma-env.d.ts             ambient subset of the Figma Plugin API (for tsc)
  main.js                    plugin entry: shows UI, routes staged messages
  ui.html                     Stage picker + Dry Run / Apply / Verify / Rollback UI
  lib/
    constants.js              namespace, keys, PAGE_NAMES, section/collection names
    util.js                   slug / stable stringify / FNV-1a hash (pure)
    tokens.js                 colors + spacing/radius/sizing + type ramp + font
                                resolution — transcribed from src/app/globals.css
    rtl.js                    PROTECTED_LTR_ROLES + computeMirrorPlan (pure RTL rules —
                                the single source of truth for the timeline LTR lock)
    presets.js                 anatomy DSL + the 9 Phase-102-specific presets
                                (player, meter, videoCard, hero, profile, step,
                                transcript, reviewCard, continueRow) + shared ones
    components.js              23-family registry (variant axes, overrides, props)
    locale-strings.js          original FA/EN/DE design copy for the Screens page
                                (NOT sourced from messages/*.json — mediaHub doesn't
                                exist yet; see the provenance note in the file)
    screens.js                  54-screen frame matrix (breakpoint × locale × type)
    docs.js                     Foundations-page documentation specimens (pure NodeSpecs)
    pages.js                    PURE 3-page Starter-cap planner (reuse/rename/create)
    validate.js                 fail-closed text validator for the Screens spec
    starter.js                  Starter capability gating + citations (pure)
    spec.js                     buildSpec() — every asset + content hash (pure)
    plan.js                     computePlan() — create/update/skip/prune + stageKinds
    figma-exec.js                the ONLY module with `figma.*` calls: apply/verify/rollback
tests/core.test.mjs            token fidelity, registry/anatomy, RTL rules, screen
                                 matrix, plan idempotency, Starter-cap guards,
                                 fail-closed validation, font fallback, packaging
dist/                          built bundle (committed for zero-friction import)
```

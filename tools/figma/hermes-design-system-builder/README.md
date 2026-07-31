# Hermes Design System Builder — local Figma plugin

A local, auditable Figma **development** plugin that creates **native local**
Variables, Styles, Components, Component Sets, Variants, Component Properties and
Auto Layout in the *Hermes OS – Design System* file — on the **free Starter
plan**, with **no network access** and **nothing leaving the file**.

- File: **Hermes OS – Design System**
- File key: `ahckSQbXwY4NVY3uxEZtLg`
- Runs entirely inside **Figma Desktop → Plugins → Development**.
- Not published to Community. No telemetry. No secrets.

> This tool replaces the earlier Phase‑87 blocker (no MCP could write native
> Variables/Styles/Components). It uses the official Figma **Plugin API** locally
> instead. See "Native productionization" in the Phase‑87 memory.

---

## What it creates (native, local)

Deterministic, verified in a Node harness (`npm run build -- --dry-run`):

| Asset | Count | Notes |
|---|---:|---|
| Variable collections | 4 | Semantic Colors, Spacing, Radius, Sizing (single default mode "Value") |
| Variables | 46 | 29 semantic colors + 6 spacing + 7 radius + 4 sizing |
| Paint styles | 29 | one per semantic color, **bound to its color variable** |
| Text styles | 8 | derived industrial type ramp (Estedad/Vazirmatn, Inter fallback) |
| Effect styles | 4 | Elevation E1–E4 drop shadows |
| Component sets | 43 | 23 primitives + 13 core + 7 industrial families |
| Components (variants) | 126 | variant components across the 43 sets |
| **Total assets** | **135** | + 1 managed Section + 1 manifest node |

**Colors and floats mirror the code 1:1** — colors come straight from
`src/components/ds/token-contract.ts` (the CI‑enforced contract) and the floats
from the canonical Phase‑87B block in `src/app/globals.css`. Each variable's
description records its `--css-var`, Tailwind key and WCAG note, so the Figma
asset maps back to the contract.

### Component fidelity (honest scope)

Each of the 43 families is generated as a **real** component set — auto‑layout,
token‑bound fills/borders via the paint styles, an applied text style, a primary
variant axis, and component properties (TEXT + an `RTL` boolean where the family
carries text). They are **foundation‑fidelity scaffolds** bound to the native
variables/styles, meant to be refined toward the React components — **not
pixel‑final replicas**. Deeper per‑variant visual matrices and property→layer
binding are recorded follow‑ups, **not** simulated.

**Accessibility** intent is carried in each asset's **description** (measured WCAG
contrast on color variables; usage/label rules on components) and, best‑effort,
in **native Figma component annotations**. Where the native `annotations` API is
unavailable, the descriptions remain the source of truth.

---

## Starter‑plan honesty

Verified against official Figma documentation (2026‑07‑30):

**Supported on Starter (all created natively):** local variables & collections;
local paint/text/effect styles; components, component sets & variants; component
properties; auto layout; variable→paint‑style binding; a single default variable
mode.

**Deferred — `DEFERRED_REQUIRES_FIGMA_PROFESSIONAL` (never faked):**

- **Multiple variable modes** (e.g. light/dark, per‑locale FA/EN/DE) — Starter is
  limited to one mode per collection; `addMode()` throws `Limited to 1 modes only`.
  → [Modes for variables](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables)
- **Team/shared library publication** — libraries are paid‑only; Starter has "No
  team libraries".
  → [Publish a library](https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library)

> **Separate from plan tier — file edit access.** A user with a **"View"/viewer**
> seat **cannot run a write plugin at all**, even on a paid plan. To Apply, the
> Figma Desktop session must be signed in as a user with **"can edit"** access to
> the file. (The MCP‑connected account `hermesnovinmehriric@gmail.com` currently
> has a View seat — see the report.)
> → [File and project permissions](https://help.figma.com/hc/en-us/articles/35361119554711-File-and-project-permissions)

---

## Controls

| Control | Effect |
|---|---|
| **Dry Run** | Computes the full plan (create/update/skip/prune per asset) against the live file and reports it. **Writes nothing.** |
| **Apply** | Executes the plan. Creates/updates only changed assets; skips unchanged (preserving node IDs). Writes a run record to the manifest node. |
| **Verify** | Confirms every planned asset exists and its recorded content hash matches; reports missing/drifted and the count of preserved (unmanaged) reference frames. |
| **Rollback** | Deletes assets this plugin created. `Rollback` (default) removes all managed assets; a specific `runId` removes only that run. Never touches unmanaged nodes. |

### Determinism, idempotency & safety

- **Deterministic:** the plan is computed by pure modules (no `Date`/random). The
  same spec always yields the same asset keys and content hashes.
- **Idempotent:** every managed asset is tagged in the `hermesDSB`
  shared‑plugin‑data namespace with a stable `assetKey` + content hash. A rerun
  reconciles by key (create/update/**skip**) and **never duplicates**.
- **Manifest before mutation:** Apply computes the whole plan first, then
  executes; a manifest node records the asset index + run summary afterward.
- **Reference frames preserved:** the plugin only ever mutates/deletes assets
  carrying its own marker. The 34 top‑level reference frames (and their
  descendants) are unmarked, so they are never read for mutation and never
  deleted. Generated components live in one isolated managed Section placed to
  the right of existing content (never over `(0,0)`).
- **Rollback is marker‑scoped** (optionally per `runId`) — it removes only what
  the plugin created.

---

## Security posture

- `manifest.json` → `networkAccess: { "allowedDomains": ["none"] }` — **no
  network access** ([docs](https://developers.figma.com/docs/plugins/making-network-requests/)).
- No `fetch`/`XMLHttpRequest`/`WebSocket`/external URLs/CDNs/remote fonts anywhere
  in `src/` or the UI. The UI talks only to the plugin thread via `postMessage`.
- No telemetry/analytics. **No file contents, tokens or secrets leave the file.**
- No `getPluginData`/`setPluginData`; only namespaced **shared** plugin data on
  assets the plugin itself creates.

---

## Build, typecheck, test

This package declares **no dependencies** and must not change the repo package
manager or root lockfile. Its scripts resolve `tsc`/`vitest` from the repository
root `node_modules`. Run them **from this directory**:

```bash
npm run typecheck   # tsc --checkJs over the source (no emit)
npm run test        # vitest — pure spec/plan/starter core (19 tests)
npm run build       # bundle src/ -> dist/code.js + dist/ui.html + build-report.json
npm run build -- --dry-run   # also prints the pure plan (what Apply would create)
```

The Figma sandbox loads one classic script, so `build.mjs` bundles the CommonJS
source modules into a single self‑contained `dist/code.js` using a tiny inlined
`require` runtime — **no third‑party bundler**. The same source modules load
unchanged in Vitest.

---

## Import into Figma Desktop

> Requires Figma **Desktop** (development plugins can't be imported in the
> browser) and a session with **edit access** to the file.

1. **Build once:** from this directory run `npm run build`. This produces
   `dist/code.js` and `dist/ui.html` (already committed, but rebuild to be sure).
2. Open **Figma Desktop** and open the **Hermes OS – Design System** file
   (`https://www.figma.com/design/ahckSQbXwY4NVY3uxEZtLg/...`).
3. Menu: **Plugins → Development → Import plugin from manifest…**
4. Select this file:
   `tools/figma/hermes-design-system-builder/manifest.json`
5. Run it: **Plugins → Development → Hermes Design System Builder**.
6. Click **Dry Run** first and review the plan. Then **Apply** when ready.
   Use **Verify** to confirm, and **Rollback** to undo.

---

## Layout

```
manifest.json              Figma plugin manifest (main: dist/code.js, no network)
package.json               isolated, no deps; typecheck/test/build scripts
tsconfig.json              strict-ish checkJs config (validates the JS source)
build.mjs                  dependency-free bundler + packager + dry-run harness
vitest.config.mjs          isolated Vitest project (pure core)
src/
  figma-env.d.ts           ambient subset of the Figma Plugin API (for tsc)
  main.js                  plugin entry: shows UI, routes messages
  ui.html                  Dry Run / Apply / Verify / Rollback UI (no network)
  lib/
    constants.js           namespace, keys, names (pure)
    util.js                slug / stable stringify / FNV-1a hash (pure)
    tokens.js              colors (token-contract mirror) + floats + type ramp (pure)
    components.js          43 component-family registry (pure)
    starter.js             Starter capability gating + citations (pure)
    spec.js                buildSpec() — every asset + content hash (pure)
    plan.js                computePlan() — create/update/skip/prune (pure)
    figma-exec.js          the ONLY figma.* code: apply/verify/rollback
tests/core.test.mjs        determinism, idempotency, coverage, gating
dist/                      built bundle (committed for zero-friction import)
```

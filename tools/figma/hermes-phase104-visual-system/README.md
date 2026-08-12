# Hermes Phase 104 — Visual System (Figma plugin)

A local, auditable Figma **development plugin** that materialises the Hermes Phase 104
Design DNA as native Figma Variables, Paint Styles and Effect Styles.

- No network. `networkAccess.allowedDomains = ["none"]`. Nothing leaves the file.
- No dependencies. Everything runs on Node built-ins.
- Deterministic and idempotent — re-running updates only what changed.
- Safely reversible — Rollback removes plugin-owned assets, restores reused page
  metadata, and retains any container that has acquired non-plugin content.

**Target file:** `Hermes OS — Phase 104 Visual System`
`https://www.figma.com/design/QcJcRaBv1NMrgb4pMshEVB`

---

## Why a plugin and not the Figma MCP connector

The Hermes Figma account is on the **Starter** tier. Proven by direct probe:

| limit | value |
|---|---|
| pages per file | **3** |
| modes per variable collection | **1** |
| Figma MCP tool calls | a small global quota, **exhausted after ~8 calls** — after which *every* MCP tool fails, reads included |

A design system needs hundreds of write operations, so the MCP path cannot deliver
it on this plan. A plugin runs entirely inside Figma and is not rate-limited at all.
This is the same mechanism that delivered Phase 87 (owner-applied, 173/173 assets,
fully idempotent on re-run).

Two consequences are baked into the design:

- The 23-part Phase 104 taxonomy is carried as **Sections**, not pages.
- Theme/breakpoint **modes** are impossible, so the token architecture uses **many
  single-mode collections** instead. For a single-theme product this is arguably
  cleaner anyway — Hermes ships dark only (no `darkMode` config, no `data-theme`).

---

## Running it

1. From a clean source commit, run `npm run verify` — audit + build + tests. A
   dirty or unknown executable input is rejected again at runtime. The fingerprint
   pins the latest commit that touched a build input, so a later `dist/`-only
   packaging commit rebuilds byte-for-byte without the impossible task of embedding
   its own SHA.
2. Figma Desktop → **Plugins → Development → Import plugin from manifest…**
3. Select `tools/figma/hermes-phase104-visual-system/manifest.json`.
4. Open the target file, run the plugin.
5. Press **Dry Run** first. It writes nothing and enumerates exactly what Apply
   would create, update or skip.
6. Confirm the Dry Run fingerprint and `205`-asset contract, then press **Apply**.
7. Press **Verify**. The phase is not materially applied until Verify reports all
   205 assets current, with zero missing, drifted, duplicate or unexpected assets.

> You must be signed into Figma with **edit access** to the file. The account's MCP
> seat shows as "View", but writes to its own drafts do work — that was verified
> directly, not assumed.

### Controls

| control | effect |
|---|---|
| **Dry Run** | Enumerates create/update/skip. **No writes.** |
| **Apply** | Creates or updates the DNA foundations. Requires a clean Dry Run on the same build and unchanged file state. |
| **Verify** | Checks all 205 keys/hashes plus structural invariants; duplicate keys fail closed. |
| **Rollback** | Removes plugin-owned assets; restores reused pages and preserves containers holding user content. |

Rollback identifies assets by this plugin's own shared-plugin-data namespace
(`hermesP104`), never by name prefix — a prefix match could delete owner-authored
nodes. Component sets are discovered recursively, including those nested inside
Sections, and duplicate managed keys block Apply. It therefore **cannot touch the Phase 87 design system**, which lives under
the separate `hermesDSB` namespace. That separation is load-bearing: Phase 87 is an
owner-applied artifact with recorded evidence and must not be corruptible by accident.

---

## What Apply creates

**205 appliable assets**, of which 24 are component sets carrying **226 variants**.

| kind | count |
|---|---|
| pages | 3 |
| sections | 23 |
| variable collections (single-mode) | 6 |
| variables | 102 |
| paint styles (each bound to its variable) | 43 |
| effect styles | 4 |
| component sets | 24 |
| component variants inside them | 226 |

### The three pages

| page | sections |
|---|---|
| `01 — Foundations & Components` | `00` Approved Visual References · `01` Design DNA · `02` Tokens · `03` Typography & Iconography · `04` Core Components · `05` Industrial Components · `06` Intelligence Components |
| `02 — Hermes Product Screens` | `07` Workspace & Auth · `08` Command Center · `09` Industrial Brain · `10` Live Operations · `11` Assets & Connectivity · `12` Alarm Center · `13` Reports · `14` Administration · `15` Phase 101 Industrial Engineering · `16` Phase 102 Media & Video Hub · `17` Phase 103 Live Voice Intelligence |
| `03 — Responsive, Prototypes & Handoff` | `18` Responsive Matrix · `19` RTL/LTR · `20` Prototypes · `21` Accessibility · `22` Handoff |

All 23 categories survive the 3-page cap. A test asserts the section numbers are
contiguous `00..22`, so nothing can be quietly dropped to make things fit.

`00 — Approved Visual References` is created **empty** and stays empty until the
owner supplies the real mockups. It is never populated with invented artwork, and
a test enforces the `awaitingOwnerAssets` flag.

### The anti-duplication contract

The requirement is a component-driven system, not 117 heavyweight frame copies.
That is achieved by choosing carefully what becomes a variant and what becomes a
property:

- **Locale is NEVER a variant.** FA/EN/DE are TEXT component properties, so
  switching language overrides text and creates no new nodes. Without this, every
  axis would triple. Enforced by `assertLocaleIsNeverAVariant()` — which matches
  axis names and values *exactly*, because a substring test false-positives on
  legitimate axes (`Intent` contains `en`).
- **Direction (LTR/RTL) is a variant on only three families** — Shell, Breadcrumb
  and Telemetry Row. Everything nested inside inherits direction from the
  auto-layout parent. A test pins that list so the axis cannot spread.
- **Breakpoint is a variant only where geometry actually changes.** A badge is a
  badge at every width. Every family that does carry it covers all three of
  Desktop 1440 / Tablet 768 / Mobile 390 — asserted by test.
- **No set exceeds 30 variants.** `Hermes/Button` is split into a base set
  (Intent × Size) and a states set (Intent × State) rather than shipping an
  unnavigable 60-variant matrix.

### Not yet appliable

4 foundation documentation frames are declared but excluded from the apply list
(`docsDeclaredNotAppliable: 4`), so Dry Run never promises work Apply will not do.
A test (`Dry Run never promises anything Apply cannot deliver`) enforces that every
asset in the apply list is a kind the executor can actually create.

**Screens are not built yet.** Sections `07`–`17` are created as empty, named
containers. Screen composition waits for the owner's approved mockups — nothing is
invented in their place.

---

## Verification

```bash
npm run verify
```

- `npm run audit` — computes **real WCAG 2.2 ratios** for every DNA colour decision.
  64 checks, 0 failures. Text ≥ 4.5:1 (SC 1.4.3), indicators ≥ 3:1 (SC 1.4.11),
  measured against the **lightest** canonical surface `#152A36`, with translucent
  Glass tiers composited first so the ratio is the one the user actually sees.
- `npm run test` — 56 policy, mutation and runtime-contract tests asserting the
  design *rules* and executor safety: `UNKNOWN` can never
  collapse into `HEALTHY`, no state depends on colour alone, an AI hypothesis never
  carries a verified look, the shipped glass lift ladder and `scale(1.012)` pin are
  preserved, Horizon is forbidden on every dense-data surface, edge illumination
  never becomes a glow, motion stays in the 120–240 ms band.

The audit caught four genuine contrast failures in the first draft of the token set
(`critical` indicator at 2.64:1, `maintenance` text at 3.51:1, `offline` indicator at
2.13:1, `evidence` text at 4.03:1). All were corrected against computed values.
See `docs/design/phase-104/01-hermes-design-dna.md` §6.1.

---

## Relationship to the code token layer

Phase 104 is **additive**. It does not restate, renumber or replace anything enforced
by `src/components/ds/token-contract.ts`, and it introduces **no new base colour**.
Six of the eight DNA signatures introduce no new colour at all — they give precise
semantic names to values the product already ships.

Where a DNA variable maps to a shipped CSS custom property, it carries `var()`-wrapped
WEB code syntax so Dev Mode round-trips correctly. A test enforces the wrapper.

Phases 101–103 are now merged into `main` (PRs #60, #59 and #61 respectively), so
their section names use the shipped product scopes rather than speculative labels.
Direct app-token integration remains deferred until the Figma Dry Run, Apply and
Verify evidence is accepted; this plugin does not silently rewrite the live app.

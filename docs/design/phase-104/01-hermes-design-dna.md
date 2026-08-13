# Phase 104 — Hermes Design DNA

**Status:** specification + executor locally verified · Figma Apply NOT RUN (see §10)
**Branch:** `agent/phase104-hermes-visual-figma-system` · base `cbfa292`
**Machine-readable source:** `tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js`
**Verification:** `node tools/figma/hermes-phase104-visual-system/scripts/audit-contrast.mjs`
— 64 checks, 0 failures. Every ratio in this document is **computed by that script**,
not asserted by hand.

---

## 0. What this phase is, and what it is not

Phase 104 defines a proprietary Hermes OS visual language on top of the Phase 87B
canonical token layer. It is **additive**. It does not restate, renumber or replace
anything enforced by `src/components/ds/token-contract.ts`, and it introduces **no
new base colour** for the product surface.

### 0.1 A correction to the phase premise, recorded honestly

The Phase 104 brief describes "previously approved Hermes OS mockups" — a cinematic
industrial sunset, deep navy workspace, Workspace Home / Live Operations / Alarm
Center, and so on — and treats them as the mandatory visual baseline.

**Those artifacts do not exist in this repository.** Verified:

| Claim in the brief | Repository reality |
|---|---|
| approved mockup set exists | No mockup image, `.fig`, `.sketch` or vector artifact exists anywhere. The repo contains 14 image files total: 6 are Phase 93 headless-Chromium screenshots of the *running app*, 4 are homepage marketing photography. |
| "cinematic industrial sunset" | The token `sunset` has **zero matches** repo-wide. |
| "Workspace Home", "Live Operations", "Alarm Center" | **Zero matches** repo-wide. |
| the approved reference experiences | Are a **different six**: Homepage, Platform, Login, Copilot, Dashboard, IndustrialBrain — recorded in `docs/design/phase-87-closure/README.md:110-120` and existing only inside the owner's external Figma file `ahckSQbXwY4NVY3uxEZtLg`. |
| "deep navy" base | The approved base is **Obsidian `#071018`** — a blue-black. |
| cinematic direction | `docs/design/phase-87a/03-brand-system.md:16-18` forbids "cyberpunk concept" and "over-decorated neon dashboard"; `:320` retires all `.glow-*`, `.text-glow*`, `.landing-scanlines`. The older closure document deferred an immersive redesign to a then-future Phase 103; the Phase 103 that actually merged is **Live Voice Intelligence**, and it delivered no approved visual mockup set. |

**Resolution applied.** The description in the brief is treated as the owner's
*authoritative direction*, because it came from the owner. The claim that it was
"previously approved" is **not** treated as established, because it cannot be
verified from here. Where direction and the committed brand system conflict, the
brand system wins and the conflict is recorded:

- **"Deep navy"** is implemented as a *name* for the existing Obsidian family
  (§3), not as a new colour. Introducing a new base would break
  `token-contract.ts` and its CI gate.
- **"Cinematic sunset"** is implemented as **Hermes Horizon** (§2): a strictly
  bounded atmosphere layer with a mandatory vignette, a hard 22 % ember-band cap,
  a machine-enforced surface allow-list, and an absolute prohibition on text
  sitting directly on it. It reinstates no glow, bloom or scanline.

No mockup has been synthesised and labelled "approved". If the owner holds the
mockups outside the repo, supplying them (or the Figma node ids) supersedes §2–§9.

### 0.2 Current predecessor status

This checkpoint was originally written on `cbfa292`, before the successor product
work landed. The current `main` now contains Phase 102 Media & Video Hub (PR #59),
Phase 101 Industrial Brain Deep Engineering (PR #60), and Phase 103 Live Voice
Intelligence (PR #61). Sections `15`–`17` therefore use those shipped scopes and are
not labelled speculative. This changes names/status only; the 3-page / 23-section
contract and all asset counts remain fixed.

Direct app-token integration is still deferred until the native plugin passes a
clean-build Dry Run, owner Apply and post-Apply Verify. No Figma state is inferred
from the fact that the product phases merged.

---

## 1. The eight signatures

| # | Signature | What it is | New hues |
|---|---|---|---|
| 1 | **Hermes Horizon** | bounded cinematic atmosphere | 2 (warm, atmosphere-only) |
| 2 | **Hermes Deep Navy** | the operational workspace | 0 — pure alias |
| 3 | **Hermes Glass** | controlled translucency | 0 — tokenises shipped literals |
| 4 | **Hermes Edge** | fine steel/ice borders | 0 — pure alias |
| 5 | **Hermes Beacon** | the focus device | 0 — pure alias |
| 6 | **Hermes Rail** | the minimal nav rail | 0 |
| 7 | **Hermes Command** | the signature AI field | 0 |
| 8 | **Hermes Triad** | the three workspace cards | 0 |

Six of eight signatures introduce **no new colour at all**. This is deliberate:
the brief's own quality bar rejects "random card collections" and decorative
palettes. Hermes reads as one system because the same twenty-odd values recur
under precise semantic names.

---

## 2. Hermes Horizon — bounded atmosphere

A six-stop vertical gradient, three mandatory overlays, and hard limits.

| stop | position | value | role |
|---|---|---|---|
| 1 | 0.00 | `#03070B` | void — holds the UI chrome |
| 2 | 0.42 | `#071018` | **Obsidian** — continuity anchor with the product |
| 3 | 0.68 | `#0E1A24` | steel haze |
| 4 | 0.84 | `#34201C` | ember fade — kills the banding edge |
| 5 | 0.93 | `#6B3A22` | **ember core** — the only warm value in Hermes |
| 6 | 1.00 | `#040A0F` | ground plane resolves back to Obsidian Deep |

Mandatory overlays, in order: ice counter-light `rgba(139,244,248,0.06)`,
particulate haze `rgba(169,186,198,0.05)`, and a **required** vignette
`rgba(4,10,15,0.72)`.

**Machine-enforced policy** (`HORIZON_PERMITTED_SURFACES` / `HORIZON_FORBIDDEN_SURFACES`):

- Permitted on **Login, Workspace Home, Video Watch** only.
- Forbidden on Command Center, Industrial Brain, Live Operations, Asset Detail,
  Connectivity, Reports, Alarm Center, Administration, Media Analytics,
  Automation Studio — every surface that carries dense engineering data.
- Ember band ≤ **22 %** of frame height. Vignette required.
- **No text may sit directly on Horizon.** Text sits on a Hermes Glass surface
  composited over it. This is what makes the atmosphere free — it can never cost
  legibility. Verified: primary text on every Glass tier composited over the
  *lightest* Horizon stop measures **13.08 – 14.55:1**.

---

## 3. Hermes Deep Navy — alias layer, zero new colour

| DNA name | aliases | value |
|---|---|---|
| `surface.workspace` | `--color-background-base` | `#071018` |
| `surface.void` | `--color-background-deep` | `#040A0F` |
| `surface.panel` | `--color-surface-primary` | `#0C1720` |
| `surface.panelRaised` | `--color-surface-elevated` | `#11212C` |
| `surface.panelInteractive` | `--color-surface-interactive` | `#152A36` |

---

## 4. Hermes Glass — closing the largest known inconsistency

The shipped `.ds-glass-*` family (`src/app/globals.css:1269-1305`) is **hard-coded
`rgba()` and reads from no token** — discovery flagged this as the single largest
inconsistency in the system. Phase 104 tokenises it, recording the exact literal
each tier replaces so the migration is a provable 1:1.

| tier | fill | border | blur | lift | primary text (app) | primary text (over Horizon) |
|---|---|---|---|---|---|---|
| `soft` | `rgba(12,23,32,0.55)` | `rgba(139,244,248,0.06)` | 10 | −2 | 15.28:1 | 13.08:1 |
| `card` | `rgba(12,23,32,0.72)` | `rgba(139,244,248,0.10)` | 14 | −3 | 15.88:1 | 14.55:1 |
| `interactive` | `rgba(17,33,44,0.74)` | `rgba(139,244,248,0.12)` | 14 | −6 | 14.75:1 | 13.53:1 |
| `elevated` | `rgba(17,33,44,0.80)` | `rgba(139,244,248,0.14)` | 18 | −5 | 14.77:1 | 13.95:1 |
| `hero` | `rgba(20,38,50,0.86)` | `rgba(139,244,248,0.16)` | 22 | −8 | 14.10:1 | 13.57:1 |

**Two shipped CI pins are preserved exactly.** `components.test.ts:154-165` asserts
the strict lift ladder `soft(−2) < card(−3) < elevated(−5) < interactive(−6) < hero(−8)`
and pins `scale()` to exactly `["scale(1.012)"]`. Phase 104 changes neither.

> **Migration hazard.** `components.test.ts` slices `globals.css` by *literal string
> position*. A new `.ds-glass-*` tier, or moving `hero`/`soft`/`interactive`,
> silently reshapes those windows and fails CI. Insert only after the
> `.ds-glass-interactive` transition rule at `globals.css:1306`.

---

## 5. Hermes Edge, Beacon, Rail, Command, Triad

**Edge** — `structural #203743` (1px), `hairline rgba(139,244,248,0.10)` (1px),
`active #21C9D5` (9.47:1). Edge *illumination* is a linear top highlight
`rgba(139,244,248,0.14) → transparent` over the first 40 % of surface height.
**Outer glow, bloom and coloured shadow spread are prohibited** — the retired
`.glow-*` family is not reinstated under a new name.

**Beacon** — `core #16D9E3` (11.01:1 on base, 8.52:1 worst case), `halo
rgba(22,217,227,0.28)`, `rim rgba(22,217,227,0.24)`, `wash rgba(22,217,227,0.10)`.
Dark-on-cyan is 11.01:1; **white-on-cyan remains prohibited**.
**At most one primary Beacon per view** — it is a focus device, not decoration.

**Rail** — 72 px icon-only resting state (the Hermes signature), 264 px expanded
drawer (unchanged from Phase 87A so nav code is untouched), bottom-sheet below
768 px. Item target **44 px** — WCAG 2.2 SC 2.5.8.

**Command** — 720 / 640 / 342 px wide, 64 px tall (56 on mobile), radius 16,
`elevated` glass, 2 px Beacon focus ring at 2 px offset, leading Hermes Brain mark.
Palette groups: Navigate · Actions · Entities · **Evidence** · Help.

**Triad** — exactly three cards, 384 × 260, gap 24, `interactive` glass, radius 20,
stacking below 768. Intents are fixed: **operate** (what is happening now) ·
**understand** (what the evidence says and what is uncertain) · **act** (the
engineering action queue awaiting a human decision).

---

## 6. Industrial state ladder — ten states, verified

Ordered by severity. `indicator` is the dot/border colour (needs ≥ 3:1, SC 1.4.11);
`text` is the readable partner used whenever the state name is rendered as type
(needs ≥ 4.5:1, SC 1.4.3). All ratios against the **lightest** surface `#152A36`.

| state | rank | indicator | ratio | text | ratio | glyph | outline |
|---|---|---|---|---|---|---|---|
| `healthy` | 0 | `#38D996` | 8.14:1 | `#38D996` | 8.14:1 | dot-solid | solid |
| `degraded` | 1 | `#C9B06A` | 6.99:1 | `#C9B06A` | 6.99:1 | dot-half | solid |
| `warning` | 2 | `#F5B942` | 8.40:1 | `#F5B942` | 8.40:1 | triangle | solid |
| `alarm` | 3 | `#F05D68` | 4.57:1 | `#F05D68` | 4.57:1 | square-pulse | solid |
| `critical` | 4 | `#E03144` | 3.31:1 | `#FF8A94` | 6.58:1 | cross-double | **double** |
| `maintenance` | 5 | `#5F7E9E` | 3.51:1 | `#93AEC8` | 6.45:1 | wrench | solid |
| `simulation` | 6 | `#8B7CFF` | 4.54:1 | `#A99BFF` | 6.23:1 | diamond | **dashed** |
| `stale` | 7 | `#708694` | 3.90:1 | `#8496A6` | 4.87:1 | clock-dashed | **dashed** |
| `offline` | 8 | `#6B7F8D` | 3.56:1 | `#8496A6` | 4.87:1 | dot-hollow | solid |
| `unknown` | 9 | `#8496A6` | 4.87:1 | `#8496A6` | 4.87:1 | question | **dashed** |

**`UNKNOWN` can never be mistaken for `HEALTHY`.** They differ on three
independent channels at once: hue (neutral grey vs green), glyph (`?` vs solid
dot) and outline (dashed vs solid). The distinction survives greyscale and every
form of colour-vision deficiency.

**`stale` is modelled as a data-quality *modifier*, not a device state.** It renders
over the last-known state — that state's colour desaturated to 40 % plus a dashed
ring and a clock glyph. This is what keeps the three grey-family states (stale,
offline, unknown) from collapsing into one another; the listed `fill` is only the
fallback used when no prior state exists.

### 6.1 Four failures the audit caught

These were wrong in the first draft and were corrected against computed values,
not opinion:

| token | first draft | measured | fix |
|---|---|---|---|
| `critical` indicator | `#C42A3A` | **2.64:1** — fails SC 1.4.11 | → `#E03144` (3.31:1) |
| `maintenance` text | `#5F7E9E` | **3.51:1** — fails SC 1.4.3 | → `#93AEC8` (6.45:1) |
| `offline` indicator | `#495C68` (`--color-text-disabled`) | **2.13:1** | → `#6B7F8D` (3.56:1). Offline is a real operational state, not a disabled control, so the SC 1.4.11 exemption does not apply. |
| `evidence` text | `#3B82F6` | **4.03:1** — fails SC 1.4.3 | → `#7FB0FF` (6.75:1) |

---

## 7. Reasoning ladder — an AI hypothesis must never look like a plant fact

Separation is carried by **three independent channels simultaneously**: colour,
border style, and a mandatory provenance chip. `verified-look` is the machine flag
Brain surfaces assert against.

| chip | tier | indicator | ratio | text | ratio | border | verified-look |
|---|---|---|---|---|---|---|---|
| `OBSERVED` | observation | `#EDF7FA` | 13.62:1 | `#EDF7FA` | 13.62:1 | solid | **yes** |
| `EVIDENCE` | evidence | `#3B82F6` | 4.03:1 | `#7FB0FF` | 6.75:1 | solid | **yes** |
| `HYPOTHESIS` | hypothesis | `#8B7CFF` | 4.54:1 | `#A99BFF` | 6.23:1 | **dashed** | no |
| `CANDIDATE` | rootCauseCandidate | `#8B7CFF` | 4.54:1 | `#A99BFF` | 6.23:1 | **dashed** | no |
| `CONFLICT` | contradiction | `#F05D68` | 4.57:1 | `#FF7C86` | 5.99:1 | solid | **yes** |
| `NO DATA` | missing | `#F5B942` | 8.40:1 | `#F5B942` | 8.40:1 | **dashed** | no |
| `SIMULATED` | simulationResult | `#8B7CFF` | 4.54:1 | `#A99BFF` | 6.23:1 | **dashed** | no |
| `PROPOSED` | recommendation | `#16D9E3` | 8.52:1 | `#16D9E3` | 8.52:1 | solid | no |
| `APPROVED` | engineerApproval | `#38D996` | 8.14:1 | `#38D996` | 8.14:1 | solid | **yes** |

Every non-verified tier carries a **dashed border** except `PROPOSED`, which is
solid because a recommendation is a concrete offer — but it is `verified-look: false`
and must render its approval affordance adjacent. `NO DATA` is never rendered as
zero.

---

## 8. Motion

Durations reuse the shipped `--motion-*` tokens. Phase 104 adds only the named
choreographies: `commandFocus` 140 · `panelTransition` 200 ·
`progressiveDisclosure` 200 · `signalStateTransition` 140 (**animates the state
colour, never the value**) · `reasoningReveal` 240 top-down so causality reads ·
`alarmAcknowledge` 200 · `workspaceNavigation` 200.

Prohibited outright: float, pulse-glow, parallax, bounce, ripple, confetti, rotate-3d.

Under `prefers-reduced-motion` every choreography collapses to an instant state
change, and **the alarm pulse becomes a static double outline so severity is never
lost**.

---

## 9. Typography, locales, responsive

Fonts resolve `Estedad` (display) / `Vazirmatn` (body) / `Roboto Mono`, falling back
to Inter with the substitution recorded in the run report. **Vazirmatn and
Estedad-VF are both confirmed present** in the Figma environment.

Breakpoints designed and validated: **1440 × 1024 · 768 × 1024 · 390 × 844**.

> **Persian hazard.** `globals.css:232` sets `:lang(fa) { letter-spacing: 0 !important; }`.
> Any tracking-based typography token is a **no-op on the primary locale** — do not
> design Persian hierarchy around letter-spacing.

---

## 10. Status and blockers

| gate | state |
|---|---|
| Design DNA specification | **COMPLETE** |
| Contrast / a11y verification | **PASS** — 64 checks, 0 failures |
| Design-rule / executor policy tests | **PASS** — 58 tests, including mutation controls, dynamic-page load-before-traverse, reproducible source identity and runner-isolation guard |
| Figma file created | **YES** — `QcJcRaBv1NMrgb4pMshEVB` |
| Plugin: pages, sections, tokens, components | **LOCALLY VERIFIED** — contract remains 205 assets / 226 variants; owner Dry Run evidence still required |
| Figma Apply executed | **NOT RUN** — must be run by the owner inside Figma Desktop |
| Approved mockups received | **NO** — owner is supplying them |
| Screens designed | **NOT STARTED** — deliberately blocked on the mockups |
| Product-phase naming | **CURRENT** — merged Phase 101/102/103 scopes reflected |
| Code integration | **DEFERRED** until accepted Dry Run / Apply / Verify evidence |

**Starter-plan constraints, proven by direct probe and never worked around by
pretending otherwise:**

| capability | reality | what is used instead |
|---|---|---|
| pages per file | **3** (`createPage` throws on the 4th) | all 23 taxonomy categories carried as Sections; section numbers asserted contiguous `00..22` so none can be dropped |
| collection modes | **1** (`addMode` throws) | one single-mode collection per semantic group; theme/breakpoint differences carried by component variants |
| library publishing | not available | every component lives in this one file, so instances resolve locally |
| Figma MCP tool calls | small global quota, exhausted after ~8 calls — **kills reads too** | the native plugin, which is not rate-limited at all |

Per the owner's decision the plan is **not** being upgraded. The native plugin is
the delivery mechanism — the same one that produced Phase 87's owner-applied
173/173 result.

### 10.1 Why no screens exist yet

The owner has confirmed the approved mockups are real and is supplying the images.
Until they arrive, section `00 — Approved Visual References` is created **empty**,
and sections `07`–`17` are created as empty named containers. Nothing is invented
in their place, and no claim is made that the approved baseline has been
reconstructed. On receipt, the mockups go into `00` and the Phase 104 screens are
built from that identity using the component library already in place.

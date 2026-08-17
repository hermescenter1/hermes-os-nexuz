# Phase 104-E — The Observatory Homepage (reference surface)

```text
PHASE104_E_HOMEPAGE=COMPLETE
OWNER_REFERENCE_DIRECTION=APPROVED
CODEX_FINAL_VISUAL_REVIEW=APPROVED
MOBILE_HEIGHT_EXCEPTION=ACCEPTED
PUBLIC_HOME_HORIZON_ALLOWLIST=UNCHANGED
ROUTE_STATUS=/  →  MIGRATED_DIRECTLY   (exact match; locale variants are one route)
JOURNAL_REDESIGN=NOT_STARTED        # historical at `b860a62` (2026-08-15) — superseded: DONE in 104-F (`ed5a1e4`)
LOGIN_REDESIGN=NOT_STARTED          # historical — 104-D2 Horizon pilot exists (`f606792`); bespoke composition pending 104-I
DASHBOARD_REDESIGN=NOT_STARTED      # historical — 104-D2 Triad pilot exists (`f606792`); family system pending 104-I
```

The public homepage is the first of the five Phase 104 reference surfaces to be redesigned in
full and approved. It establishes the visual grammar the remaining route families will follow.
This document is the handoff: what shipped, why it looks the way it does, what was reviewed,
and what is deliberately left for later.

## 1. Concept

**HERMES INDUSTRIAL INTELLIGENCE OBSERVATORY** — a layered industrial space in which one
bespoke signal diagram carries the product's whole argument:

```text
industrial asset → PLC / SCADA / HMI → evidence → Industrial Brain
                 → hypothesis & risk → human validation gate → safe action
```

The page is not a landing page and not a SaaS dashboard. Every chapter owns a real drawing;
nothing is a card grid, and there is no photograph anywhere on the route.

## 2. Review history — three rounds, honestly

| Round | Verdict | What was wrong / what changed |
|---|---|---|
| 1 | **REJECTED** — `NO_MATERIAL_VISUAL_REDESIGN` | A re-layout of the old card-grid page: same navy ground, stock control-room photograph, a bordered box around every idea. Rearranging sections did not change what the page looked like. |
| 2 | **CONDITIONALLY ACCEPTED** | The Observatory direction, the bespoke signature, eight chapters, no photograph. Defect: visual power lived only in the hero; after the fold the page fell back to text, hairlines, columns and lists. |
| 3 | **APPROVED (Codex: PASS_WITH_FIXES → APPROVED)** | Same architecture, carried through: every chapter owns a drawing; the signature has a stroke hierarchy and a Glass instrumentation overlay; three Glass surfaces at real depth; semantic reasoning tokens only at their meaning; header/footer opt-in. Final fixes: dedicated CH03/CH05 ledes, INPUT/PROCESS/OUTPUT/CONSTRAINT plane semantics, GATE/ACTOR/EVIDENCE/BLOCK/STATE gate table, mobile gate accordion, header fallback hardening. |

## 3. What shipped

### 3.1 Files

| Path | Role |
|---|---|
| `src/app/[locale]/page.tsx` | The eight-chapter composition; every string from `publicSite`. |
| `src/components/public-site/home/ObservatorySignature.tsx` | The bespoke signature — three compositions (desktop bus, mobile column, mobile-fold compact). No text inside any SVG. |
| `src/components/public-site/home/ObservatoryHero.tsx` | CH01: deep field + signature + Glass instrumentation overlay. |
| `src/components/public-site/home/HomeChapters.tsx` | CH02–CH08. |
| `src/components/public-site/PublicHeader.tsx` | `visualMode="observatory"` opt-in; **default `"standard"` unchanged**. |
| `src/components/public-site/PublicFooter.tsx` | Same opt-in pattern; default unchanged. |
| `src/app/globals.css` | `PHASE 104-E ROUND 3` block — all `--hh-*` locals; every colour READ from a shipped token; zero new declarations in any gated family. |
| `messages/{en,de,fa}.json` | `publicSite.observatory` — 43 leaves per locale (planes + gate semantics, two ledes). German leaf-count gate 6151 → 6194. |
| `src/components/public-site/__tests__/homepage-104e-narrative.test.ts` | The narrative contract (replaces `homepage-87d1.test.ts`, by owner authorisation) + mutation harness + Codex-fix semantics + anchor offset. |
| `scripts/design/phase104-route-inventory.mjs` | `/` → `MIGRATED_DIRECTLY`, exact. |
| `docs/design/phase-104/03-route-coverage.md` | Status table updated (3 direct migrations). |

### 3.2 The eight chapters

| # | Chapter | Drawing | Glass | Beacon |
|---|---|---|---|---|
| 01 | Observatory hero | signature bus + deep field + coordinate plate | **#1** instrumentation overlay | — |
| 02 | One industrial case | vibration waveform, incident rail with semantic state markers | **#2** evidence inspector | decision step |
| 03 | Four connected planes | one signal spine, INPUT / PROCESS / OUTPUT / CONSTRAINT per plane | — | — |
| 04 | Engineering backbone | five-tier plant→platform map (Instrumentation · PLC/OT Edge/OPC UA/MQTT · SCADA/HMI/Historian · Twin/Knowledge Graph · Hermes) | — | — |
| 05 | Intelligence core | one shared drawing: evidence in, contradiction branched, hypotheses ranked, calibration, gate before action, Copilot beside the core | — | — |
| 06 | Human validation gate | semantic `<table>` (md+) / `<details>` accordion (<md); GATE / ACTOR / EVIDENCE / BLOCK / STATE | — | G3 Human Approval |
| 07 | Editorial spread | cover geometry, issue mark, display title, metadata | — | — |
| 08 | Closing scene | signal convergence into a gate | **#3** decision surface | — |

### 3.3 Design DNA usage

* **Deep Navy** — the deep field (`.hh-deepfield`): overhead pool, two angled shafts, a horizon
  band with an Edge-illumination floor line, all shipped surface tokens. Not Horizon.
* **Glass** — exactly three `.ds-glass-elevated` surfaces (hero instrumentation, case inspector,
  closing decision surface). No soft tier, no blur on operational content, no nesting.
* **Edge** — every rule, rail, spine, plate tick and coordinate grid.
* **Beacon** — two decision points only: the case rail's human-approval step and gate G3.
* **Semantic reasoning tokens** — `evidence` (azure), `contradiction` (red), `missing` (amber,
  dashed), `hypothesis` (violet), `decision` (cyan): used **only** where those meanings occur, in
  the signature packets, the incident rail, the inspector, and the gate states.
* **Horizon** — **not used**. `PUBLIC_HOME_HORIZON_ALLOWLIST=NO_CHANGE`; the single-consumer
  gate in `phase104-d2-visual-pilot.test.tsx` still holds.
* **Rail / Command / Triad** — not consumed; they belong to the authenticated shell.

### 3.4 Content integrity

* No stock imagery. No `<Image>` on the route (asserted).
* No fabricated telemetry, KPI, customer or logo. The Pump P-204 case is the pre-existing
  illustrative `publicSite.evidence` copy and is captioned *"Illustrative product view — sample
  data, not live plant telemetry"* in every locale.
* No hardcoded text inside any SVG (asserted) — every label is HTML from the catalog, so the
  drawings mirror safely under RTL (`[dir="rtl"] .hh-sig-frame { transform: scaleX(-1) }`).
* Every URL, CTA destination, metadata field and canonical behaviour is unchanged.

## 4. Responsive, locale and accessibility evidence (production build)

| Viewport | en | de | fa |
|---|---|---|---|
| 1440×1024 | 7401 px, table | 7483 px, table | 7611 px, table |
| 768×1024 | 9670 px, table | 9821 px, table | — |
| 390×844 | **12964 px**, accordion | 13108 px, accordion | 13111 px, accordion |
| 320×568 | 13177 px, accordion | 13594 px, accordion | — |

* Document horizontal overflow: **none** at any viewport. The only element wider than the
  viewport is the CH04 backbone inside its own `overflow-x:auto` container — the controlled
  internal scroll the brief permits.
* Text clipping: none in en/fa. In de, only the intentionally off-screen skip link and (768px
  only) a pre-existing footer column heading outside this route's scope.
* `<h1>` ×1; heading order H1 → H2 → H3 throughout.
* Console errors on the production build: 0 on desktop; one transient `ERR_TIMED_OUT` on a
  mobile capture that was 0 on re-run.
* Reduced motion: every animation (`hh-packet`, `hh-gate-ready`, `hh-header-compact`) is inside
  `prefers-reduced-motion: no-preference`; measured `none` under `reduce`.

### 4.1 Mobile height — accepted exception

Target was ≤ 12 000 px. Delivered **12 964 px** at 390×844 (en). The remaining ~960 px is real
engineering content — four planes with four dedicated cells each and the case narrative — which
the owner directed must not be compressed or removed to hit the number. **Exception accepted by
the owner.**

### 4.2 The gate — two representations, one exposed

Both the desktop `<table>` and the mobile `<details>` accordion **exist in the DOM**;
`md:hidden` / `hidden md:block` do not remove markup. Exactly one is visually rendered and exposed
to the accessibility tree at each supported viewport (`display:none` removes a subtree from the
a11y tree and tab order in every engine). Neither representation carries an `id` or an
`aria-labelledby`/`aria-describedby` reference, so the hidden twin can never create a duplicate id
or a dangling ARIA reference; the table's only accessible name is its `sr-only` caption. G3 is
`open` by default in the accordion; state is a structural marker **and** a text label in both.

### 4.3 Header under scroll

Measured at 0 / 25 / 50 / 75 / 100 % on en/fa × 1440/390: `top=0`, height 65 (57 on mobile),
logo fully visible, zero clipped children, no chapter heading pinned beneath the bar. The bar is
transparent over the hero and compacts to a 0.9-alpha deep-navy scrim over the first 160 px via a
scroll-driven CSS animation that is gated behind **both** `@supports (animation-timeline)` and
`prefers-reduced-motion: no-preference`; the animation's end state equals the base state, so a
non-supporting browser and a supporting browser at scroll ≥ 160 px render the same bar. A
`@supports not (color-mix)` fallback yields an opaque bar on very old engines.

### 4.4 Anchor offset

Every chapter heading (`*-title`) and the skip-link target (`#public-content`) carries
`scroll-margin-block-start: var(--hh-anchor-offset)`, where
`--hh-anchor-offset = calc(4rem + var(--space-card))` — the header's md+ block-size (`h-16`)
plus the shipped 20 px spacing gap. Logical property, so RTL needs no mirror rule.

## 5. Cleanup candidates — NOT removed yet

| File | Status |
|---|---|
| `src/components/public-site/PublicHero.tsx` | Unreferenced by any route since round 2. Still exercised by its own tests. **Delete after the public-route migration completes and no new consumer has appeared.** |
| `src/components/public-site/HomeStorySection.tsx` | Same. The four approved industrial photographs it renders remain on disk and safe to reuse elsewhere if a later surface is approved to. |

## 6. What this increment did NOT touch

Journal / Login / Dashboard redesigns; the Horizon allowlist; any shared public-site primitive
(`SectionHeader`, `CapabilityGrid`, `TrustSection`, `PublicCta` still serve `/platform`); any
gated token family; authentication, RBAC, API contracts, Prisma, deployment; Phase 106.

## 7. Next

`NEXT_ACTION=CI_AND_CODEX_COMMIT_REVIEW`. After CI on the pushed commit, the next reference
surface is selected by the owner. PR #63 stays Draft until Phase 104 is complete.

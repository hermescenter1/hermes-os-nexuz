# PHASE 87A — Hermes OS Brand System

Status: PROPOSED — pending design review. No production code changed.
Source of truth once approved: the Figma file described in `04-figma-construction-spec.md`.

---

## 1. Brand positioning

**Official category:** Premium Industrial Intelligence Platform.

**Hermes must visually communicate:** industrial intelligence, engineering precision,
operational trust, enterprise security, explainable reasoning, controlled power,
human-guided AI, safe industrial action, evidence-based decision-making.

**Hermes must never read as:** a generic chatbot, a gaming interface, a cyberpunk
concept, a crypto dashboard, a consumer AI toy, a generic SaaS template, a
landing-page-only product, or an over-decorated neon dashboard.

**Target visual combination:**
Industrial Control Room + Engineering Workstation + Enterprise Command Center +
Explainable AI Laboratory.

**Personality:** precise, intelligent, industrial, secure, premium, calm,
authoritative, future-ready.

**Core principle:** *Power without visual noise.*
Every visual element must carry information. Decoration budget is zero; the
existing Phase 51C principle ("Signal is reserved for active states and primary
CTAs only") is retained and extended to the new cyan.

### Positioning deltas vs. the current implementation (evidence-based)

The current system ([globals.css](../../../src/app/globals.css)) is already
philosophically aligned ("Dark ≠ dramatic. Dark = professional.") but has
accreted five generations of styling (Phases 51C, 54, 55A, 55B, 72.5F):

| Current | 87A decision |
|---|---|
| Signal color is **teal `#1EC8A4`** | Brand primary becomes **Hermes Cyan `#16D9E3`**; teal retired |
| `--ice #60B4F0` doubles as info accent | Split into **Hermes Ice `#8BF4F8`** (brand-light) and **Information Blue `#54A6FF`** (semantic info) |
| No dedicated success green (teal doubles as "healthy" and "brand") | **Signal Green `#38D996`** added; brand ≠ status, ends the teal ambiguity |
| No reasoning color | **Diagnostic Violet `#8B7CFF`** added for hypothesis/simulation/model-assisted output |
| `--hermes-gold #C4A028` "Knowledge Gold" | Retire from the core palette; knowledge surfaces use Azure. Gold survives only in legacy `hs--knowledge` badges until PHASE 87B migration |
| `.hs-card-depth` / `.hs-led-card` LED under-glow, `.landing-scanlines` (Phase 72.5F) | **Retire.** Violates "no excessive neon/glow"; replaced by the restrained Elevation system (§7) |
| Estedad (display) + Vazirmatn (body) for **both** locales | **Inter** (English UI) + **Vazirmatn** (Persian). Estedad's retirement is a design-review decision — see §5 open question |
| 3 competing surface systems (`.panel*`, `.card-*`, `.h-s0..h-s4`) + 3 glass tiers | One 5-level elevation scale + one 3-tier glass policy (§7, §8) |

---

## 2. Tagline system

- **Primary EN:** Industrial Intelligence. Engineered for Action.
- **Primary FA:** هوش صنعتی؛ از شواهد تا اقدام ایمن
- **Secondary EN descriptor:** Engineering Intelligence for Industrial Operations.

### Tagline test matrix (all seven surfaces must be validated in Figma page `01 — Brand Strategy`)

| Surface | Layout rule | EN | FA |
|---|---|---|---|
| Homepage hero | Display style, two lines max, period-separated clauses stacked allowed | ✔ test at 1440/768/390 | ✔ RTL, semicolon `؛` retained |
| Platform page | H1 + secondary descriptor as subtitle | ✔ | ✔ |
| Login screen | Title Large, under logo, single line | ✔ | ✔ |
| Sales presentation header | 16:9 frame, tagline + logo lockup, left/start aligned | ✔ | ✔ mirrored |
| Report cover | A4 portrait, print-safe (see existing `ib-report-print` print rules) | ✔ | ✔ |
| Social banner | 1200×630, tagline max 60% width | ✔ | ✔ |
| Product loading screen | Caption size, under Intelligence Pulse mark | ✔ | ✔ |

Rules: never letter-space Persian (`:lang(fa) { letter-spacing: 0 }` already
enforced); never break the EN tagline mid-clause; the FA tagline uses the
Persian semicolon `؛` and must keep «اقدام ایمن» unbroken on one line.

---

## 3. Color system

### 3.1 Primitive palette (official)

| Token | Hex | Role |
|---|---|---|
| Hermes Obsidian | `#071018` | App background base |
| Obsidian Deep | `#040A0F` | Deepest layer, full-screen engineering mode, hero voids |
| Surface Primary | `#0C1720` | Default card/panel surface |
| Surface Elevated | `#11212C` | Raised panels, popovers, secondary nav |
| Surface Interactive | `#152A36` | Hover/selected fills, input surfaces |
| Hermes Cyan | `#16D9E3` | Brand primary — CTAs, active states, live signal |
| Hermes Ice | `#8BF4F8` | Brand light — focus rings, highlights on cyan, Signal Line gradient end |
| Hermes Cyan Deep | `#0795A5` | Pressed states, cyan on light surfaces, chart series |
| Intelligence Azure | `#3B82F6` | Intelligence, evidence, analytics, predictions |
| Diagnostic Violet | `#8B7CFF` | Hypothesis, simulation, model-assisted reasoning |
| Text Primary | `#EDF7FA` | Primary text |
| Text Secondary | `#A9BAC6` | Secondary text |
| Text Muted | `#708694` | Metadata, captions (restrictions in §3.4) |
| Text Disabled | `#495C68` | Disabled text only |
| Border Default | `#203743` | Structural separation (non-interactive) |
| Border Active | `#21C9D5` | Active/selected component boundary |
| Signal Green | `#38D996` | Healthy, verified, safe, connected |
| Industrial Amber | `#F5B942` | Warning, incomplete evidence, review required |
| Safety Red | `#F05D68` | Danger, contradiction, failed interlock, destructive |
| Information Blue | `#54A6FF` | Informational status |

### 3.2 Distribution rule (enforced in every screen review)

- **70%** dark Obsidian surfaces
- **20%** typography, borders, neutral elements
- **7%** Hermes Cyan + Intelligence Azure
- **3%** status colors and critical highlights

Hermes Cyan must remain visually valuable. Cyan borders, glows, and gradients on
every surface are prohibited. A screen where cyan exceeds ~7% of pixels fails
review.

### 3.3 Semantic status discipline

| Color | Means | Never used for |
|---|---|---|
| Green | healthy · verified · safe · connected | decoration, brand accents |
| Amber | warning · incomplete evidence · review required | highlights, "premium gold" styling |
| Red | danger · contradiction · failed interlock · destructive action | emphasis, badges of importance |
| Violet | hypothesis · simulation · model-assisted reasoning | decorative gradients |
| Azure | intelligence · evidence · analytics · predictions | generic links everywhere |

Status must never be communicated by color alone (WCAG 1.4.1): every status
treatment pairs color with an icon or text label (see Operational Status Strip,
§9.8).

### 3.4 Contrast evidence (computed WCAG 2.x ratios)

Measured 2026-07-16 for this spec (all values ✔ = passes AA 4.5:1 normal text):

| Foreground | on Obsidian `#071018` | on Surface Primary `#0C1720` | on Surface Elevated `#11212C` | on Surface Interactive `#152A36` |
|---|---|---|---|---|
| Text Primary | 17.59 ✔ | 16.64 ✔ | 15.09 ✔ | 13.62 ✔ |
| Text Secondary | 9.60 ✔ | 9.08 ✔ | 8.24 ✔ | 7.43 ✔ |
| Text Muted | 5.04 ✔ | 4.77 ✔ | **4.33 ✖** | **3.90 ✖** |
| Hermes Cyan | 11.01 ✔ | 10.41 ✔ | 9.45 ✔ | 8.52 ✔ |
| Intelligence Azure | 5.21 ✔ | 4.93 ✔ | **4.47 ✖** | **4.03 ✖** |
| Diagnostic Violet | 5.86 ✔ | 5.54 ✔ | 5.03 ✔ | **4.54 ✔ (borderline)** |
| Signal Green | 10.52 ✔ | 9.95 ✔ | 9.03 ✔ | 8.14 ✔ |
| Industrial Amber | 10.85 ✔ | 10.27 ✔ | 9.31 ✔ | 8.40 ✔ |
| Safety Red | 5.90 ✔ | 5.58 ✔ | 5.06 ✔ | 4.57 ✔ |
| Information Blue | 7.55 ✔ | 7.14 ✔ | 6.48 ✔ | 5.84 ✔ |

**Binding usage rules derived from the data:**

1. **Text Muted** may not be used for normal-size text on Surface Elevated or
   Surface Interactive. On those surfaces use Text Secondary, or restrict Muted
   to large text (≥24px / ≥18.7px bold, 3:1 rule).
2. **Azure as text** on Elevated/Interactive surfaces must be large text or a
   badge with a Text Primary label; body-size azure text belongs on
   Obsidian/Surface Primary only.
3. **Filled buttons use dark text**: Obsidian on Cyan = 11.01 ✔, on Green =
   10.52 ✔, on Amber = 10.85 ✔, on Red = 5.90 ✔. White-on-red (2.98 ✖) and
   white-on-azure (3.38 ✖) are prohibited for normal text.
4. **Text Disabled** (2.75) is exempt per WCAG (disabled controls), but never
   use it for content the user must read.
5. **Border Default** (1.54 non-text contrast) is structural decoration only.
   Interactive component boundaries that carry meaning (inputs, toggles) must
   reach 3:1 (WCAG 1.4.11) — use Border Active, a Text Muted-level border
   (`#708694` at ≥3:1), or rely on fill contrast.

### 3.5 Migration map from current tokens

| Current CSS var (globals.css) | Value | 87A replacement |
|---|---|---|
| `--bg` | `#06080D` | Hermes Obsidian `#071018` |
| `--hermes-black` | `#010208` | Obsidian Deep `#040A0F` |
| `--surface` | `#0C1420` | Surface Primary `#0C1720` |
| `--surface-2` | `#111C2A` | Surface Elevated `#11212C` |
| `--surface-3` | `#172234` | Surface Interactive `#152A36` |
| `--line` | `#1E2E40` | Border Default `#203743` |
| `--line-2` | `#27394F` | Border Default (hover ladder folded into elevation) |
| `--ink` | `#F0F4F8` | Text Primary `#EDF7FA` |
| `--muted` | `#8A9BB0` | Text Secondary `#A9BAC6` |
| `--faint` | `#4A5A6E` | Text Muted `#708694` / Text Disabled `#495C68` (split by role) |
| `--signal` (teal) | `#1EC8A4` | Hermes Cyan `#16D9E3` (brand) — *not* Signal Green; audit each usage: "active/CTA" → Cyan, "healthy" → Green |
| `--ice` | `#60B4F0` | Information Blue `#54A6FF` (info) or Intelligence Azure (analytics) — audit per usage |
| `--steel` | `#B8C8D8` | Text Secondary (labels) — steel retired |
| `--warn` | `#D97706` | Industrial Amber `#F5B942` |
| `--danger` | `#DC2626` | Safety Red `#F05D68` |
| `--hermes-gold` | `#C4A028` | Retired (knowledge → Azure) |
| — (new) | — | Hermes Ice, Cyan Deep, Azure, Violet, Border Active, Signal Green, Information Blue |

The `--signal` split is the riskiest migration: today teal means *both* "brand
CTA" *and* "healthy/confident" (e.g. `.hs--confident`, `.h-confidence-bar`).
Every consumer must be classified during PHASE 87B, not find-and-replaced.

---

## 4. Color rationale

- **Obsidian family** (blue-black, not pure black): reads as a control-room
  ambient rather than OLED-void; keeps enough luminance separation for a
  5-step surface ladder without borders doing all the work.
- **Cyan as brand**: cyan is the color of instrumentation and live signal in
  industrial HMIs; at `#16D9E3` it holds 11:1 on Obsidian, so the brand color
  is itself an accessible functional color — no "brand vs. accessible variant"
  fork needed on dark surfaces.
- **Azure ≠ Cyan**: separating *intelligence/evidence* (Azure) from *brand/
  action* (Cyan) lets the Industrial Brain color-code reasoning without
  spending brand equity; it also survives color-vision deficiency better than
  a teal/green pairing (deuteranopia collapses teal↔green, which is exactly
  the current system's weakness — brand teal vs. healthy green).
- **Violet for hypothesis**: model-assisted output must be visually
  *quarantined* from verified fact. Violet appears nowhere else in the UI, so
  a violet element can always be read as "this is inference, not observation."
- **Warm colors only as status**: amber/red never appear decoratively, so
  peripheral vision can treat any warm pixel as an operational event.

---

## 5. Typography

### 5.1 Families

| Script | Family | Loading |
|---|---|---|
| English UI | **Inter** (variable) | self-hosted via `next/font` in 87B; never CDN |
| Persian UI | **Vazirmatn** (variable) | already in use; keep |
| Technical/mono | ui-monospace stack (`Cascadia Code`, `SFMono-Regular`) | keep; Persian contexts fall back to Vazirmatn as today (`:lang(fa) .font-mono` rule) |

- Tabular numbers (`font-variant-numeric: tabular-nums`) are mandatory for
  KPIs, engineering data, timestamps, and measurements (already the pattern in
  `.cmd-kpi-value` / `.exec-kpi-value` / `.intel-kpi-value`).
- **Open question for design review:** the current display face is **Estedad**
  (both locales). 87A direction is Inter (EN) + Vazirmatn (FA) for UI text.
  Options: (a) retire Estedad entirely; (b) keep Estedad as FA display-only
  face for marketing heroes. The Figma type page must show both options on the
  Homepage hero before a decision. Until approved, no font change ships.

### 5.2 Text styles (Figma styles, page `04 — Typography`)

Sizes in px @1440 desktop; LH = line-height. Every style exists in an EN (Inter)
and FA (Vazirmatn) version; FA line-heights are taller (current system already
enforces FA body LH 1.9, headings 1.4–1.45 — retained).

| Style | Size | Weight | LH (EN) | LH (FA) | Notes |
|---|---|---|---|---|---|
| Display | 56–96 (clamp) | 800 | 1.05 | 1.3 | marketing hero only; tracking −2.5% EN, 0 FA |
| H1 | 40 | 800 | 1.1 | 1.4 | page titles |
| H2 | 32 | 700 | 1.15 | 1.4 | |
| H3 | 24 | 700 | 1.2 | 1.45 | |
| H4 | 20 | 650 | 1.25 | 1.45 | |
| Title Large | 18 | 650 | 1.3 | 1.5 | modal/drawer titles |
| Title | 16 | 600 | 1.35 | 1.55 | card titles |
| Subtitle | 14 | 500 | 1.4 | 1.6 | Text Secondary color |
| Body Large | 16 | 400 | 1.65 | 1.9 | long-form reading |
| Body | 14 | 400 | 1.6 | 1.9 | default app body (desktop density) |
| Body Compact | 13 | 400 | 1.5 | 1.75 | dense tables only, desktop only |
| Label | 13 | 550 | 1.35 | 1.5 | form labels, buttons |
| Label Compact | 12 | 550 | 1.3 | 1.5 | table headers, chips |
| Caption | 12 | 400 | 1.4 | 1.6 | metadata, timestamps |
| Technical Data | 13 mono | 450 | 1.45 | 1.6 | IDs, telemetry, tags; tabular-nums |
| KPI Large | 44–72 (clamp) | 700 mono | 1.0 | 1.1 | tabular-nums, tracking −4% EN |
| KPI Medium | 28–44 (clamp) | 700 mono | 1.0 | 1.1 | tabular-nums |
| Code / PLC Address | 13 mono | 500 | 1.45 | 1.45 | LTR always, even inside RTL (`dir="ltr"` island) |

**Floors:** desktop primary body never below 14px; mobile primary content never
below 14px; captions/labels 12px minimum; the current 9–10px mono labels
(`.kpi-label` 0.58rem, `.signal-text` 0.63rem, `.hs-badge` 0.60rem) are **below
the floor and must be raised to 12px equivalents** in 87B.

### 5.3 Persian rules

- `letter-spacing: 0` always (already enforced).
- Persian numerals: UI chrome (labels, nav, dates in FA locale) uses Persian
  digits via `Intl.NumberFormat('fa-IR')`; **engineering values, PLC addresses,
  tag names, and IDs always stay Latin digits and LTR** — they are technical
  identifiers, not prose. Each Figma FA frame annotates which numerals apply.
- ZWNJ correctness required in all FA copy (e.g. «می‌شود», «داده‌ها»).
- Persian `ی`/`ک` only, never Arabic `ي`/`ك`.
- Mixed-content validation: every FA reference screen includes at least one
  string mixing Persian + English term + number + PLC address
  (e.g. «فشار سنسور PT-4012 برابر 6.2 bar است») to validate bidi rendering.

---

## 6. Spacing and radius

**Spacing scale (px):** 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96.
Figma variables `Spacing/2 … Spacing/96`; Tailwind mapping in
`05-figma-token-mapping.md`.

**Radius scale (px):** 4, 6, 8, 12, 16, 20, Full.

| Context | Radius |
|---|---|
| Badges, status chips, table cells' inner controls | 4 |
| Inputs, buttons, segmented controls | 6 |
| Cards/panels in app workspaces | 8 |
| Modals, drawers, sheets | 12 |
| Marketing cards | 16 |
| Marketing heroes / feature panels | 20 |
| Avatars, status dots, pills | Full |

Industrial workspaces use the tight end (4–8); only marketing surfaces may use
16–20. The current mix (2px hs-badges to 12px rounded-xl cards) converges on
this scale. Avoid the "everything is a rounded card" look — dense workspaces
prefer bordered regions over floating cards.

---

## 7. Elevation system

Five levels replace the current three overlapping systems (`.panel*`,
`.card-enterprise/.card-surface`, `.h-s0..h-s4`) and the Phase 72.5F LED bloom:

| Level | Surface | Border | Shadow | Usage |
|---|---|---|---|---|
| E0 | Obsidian / Obsidian Deep | none | none | page ground, engineering void |
| E1 | Surface Primary | Border Default 1px | none | resting cards, panels, table containers |
| E2 | Surface Elevated | Border Default 1px | `0 2px 8px rgba(0,0,0,0.25)` | raised panels, dropdowns, popovers |
| E3 | Surface Elevated | Border Default 1px | `0 8px 24px rgba(0,0,0,0.4)` | modals, drawers, command palette (pairs with glass, §8) |
| E4 | Surface Interactive | Border Active 1px | `0 12px 32px rgba(0,0,0,0.5)` | critical confirmations, Safe Action approval gate |

Rules: elevation communicates importance, not decoration; hover may raise one
level's *shadow* (not surface color jumps); **no colored glows** — the single
sanctioned colored shadow is the Hermes Focus State (§9.6) and a ≤8%-alpha cyan
ambient on the E4 Safe-Action gate. `.hs-card-depth` LED bloom, `.hs-led-card`
sweep, `.glow-*`, `.text-glow*`, and `.landing-scanlines` are retired.

---

## 8. Glassmorphism policy

Foundation recipe (single sanctioned glass):

- Surface: `rgba(12, 23, 32, 0.78)` (Surface Primary @ 78%)
- Border: `rgba(139, 244, 248, 0.10)` (Hermes Ice @ 10%)
- Backdrop blur: 12–18px

**Allowed:** modals, floating toolbars, command overlays, context panels, Brain
insight cards, hero feature panels, temporary overlays.
**Prohibited:** dense data tables, long forms, large document views, dashboard
cards by default, high-frequency operational data.

Readability always beats effect: any glass surface with body text must still
pass 4.5:1 against the *worst-case* backdrop; if the backdrop is uncontrolled
(scrolling content), raise opacity to ≥0.88 (the current `.glass` value) or use
a solid E3 surface. The three current tiers (`.glass`, `.glass-deep`,
`.glass-light`, plus `.landing-glass`) collapse into one recipe with an
opacity parameter (0.78 default / 0.88 over uncontrolled content / 0.94 for
full-screen overlays).

---

## 9. Hermes signature patterns

Each pattern gets a Figma component (page `08 — Application Patterns`) with
usage rules, prohibited usage, RTL behavior, mobile behavior, and accessibility
notes — summarized here, specified fully in `04-figma-construction-spec.md` §7.

### 9.1 Hermes Signal Line
Thin (1–2px) cyan data-flow line: gradient `transparent → Hermes Cyan → Hermes
Ice → transparent`, optional 2.2s directional sweep (derived from the existing
`hSignalFlow` keyframe — the one Phase 54 motion worth keeping).
**Use:** live connections, evidence flow, selected graph paths. **Never:** as a
generic divider or decorative underline. **RTL:** sweep direction follows
reading direction (`translateX` sign flips under `[dir="rtl"]`); data-flow
direction between fixed endpoints (e.g., PLC→gateway) is *semantic* and does
not flip. **Mobile:** static gradient (no sweep) below 768px. **A11y:** purely
supplementary; the connection state it shows must also exist as text; sweep
disabled under `prefers-reduced-motion`.

### 9.2 Intelligence Pulse
Slow opacity pulse (0.38→1.0, ≥2.4s period — the existing `hReasonPulse`
timing) on a small cyan indicator dot/ring.
**Use:** exactly one per view, on the element representing active analysis.
**Never:** on multiple simultaneous elements, buttons, or as loading spinner.
**RTL:** none (radially symmetric). **Mobile:** identical. **A11y:** paired
with visible text ("Analyzing…") and `aria-live="polite"` status; static under
reduced motion.

### 9.3 Evidence Rail
Vertical reasoning structure listing Evidence / Contradiction / Context /
Missing data / Confidence / Decision as typed rows on a 2px rail; row markers:
Azure (evidence), Red (contradiction), Neutral (context), Amber dashed
(missing), band (confidence), Cyan (decision).
**Use:** Industrial Brain, case detail, analysis reports. **Never:** as a
generic timeline or changelog. **RTL:** rail sits inline-start (right in FA);
markers mirror; content alignment follows locale. **Mobile:** rail collapses to
stacked cards with a typed left/start border, grouped by type with counts.
**A11y:** semantic list with per-row type prefix text ("Evidence:", «شاهد:»);
never color-only typing.

### 9.4 Safe Action Path
Gated horizontal (desktop) / vertical (mobile) sequence: Proposed → Validated →
Approved → Executed, with hard gate markers between stages; blocked gates are
Amber/Red with reason; human-approval gate is always E4-elevated with Border
Active.
**Use:** any action that changes industrial state. **Never:** for generic
wizards/checkout-style flows. **RTL:** progression follows reading direction
(FA: right→left); stage icons that encode "forward" mirror. **Mobile:**
vertical stepper, current stage expanded. **A11y:** each gate is a labeled
step (`aria-current="step"`); gate state announced as text; approval button
inside the gate needs explicit confirmation affordance (no single-click
destructive execute).

### 9.5 Industrial Grid
Low-contrast technical grid, `rgba(237,247,250,0.015)` lines at 64px (the
existing `.landing-grid` recipe, demoted from marketing to engineering use).
**Use only in:** Industrial Brain, Digital Twin, Knowledge Graph, engineering
canvases. **Never:** marketing pages, dashboards, forms. **RTL:** none
(symmetric). **Mobile:** may be dropped entirely for performance. **A11y:**
decorative (`aria-hidden`), must not reduce text contrast above it — text
sits on solid panels, not raw grid.

### 9.6 Hermes Focus State
2px Hermes Cyan outline + 2px offset + outer 1px Hermes Ice halo (visible on
both dark and cyan-filled elements). Replaces the current teal
`:focus-visible`.
**Use:** every focusable element, keyboard-triggered only (`:focus-visible`).
**Never:** suppressed, or replaced by color-change-only focus. **RTL:** none.
**Mobile:** identical (also serves external-keyboard users). **A11y:** meets
WCAG 2.2 Focus Appearance; contrast of the ring against adjacent colors ≥3:1
(Cyan on Obsidian 11.01, Ice on Interactive 11.57 — both pass).

### 9.7 Confidence Bands
Discrete labeled bands — High (Green), Medium (Amber), Low (Red-orange),
Insufficient evidence (neutral hatch + Text Muted) — rendered as a segmented
horizontal band with an explicit text label and numeric value when available.
**Use:** Brain confidence, prediction quality, data completeness. **Never:** a
continuous red→green gradient implying false precision (the current
`.h-confidence-bar` gradient is retired for this reason). **RTL:** band order
follows reading direction; numeric stays Latin digits. **Mobile:** identical
proportions, min touch target on interactive bands. **A11y:** label + value
always in text; the four bands also differ in *pattern* (solid/solid/solid/
hatched) so the scale survives grayscale.

### 9.8 Operational Status Strip
Compact strip of status cells for Site / Gateway / Asset / Process / Connection
/ Safety state: each cell = status dot (Green/Amber/Red/Neutral) + Label
Compact text + optional count, on E1 surface (derived from the existing
`.global-ops-strip`, restyled).
**Use:** dashboard headers, command center, site/asset detail headers.
**Never:** as decorative KPI chrome; never color-only dots without labels.
**RTL:** cell order mirrors; counts follow locale numeral policy (§5.3).
**Mobile:** horizontal scroll with snap, or two-row wrap above 6 cells; each
cell ≥44px touch target when tappable. **A11y:** each cell is one announced
unit ("Gateway: 12 connected, 1 warning"); pulse on state change respects
reduced motion.

---

## 10. Motion principles

- Durations: 150ms (micro), 220ms (standard), 380ms (large surfaces) — the
  existing `--t-fast/mid/slow` ladder is kept.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo) for entrances,
  `(0.4, 0, 0.2, 1)` for continuous motion — both already defined.
- Motion communicates state change only: entrance of new evidence, gate
  unlocking, live data arrival. No ambient/looping decoration except the two
  sanctioned live-state patterns (Signal Line sweep, Intelligence Pulse).
- Retired: `lFloat`, `lOrbit`, `ambientPulse`, `hLedSweep`, scanlines.
- `prefers-reduced-motion` fully honored (mechanism already exists in
  globals.css and is retained; sanctioned patterns fall back to static).
- Prototype transitions in Figma: Smart Animate 200ms out-expo for overlays;
  instant for tab/nav changes (operational software must feel immediate).

# PHASE 87A — Figma Construction Specification

**Status: NO REAL FIGMA FILE EXISTS YET.** Neither the TalkToFigma bridge nor
the official Figma MCP connector had a live authorized connection during this
phase, so per the phase rules nothing was created in Figma and nothing below
claims to exist. This document is the exact construction plan to be executed
the moment a Figma workspace connection is available. Production UI
implementation must not begin before these artifacts exist and are reviewed.

**File name:** `Hermes OS — Design System & Product (87A)`
**Team/library:** publish `02–08` pages as the team library `Hermes DS`.

---

## 1. Page structure (27 pages, exact names)

```
00 — Cover
01 — Brand Strategy
02 — Foundations
03 — Variables and Tokens
04 — Typography
05 — Icons and Data Visualization
06 — Core Components
07 — Navigation and Shell
08 — Application Patterns
09 — Public Website
10 — Authentication
11 — Dashboard and Command Center
12 — Copilot
13 — Industrial Brain
14 — Knowledge and Library
15 — Knowledge Graph
16 — Digital Twin
17 — Operational Modules
18 — Business Modules
19 — Admin and Portals
20 — Persian RTL
21 — English LTR
22 — Responsive
23 — Accessibility
24 — Prototype
25 — Developer Handoff
26 — Deprecated and Exploration
```

Frame naming convention: `Screen/Breakpoint/Locale/State`, e.g.
`Dashboard/Desktop/EN/Default`, `Dashboard/Mobile/FA/Loading`,
`IndustrialBrain/Desktop/FA/EvidenceOpen`.

Reference frame sizes: Desktop **1440×1024**, Tablet **768×1024**, Mobile
**390×844**. Marketing pages use full-height frames (1440×N).

`00 — Cover`: product name, tagline lockup (EN over FA), version, status
(Draft/In Review/Approved), owners, link to this spec, changelog table.

---

## 2. Variable collections (page 03)

Ten collections. Primitives are private (hidden from publishing); everything
downstream aliases primitives — components never reference primitives
directly.

### 2.1 `Primitive Colors` (single mode)

`obsidian/900 #040A0F · obsidian/800 #071018 · obsidian/700 #0C1720 ·
obsidian/600 #11212C · obsidian/500 #152A36 · cyan/500 #16D9E3 · cyan/300
#8BF4F8 · cyan/700 #0795A5 · azure/500 #3B82F6 · violet/400 #8B7CFF ·
neutral/100 #EDF7FA · neutral/300 #A9BAC6 · neutral/500 #708694 · neutral/700
#495C68 · border/600 #203743 · border/active #21C9D5 · green/400 #38D996 ·
amber/400 #F5B942 · red/400 #F05D68 · blue/400 #54A6FF · white #FFFFFF (for
alpha aliases only)`

### 2.2 `Semantic Colors` (modes: `Default`; reserved future mode `Light`)

| Variable | Aliases |
|---|---|
| Color/Background/Base | obsidian/800 |
| Color/Background/Deep | obsidian/900 |
| Color/Surface/Primary | obsidian/700 |
| Color/Surface/Elevated | obsidian/600 |
| Color/Surface/Interactive | obsidian/500 |
| Color/Surface/Glass | obsidian/700 @ 78% |
| Color/Brand/Primary | cyan/500 |
| Color/Brand/Hover | cyan/300 |
| Color/Brand/Pressed | cyan/700 |
| Color/Brand/OnBrand | obsidian/800 (text on cyan fills — contrast 11.01) |
| Color/Text/Primary | neutral/100 |
| Color/Text/Secondary | neutral/300 |
| Color/Text/Muted | neutral/500 |
| Color/Text/Disabled | neutral/700 |
| Color/Border/Default | border/600 |
| Color/Border/Active | border/active |
| Color/Border/Glass | cyan/300 @ 10% |
| Color/Status/Success | green/400 |
| Color/Status/Warning | amber/400 |
| Color/Status/Danger | red/400 |
| Color/Status/Information | blue/400 |
| Color/Reasoning/Hypothesis | violet/400 |
| Color/Reasoning/Evidence | azure/500 |
| Color/Reasoning/Contradiction | red/400 |
| Color/Reasoning/Missing | amber/400 (paired with dashed style) |
| Color/Reasoning/Decision | cyan/500 |
| Color/Focus/Ring | cyan/500 |
| Color/Focus/Halo | cyan/300 |

Plus alpha ladders for each status color: `…/SuccessSubtle` etc. = color @ 10%
fill + @ 24% border (matching the existing `.hs-badge` recipe of 9%/24%).

### 2.3 `Typography` (modes: `EN`, `FA`)

Variables: `Type/Family/Display`, `Type/Family/Body`, `Type/Family/Mono`
(EN mode: Inter/Inter/mono-stack; FA mode: Vazirmatn/Vazirmatn/Vazirmatn —
pending the Estedad design-review decision, see brand doc §5.1), plus
`Type/Size/*` numbers for the scale in §5.2 of the brand doc and
`Type/LineHeight/*` per mode (FA taller).

### 2.4 `Spacing` — `Spacing/2 4 6 8 12 16 20 24 32 40 48 64 80 96` (numbers).
### 2.5 `Radius` — `Radius/4 6 8 12 16 20 Full(999)`.
### 2.6 `Elevation` — effect styles E0–E4 exactly as brand doc §7.
### 2.7 `Motion` — `Motion/Duration/Fast=150 Mid=220 Slow=380`,
`Motion/Easing/Enter=cubic-bezier(0.16,1,0.3,1)`, `…/Continuous=(0.4,0,0.2,1)`.
### 2.8 `Layout` — `Layout/Container/Marketing=1200`, `Layout/Container/App=100%`,
`Layout/Sidebar/Expanded=264`, `Layout/Sidebar/Collapsed=64`,
`Layout/Topbar=56`, `Layout/ContextPanel=360`, `Layout/Grid/Desktop=12col·24gutter`,
`Layout/Grid/Tablet=8col·20gutter`, `Layout/Grid/Mobile=4col·16gutter`,
`Layout/TouchTarget/Min=44`.
### 2.9 `Data Visualization` — ordered categorical series:
`Chart/Series/1=cyan/500 · 2=azure/500 · 3=violet/400 · 4=blue/400 ·
5=neutral/300 · 6=cyan/700`; `Chart/Grid=border/600`, `Chart/Axis=neutral/500`,
`Chart/Positive=green/400`, `Chart/Negative=red/400`, `Chart/Threshold=amber/400`.
Status colors are **not** in the categorical ramp (semantic reservation).
### 2.10 `Directionality` (modes: `LTR`, `RTL`) — `Dir/Align/Start`,
`Dir/Align/End`, `Dir/IconFlip` (boolean), used by components that must mirror;
all padding/margin in components uses start/end semantics via Auto Layout so
most mirroring is automatic.

---

## 3. Typography page (04)

One frame per text style (18 styles from brand doc §5.2) × two locale modes,
each showing: the style spec, an EN sample, an FA sample, and a mixed
bidi sample line («فشار سنسور PT-4012 برابر 6.2 bar است»). A "floors" panel
documents the 14px body minimum and the 12px caption minimum, and flags the
current sub-floor styles to be raised in 87B (`.kpi-label` 9.3px,
`.signal-text` 10px, `.hs-badge` 9.6px).

---

## 4. Icons and Data Visualization (05)

- Icon grid 24×24 (20 and 16 sizes derived), 1.5px stroke, round caps —
  instrument-panel character, no filled blobs.
- Directional-icon policy table: arrows/chevrons/back mirror in RTL;
  play/media, clock rotation, checkmarks, and physical-flow icons (pipe flow
  direction) do **not** mirror.
- Chart specimens using the `Data Visualization` collection: line (trend),
  area (band/confidence), bar, status donut, sparkline, threshold chart with
  amber threshold line. Each specimen has an RTL variant (value axis mirrors,
  Latin digits retained for engineering values).

---

## 5. Core component library (06)

Build order: primitives → composites → patterns → shell → screens. All
components: Auto Layout, Variables only (no raw hex), variants + component
properties, and where relevant `Direction=LTR|RTL` and
`Breakpoint=Desktop|Tablet|Mobile` properties. Required states everywhere
applicable: Default, Hover, Focus, Pressed, Selected, Disabled, Loading,
Error, Success, Read-only.

| Component | Variants / properties (beyond states) |
|---|---|
| Button/Primary | Size S(28)/M(36)/L(44) · icon start/end (boolean) · cyan fill, OnBrand text |
| Button/Secondary | outline: Border Default → Border Active on hover; Surface Interactive fill on hover |
| Button/Tertiary | text-only; underline on hover |
| Button/Destructive | Safety Red fill + Obsidian text (contrast rule) |
| Button/Icon | Size 28/36/44 · tooltip slot · `aria-label` note |
| Button/Split | primary action + menu chevron (chevron mirrors RTL) |
| Input | label, help, error slots · prefix/suffix icon · sizes M/L · Read-only |
| Textarea | auto-grow note · counter slot |
| Search input | leading search icon (does not mirror) · clear button (end) |
| Select / Combobox | menu = E2 surface · multi-select tags variant |
| Checkbox / Radio | 20px control · label start/end aware · indeterminate (checkbox) |
| Switch | 36×20 · label position property · motion 150ms |
| Form field | composed label+control+message · required marker · RTL label alignment |
| Validation message | Status icon + text (Danger/Warning/Success/Info) |
| Tabs | underline style · scrollable overflow · count badge slot |
| Segmented control | 2–5 segments · full-width variant (mobile) |
| Breadcrumb | chevron separator mirrors RTL · collapse-to-ellipsis ≥4 levels |
| Pagination | prev/next mirror RTL · compact (mobile) variant |
| Tooltip | E3 glass · 4 placements · 320px max width |
| Dropdown / Context menu | E2 · destructive item style · submenu chevron mirrors |
| Badge | Status × Subtle/Solid · dot variant · Label Compact, 12px floor |
| Status indicator | dot 8px + label (color-never-alone rule) · pulse variant (reduced-motion note) |
| Avatar | 24/32/40 · initials fallback (FA glyph test) · status dot slot |
| Card/Standard | E1 · header/body/footer slots · radius 8 |
| Card/KPI | KPI Medium value (tabular) · delta arrow (mirrors NOT — math sign) · label · sparkline slot |
| Card/Insight | Azure accent bar · confidence band slot · source line |
| Card/Evidence | Evidence Rail row style · type property (Evidence/Contradiction/Context/Missing) |
| Card/Risk | severity property · required mitigation slot |
| Data table | header (Label Compact) · row 44px · zebra off, border rows · sortable header · selection column · sticky header · numeric columns: tabular, end-aligned (LTR numerals in FA) |
| Data grid | dense 36px rows · desktop-only note + mobile summary-card strategy |
| Chart container | title + toolbar + legend slots · empty/loading/error states built in |
| Modal | E3 + glass · sizes 480/640/960 · focus-trap annotation |
| Drawer | end-side (mirrors RTL) · 360/480 · push vs overlay note |
| Sheet | bottom sheet (mobile) · drag handle · 50/90% detents |
| Toast | 4 status variants · action slot · `aria-live` note · stacks bottom-start |
| Alert | inline banner, 4 statuses · dismissible property |
| Skeleton | text/rect/circle · shimmer (existing `.shimmer` recipe) · reduced-motion static |
| Empty state | icon + title + body + action · compact variant |
| Error state | Safety Red icon + retry action · error-code line (mono) |
| Stepper | horizontal/vertical · gate variant (feeds Safe Action Path) |
| Timeline | direction follows locale · typed markers |
| Command palette | E3 glass 640px · search + grouped results · kbd hints (kbd glyphs stay LTR) |
| File item / Asset item / Site item / Gateway item | list-row composites: icon/thumb + Title + meta (Technical Data) + Operational Status cell + actions menu |
| Reasoning node | Knowledge-graph node: type property (Hypothesis/Evidence/Contradiction/Decision/Asset) colored per Reasoning tokens · selected = Border Active + Signal Line edge |

---

## 6. Navigation and Shell (07)

**Structure (desktop):** Sidebar (264 expanded / 64 collapsed) + Topbar (56) +
content region + optional Context panel (360, end side).

- **Sidebar:** logo lockup → workspace/org selector → site selector → global
  search trigger (⌘K / Ctrl+K) → grouped nav: **Intelligence** (Dashboard,
  Command Center, Copilot, Industrial Brain, Intelligence), **Operations**
  (Assets, CMMS, Predictive, Automation, Digital Twin), **Engineering**
  (Engineering, Documents/EDMS, Architecture), **Knowledge** (Library,
  Knowledge, Knowledge Graph, Academy, Articles), **Business** (ERP, CRM,
  Sales, ATS/Careers), **Administration** (Admin, Organizations, Billing,
  Compliance) → pinned modules section (user-curated) → recent modules (last
  3) → user card. Groups are collapsible; **role-based visibility** annotation
  per group (customer/vendor portal roles see only their portal group — matches
  existing RBAC; design must not imply access the backend denies).
- Nav item: 40px height, Label style, start-aligned icon 20px, active =
  Surface Interactive fill + 2px Border Active inline-start bar (mirrors in
  RTL — the existing `.nav-item` already uses `border-inline-start`, keep).
- **Topbar:** breadcrumb (mirrors) · center: persistent workspace context
  (org · site chips) · end cluster: global search, notifications (badge),
  language switch, user menu.
- **Context panel:** 360px end-side; hosts entity details, Copilot side
  session, Evidence Rail; closes to icon rail on tablet.
- **Command palette:** ⌘K overlay, E3 glass, grouped: Navigate / Actions /
  Entities / Help. Full keyboard spec annotated (↑↓ move, ↵ open, Tab group).
- **Tablet:** sidebar defaults collapsed (64); context panel becomes overlay
  drawer.
- **Mobile:** bottom tab bar (5 slots: Dashboard, Operations hub, +Ask Hermes
  center action, Knowledge, Menu) + full-screen drawer for the rest; topbar
  reduces to breadcrumb-less title + search + avatar.
- **Full-screen engineering mode:** topbar-only shell (no sidebar) on Obsidian
  Deep, for Digital Twin / Knowledge Graph / Brain canvases; exit affordance
  top-start.
- Frames: `Shell/{Desktop,Tablet,Mobile}/{EN,FA}/{Expanded,Collapsed,Drawer,
  CommandPalette,EngineeringMode}` — 20 frames minimum.

---

## 7. Application Patterns (08)

Component + spec sheet for the eight signature patterns (Signal Line,
Intelligence Pulse, Evidence Rail, Safe Action Path, Industrial Grid, Focus
State, Confidence Bands, Operational Status Strip) exactly per brand doc §9 —
each sheet includes: anatomy, do/don't pairs, RTL frame, mobile frame,
reduced-motion behavior, and screen-reader text equivalent.

---

## 8. Six reference screens (pages 09–13)

Every screen ships as: `Desktop/EN`, `Desktop/FA`, `Mobile/EN`, `Mobile/FA` +
`Loading` + (where applicable) `Empty` + `Error`, with interaction notes,
accessibility annotations (page 23 layer), and handoff notes (page 25).
Total ≥ 6 × 6 ≈ 36+ frames.

1. **Homepage** (page 09) — hero: tagline Display style over Obsidian with
   Industrial-Brain visualization (asset context node → Signal Line → Evidence
   Rail mini → ranked hypotheses → confidence band → Safe Action chip); NOT
   stock AI imagery. Supporting message, CTA pair (Primary: Request a Demo /
   Secondary: Explore the Platform), trust strip (industries/compliance),
   module overview (ModuleGrid restyled), how-it-works (evidence→decision→safe
   action), footer. Hero must communicate what/who/why/action in <10s.
2. **Platform page** (09) — capability architecture: five-layer platform
   diagram (data → knowledge → reasoning → decision → action), module cards by
   nav group, deep links.
3. **Login** (page 10) — split layout: form panel (E1, solid — no glass on
   forms) + brand panel (Obsidian Deep, Industrial Grid, tagline). States:
   default, error (validation message spec), loading. Mobile: single column,
   form first.
4. **Executive Dashboard** (page 11) — Operational Status Strip header, KPI
   row (Card/KPI ×4), main grid: trend chart container + insight cards
   (Azure), risk panel, activity/case stream. Empty state (new org) and
   loading (skeleton) variants.
5. **Hermes Copilot** (page 12) — an *engineering console*, not a chat toy:
   question composer (bounded input + context chips: org/site/asset), answer
   as structured blocks (claim + Evidence Rail refs + Confidence Band),
   history rail (start side), demo-mode banner variant (public demo is
   deterministic — reflect the existing `/api/copilot/demo` distinction),
   403/empty variants for non-authoring roles.
6. **Industrial Brain Workspace** (page 13) — full spec in §9 below.

Approval of these six freezes the visual language. Full rollout (pages 14–19)
is explicitly out of 87A scope and begins only after review.

## 9. Industrial Brain workspace (page 13)

Visual flagship. Desktop layout (1440, engineering mode shell):

- **Zone A (top, full width):** Engineering question bar + Asset/Site context
  chips + Symptom classification chips.
- **Zone B (start column, 320):** Hypothesis ranking — ordered cards with
  Confidence Band each; selected hypothesis drives zones C/D.
- **Zone C (center, fluid):** Neural reasoning map on Industrial Grid canvas —
  Reasoning nodes (typed per Reasoning tokens) with Signal Line edges for the
  selected path; distinguishes: known facts (solid Azure), supporting evidence
  (Azure), contradictions (Red), missing evidence (Amber dashed), model
  inference (Violet), deterministic rule output (solid neutral + mono tag),
  human decision (Cyan ringed).
- **Zone D (end column, 360):** Evidence Rail (Evidence / Contradictions /
  Context / Missing / Confidence calibration) + Risk assessment card.
- **Zone E (bottom strip):** Safe Action Path with human-approval gate (E4) →
  Report output / Save as Case / Analysis history actions.

Hierarchy: Question → Context → Hypotheses → Evidence → Confidence → Risk →
Safe Action Path → Report.
Mobile strategy: ordered task stages as a stepper (Question → Context →
Hypotheses → Evidence → Action); reasoning map opens node details in bottom
sheets; Evidence Rail becomes typed stacked cards.
States: Loading (Intelligence Pulse + staged skeletons), Empty (no analysis
yet — prompt-first layout), Error (analysis failed — Error state + retry),
Insufficient evidence (Confidence Band 4th state prominent).
FA frames validate mixed bidi content on nodes (tag IDs LTR inside RTL labels).

---

## 10. Responsive strategy (page 22)

Widths 1440 / 768 / 390. Never shrink-only; every complex module has an
explicit transformation, demonstrated on dedicated frames:

| Pattern | Mobile transformation |
|---|---|
| Multi-panel workspace (Brain, Twin) | ordered task stages (stepper) |
| Tabs | segmented control or drawer list |
| Graph/canvas detail | bottom sheets |
| Data tables | summary cards with key columns, or horizontal scroll with sticky first column — per-table decision annotated |
| Context panel | end drawer |
| KPI rows | 2-col grid, KPI Medium |
| Sidebar | bottom tabs + drawer (see §6) |

## 11. RTL / LTR (pages 20–21)

Page 20 holds FA masters of every reference screen; page 21 the EN masters.
A rules sheet covers: reading order, icon mirroring policy (§4), breadcrumb/
timeline/drawer direction, table alignment (text start-aligned, numerics
end-aligned + LTR digits for engineering values), chart label mirroring, form
label alignment, mixed technical content (PLC addresses always LTR islands),
and the numeral policy (brand doc §5.3). Components already carry
`Direction` variants; screens must be *reviewed* in FA, not machine-mirrored.

## 12. Accessibility (page 23)

Target WCAG 2.2 AA. Annotation layer over every reference screen: focus order
arrows, landmark map (header/nav/main/aside), heading outline, `aria-live`
regions (toasts, analysis status), focus-trap boundaries (modals, command
palette), touch-target overlays (≥44px), contrast callouts (using the measured
table in brand doc §3.4), color-independent status proof (grayscale copy of
the dashboard frame), reduced-motion behavior notes, chart text alternatives
(data table toggle per chart), and form label/error wiring notes.

## 13. Prototype flows (page 24)

Fifteen wired flows, restrained transitions (Smart Animate 200ms out-expo for
overlays, instant navigation otherwise):

1. Public visitor → Request Demo (homepage → demo form → success)
2. Login → Dashboard
3. Dashboard → Industrial Brain
4. Ask engineering question (Brain Zone A)
5. Review hypotheses (select → zones C/D update)
6. Inspect evidence (Evidence Rail → source detail)
7. Review missing evidence (Missing filter → request-data action)
8. View Safe Action Path (gate states walkthrough)
9. Save as Case (Brain → case form → confirmation)
10. Open Library article (Knowledge → article reader)
11. Open Knowledge Graph (article → graph node)
12. Select Organization and Site (topbar selectors)
13. Open Asset (asset list → asset detail)
14. Review Work Order (CMMS list → work order)
15. Mobile navigation flow (bottom tabs → drawer → module)

Flows 10–14 may link to grayboxes of pages 14–19 (rollout screens are 87B
scope); grayboxes are marked `Exploration` and live on page 26 if not
approved.

## 14. Developer handoff (page 25)

- Token export table = `05-figma-token-mapping.md` (embedded).
- Per-screen redlines: spacing variables named (not px), component + variant
  used, states inventory, RTL notes, content floors.
- Breakpoint behavior table per screen.
- Asset export conventions: SVG icons 24-grid, logo lockups (EN/FA), no raster
  hero imagery.
- "Definition of ready for 87B": screen approved in review, all states
  present, FA + EN frames present, a11y layer complete, tokens referenced.

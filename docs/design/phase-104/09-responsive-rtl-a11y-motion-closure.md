# Phase 104-H — Responsive, RTL, Accessibility and Motion Closure

```text
PHASE104_H_IMPLEMENTATION=COMPLETE (narrow review corrections applied)
LEGACY_SHELL_CLOSURE=PASS · LEGACY_MATRIX=90/90 · RESPONSIVE_CLOSURE=PASS (mechanics only — owner decisions A/B/C + German heading applied, §1b; NO visual acceptance, §13)
OWNER_DECISION_A=FULL_NAV_AT_1600_ONLY · OWNER_DECISION_B=LEGACY_WORDMARK_TEXT_HIDDEN_BELOW_SM · OWNER_DECISION_C=KEEP_LANGUAGE_SWITCH_44PX
LEGACY_VISUAL_ACCEPTANCE=NO · GENERIC_HEADER_ACCEPTANCE=NO · GENERIC_FOOTER_ACCEPTANCE=NO · GENERIC_PAGE_TEMPLATE_ACCEPTANCE=NO
PRIMARY_DEFERRED_COMPONENT=AppMobileNav        (deferred from 104-D → closed here)
SCOPE=UI_AND_DESIGN_SYSTEM_ONLY
FROZEN_SURFACES=Observatory homepage · Journal landing · article detail · Login Horizon · Dashboard Triad · Rail/Command geometry
OWNER_VISUAL_APPROVAL=OUTSTANDING
CODEX_REVIEW=REQUIRED
COMMIT=NO · PUSH=NO · PR_STATE=DRAFT_OPEN_UNMERGED · PHASE104_I=NOT_STARTED
```

104-H is closure, not art direction. It brings the Phase 104 shell to release-grade small-screen,
RTL, keyboard, focus, accessibility and motion quality without redesigning any approved page.
Every claim below is backed either by the 104-H gate (`phase104h-shell-closure.test.tsx`), by an
existing suite, or by a production-build runtime measurement recorded in this increment's
scratchpad report. Nothing stronger is asserted.

## 1. Runtime ownership audit (derived from imports, not filenames)

`AppShell` computes `groups = visibleAppNavGroups(user.role)` **once** and passes the identical
array to `AppSidebar`, `AppTopbar → AppMobileNav`, and `AppCommandPalette`. Mobile and desktop
navigation therefore cannot drift for a role by construction; the gate asserts it per role.

| Component | Runtime owner | ≥1024 | 768 | ≤767 | Keyboard / focus | RTL | 104-H decision |
|---|---|---|---|---|---|---|---|
| `AppSidebar` (Rail) | `AppShell` | `lg:flex` | hidden | hidden | Tab; `ds-focus` | logical | Geometry frozen (72/264/2px). Verified. |
| `AppMobileNav` | `AppTopbar` | trigger `lg:hidden` | trigger | trigger | ds `Drawer`: focus-in, Tab-trap, Esc, backdrop, restore | `side="start"` | **Closed** (see §2). |
| ds `Drawer` | `AppMobileNav`, `PublicMobileNav` | — | — | — | via `useOverlayBehavior` | `start-0/end-0` | Additive `id`; safe-area/`dvh` presentation. |
| `SearchTrigger` | `AppTopbar` | 36px → **44px** | | | opens palette | — | `IconButton md → lg`. |
| `AppUserMenu` trigger | `AppTopbar` | 32px → **44px target** | | | Esc + restore (existing) | — | Button is the target; 32px avatar is decorative. |
| `AppNotificationCenter → NotificationCenter` | `AppTopbar` (+ two public headers) | 32px bell → **44px target** | | | Esc + restore (existing) | logical | Hit-target from the adapter wrapper only; shared component untouched. |
| `AppBreadcrumbs` | `AppTopbar` | `hidden md:block` | visible | hidden | `nav>ol`, `aria-current` | — | Keep. |
| `AppCommandPalette` | `AppShell` | — | — | — | keyboard-first (104-D) | — | Frozen; verified contained at 320. |

### 1a. Legacy `PageShell → SiteHeader` family (in scope — measured and closed in the shared layer)

A route not using `AppShell` does not leave 104-H's scope. The full ownership map was derived from
imports: **44 page files + 7 layouts** render through `PageShell → SiteHeader` (`SiteNav` +
`AuthIndicator` + `NotificationCenter` + `LanguageSwitch`); no route mixes the two shells. Five
representative routes (`/dashboard/operations/alerts`, `/dashboard/organization`,
`/dashboard/industrial`, `/compliance`, `/admin`) were measured on the production build with a real
admin session at 1440/1024/900/768/390/320 × en/de/fa = **90 cells**, each recording document
overflow, nav-mode exclusivity (desktop bar ⊕ hamburger, never both/none), H1 count, hidden
tabbables, unnamed controls, sub-44px header controls, clipped text, focus visibility,
reduced-motion honouring, console/page errors.

| Finding (all 90 cells) | Before 104-H | After 104-H | Where fixed |
|---|---|---|---|
| Nav mode exclusive · H1 = 1 · hidden tabbables · unnamed controls · clipped text · page errors | healthy | healthy (0 / 0 / 0 / 0) | — |
| Header controls < 44px (logo link, SiteNav triggers, hamburger, sign-in/out, bell, language) | 4–8 per cell | **0 / 90** | shared layer only: `SiteHeader`, `SiteNav`, `AuthIndicator`, `LanguageSwitch`, `.hermes-topbar-bell` |
| Document overflow at **390** (mobile reference) | en/de 395–408 (logo `shrink-0` 177–189px + tagline) | **390 = 390** in every locale (de `/admin` 425 is the page's own filter row, see §9) | tagline hidden below `md`, `px-4 sm:px-6` gutters |
| Document overflow at **320** | 395–408 | en **363** / de **356** / fa **347** — residual, see boundary B | — |
| Document overflow at ≥768 in en/de (and fa at 768–1024) | present | present, unchanged | boundary A |

Everything fixed above is presentation in the shared visual layer: no route, IA, role exposure,
auth or shell migration changed (gate asserts `PageShell`/`SiteHeader` import no `AppShell` piece
and `NotificationCenter` is untouched). Two defects could **not** be closed inside that layer and
were reported as decision boundaries rather than masked (no `overflow-x:hidden`, no clipping); the
owner has since decided both — see §1b.

- **Boundary A — desktop `SiteNav` IA (decided → §1b A).** The full nav bar is intrinsically
  **795px** (en) / ~802 (de) / 599 (fa) wide; with logo, actions and gutters the row needs
  **1342 / 1349 / 1073px** at 1024 and its own `max-w-6xl` cap is 1152 → en/de overflowed at every
  desktop width (1440: 1486/1493 vs 1440). 104-H's target enlargements account for ≤ 20px of that.
- **Boundary B — 320px legacy header (decided → §1b B).** After the 44px targets the row is
  `16 + logo 130 + hamburger 44 + 12 + [sign-out 56 + 8 + bell 44 + 8 + language 44] = 362` (en),
  so it could not fit 320 with the wordmark visible.

**Cross-surface effect (disclosed, then decided → §1b C):** `AuthIndicator` and `LanguageSwitch` are
shared with the frozen Observatory/Journal `PublicHeader`. Their 44px targets add +8px there below
`sm`; a first attempt that also added `px-1.5` overflowed the public header at 320 in en/de by
exactly 12px (measured 332/320) and was removed — the 72-cell 104-F header matrix went back to
**0 defects**, but the en/de action cluster then ended flush at the viewport edge (0px slack).

### 1b. Owner decisions A / B / C and the German `/admin` toolbar (applied)

```text
OWNER_DECISION_A=FULL_NAV_AT_1600_ONLY
OWNER_DECISION_B=LEGACY_WORDMARK_TEXT_HIDDEN_BELOW_SM
OWNER_DECISION_C=KEEP_LANGUAGE_SWITCH_44PX
LANGUAGE_SWITCH_TARGET=MINIMUM_44PX
```

**A — legacy `SiteNav`: full bar only from 1600px, compact (hamburger) below.** Both halves and the
decorative divider key off the **same** arbitrary variant `min-[1600px]` (no new theme screen; the
gate compiles the real Tailwind config and asserts `min-[1600px]:flex`, `:hidden` and `:block` all
resolve to the identical `(min-width: 1600px)`). Destinations, grouping, order and role filtering are
untouched; no horizontal scrolling, clipping or masking. At ≥1600 the row cap widens from
`max-w-6xl` (1152) to `max-w-screen-2xl` (1536) — the next standard step above the measured German
intrinsic full row (**1373px** incl. gutters), i.e. a **163px** margin. Runtime matrix
1440/1536/1599/1600/1920 × en/de/fa (§8b): compact at ≤1599, full at ≥1600 with no overflow and no
clipped label; never BOTH/NONE.

**B — legacy `SiteHeader` brand (compact-brand precedent of the authenticated `AppTopbar`).** Below
`sm` only the textual wordmark hides (`hidden flex-col sm:flex` on the wordmark/tagline column); the
H emblem stays visible, the link keeps `aria-label="Hermes OS — home"` and a 44×44 target
(`min-h-11 min-w-11`); one rule for every locale, logical positioning only. `PublicHeader` and
`AppTopbar` unchanged by this decision. Runtime 320/360/390/639/640 × en/de/fa (§8b): emblem visible
in every cell, wordmark hidden < 640 and visible at 640, link ≥ 44×44, name intact, no overflow.

**C — `LanguageSwitch` stays 44px; `PublicHeader` 320 pressure resolved by small-screen spacing.**
The 320px budget of the public row, measured: gutter 20 + trigger 44 + logo (32 emblem + gap +
53/46/50 wordmark) + auth link 49/56/44 + bell + language 44 + gutter 20. With every target at 44px
(bell now carries the same scoped `.hermes-topbar-bell` wrapper as the app-shell and legacy headers;
logo link `min-h-11`), the ≥8px logical inset is reached **only through spacing below `sm`**:
container gap 12→4, cluster gap 6→4, emblem/wordmark gap 10→8 (`sm:` restores the approved values —
nothing at ≥640 changed). Result **310px used → 10px inset (en/de), 18px (fa)**; the wordmark, the
mobile trigger, notification/auth actions and the language switch all stay visible; no `overflow`,
no clipping, no negative positioning, no locale-specific CSS. Re-run of the **72-cell** public-header
regression matrix now also asserts the outer inset ≥ 8 and no sub-44 control below `sm` (§8b).

**German `/admin` at 390 (425/390) — fixed.** The filter action cell (`Anwenden` + `Zurücksetzen`
≈ 216px) sat in a 149px grid track and could neither shrink nor wrap. It now spans the full row below
`sm` (`col-span-2 sm:col-span-1`) and wraps (`flex-wrap`); both buttons meet the 44px target
(`min-h-11`); copy, reset behaviour and the API call are unchanged (gate asserts the fetch URL and
the reset handler verbatim). Verifying the owner's 1024 cell exposed a **second, pre-existing**
overflow the header had masked: the page's `lg:grid-cols-[2fr_1fr]` uses bare `fr` tracks, i.e.
`minmax(auto, 2fr)`, so the left column's automatic minimum took the filter selects' max-content
(five × ~284px = **909px**) and the tracks froze at 909/174 at every width ≥ lg, pushing the
Control Center off a 1024 viewport (measured 1129/1130/1030 en/de/fa). Fixed with `min-w-0` on both
columns (the selects stay `w-full`; the audit table keeps its own `overflow-x-auto`). Runtime
320/360/390/768/1024 × en/de/fa (§8b): `document.scrollWidth === document.clientWidth` in every cell.

**German organization heading (owner typography decision) — closed.** See §9 for the full record:
`org.title` de → "Organisation verwalten"; runtime 320/360/390/640/768/1024/1440 × en/de/fa (§8b) with
`scrollWidth === clientWidth`, one visible unclipped H1, no word split inside a word, 0 console /
hydration / page errors; the legacy matrix is now **90/90**.

All five are asserted on **rendered DOM** (the async `SiteHeader` is invoked and its element tree
mounted; `SiteNav`, `LanguageSwitch`, `PublicHeader`, `AdminConsoleClient` mounted directly),
**Tailwind-compiled CSS** from the real config, and a **geometry budget** derived from the rendered
classes plus the documented production measurements — source text is never the sole authority.
Sixteen new mutation classes (N1–N16) cover the ten owner-listed regression types; all caught.

## 2. AppMobileNav behaviour (closed)

Baseline (87C) already delivered: portal + mount-gate (no hydration diff), `role="dialog"`,
`aria-modal`, `aria-labelledby`, focus-in, Tab trap, Escape close, backdrop close, focus restore,
body-scroll lock, `min-h-11` rows, logical `start` edge. 104-H added exactly what was missing:

- **`aria-controls`** on the trigger, resolving to the `Drawer` panel id (`useId`, shared with the
  primitive → SSR/client identical).
- **Structural Beacon** on the active row: `.hermes-mobile-nav-item[aria-current="page"]::before`
  — `--rail-indicator-width × --beacon-core`, `inset-inline-start`. Active state now carries four
  channels: `aria-current`, Beacon bar, surface lift, semibold.
- **Close on select**, including the already-active destination (the pathname effect alone could
  not close that case).
- `motion-reduce:transition-none` on rows.
- `Drawer` panel: `100vh → 100dvh` fallback chain, `env(safe-area-inset-*)`, `maxWidth: 100%`;
  the **nav list scrolls, not the document** (existing `flex-1 overflow-y-auto`).

Trigger: `IconButton lg` = 44×44, accessible name, `aria-expanded`, `aria-controls`, no nested
interactive element.

## 3. Responsive breakpoint contract

Rail shows at `lg:flex`; trigger hides at `lg:hidden` — **one threshold**, so no width has both or
neither. Production measurement (36 authenticated `AppShell` cells, 3 locales × 2 routes × 6
viewports 320–1600): every cell reports exactly `rail` (≥1024) or `mobile` (≤768), never
`BOTH`/`NONE`; 0 focusable-but-invisible elements.

**Machine-checkable band contract (769–1023).** The gate does not trust screenshots for the band:
it parses the rail's and the trigger's responsive prefixes from source (both must be exactly
`["lg"]`), resolves `lg` from the real Tailwind config (`resolveConfig(...).theme.screens.lg ===
"1024px"`, `md` 768, `xl` 1280), and self-checks that swapping either prefix would fail. Because
both halves key off one theme value there is no width in 769–1023 where the two can disagree.
Runtime confirmation on the production build: **30/30 cells** (769/800/900/1023/1024 × en/de/fa ×
`/dashboard`, `/dashboard/knowledge`) — mobile mode at 769–1023 with content inline offset 0, rail
at 1024 with offset 264 = rail width, trigger 44×44, no topbar collisions, drawer on the logical
start edge, Beacon present, no German word split, 0 page errors.

**Known German KPI overflow at 320×568.** The document was 336px wide on a 320 viewport in
German only. Root-caused by descending from `<main>` to the overflow leaf on the production build;
it was **three** independent whole-word defects, all German compound words wider than a fixed cell
or track, and all fixed without shrinking type, touching copy, or a locale-specific rule:

1. `.kpi-label` had no wrap policy → "4/4 Linien aktiv" overflowed its cell. Now
   `white-space:normal / overflow-wrap:normal / word-break:normal / hyphens:none / min-inline-size:0`.
2. `ExecutiveOverview` KPI grid was a fixed 2-up at 320 (~88px per eyebrow) and a hard 4-up from
   `sm` (~136px at 768); `WISSENSBIBLIOTHEKEN` measures **135px** as one unbreakable uppercase
   word. Replaced by ONE measured floor `repeat(auto-fit, minmax(11rem, 1fr))` (135 + 40 card
   padding); the container is 272–342px at 320–390 and a whole-word 2-up needs 362px, so it is
   **1 column below `sm` for every locale** (the only honest layout; en/fa *could* fit two but no
   per-locale rule is written), 3 at 768 (704px), 4 from 1024.
3. `ExecKpiStrip` cells (`.min-w-[120px]`, incl. `KpiSlot`) — `PRODUKTIONSLINIEN` = **113px** +
   40px cell padding = 153px, so the label overflowed its cell. Floor raised to `min-w-[10rem]`;
   `KpiSlot`'s physical `border-l` corrected to logical `border-s`. (Isolation later showed the
   strip's own scroller *did* contain this — hiding the whole strip left the document at 336 — but
   the cell overflow was real and is fixed regardless.)
4. **The actual document leak**: `.hs-badge { white-space: nowrap }` on a status pill carrying a
   full German sentence — "EREIGNISSE MIT HOHER PRIORITÄT", **225px** — inside a 230px flex row of
   the Werksüberblick card; it pushed 8px past its parent and, through three `overflow:visible`
   ancestors, widened the document. Found by hide-one-at-a-time isolation (a scrollWidth-sorted
   descent kept landing on the KPI strip because its internal scroller dominates that metric).
   Badges may now wrap **between** words under real pressure, never inside a word. Blast radius
   was measured on the production build before touching this shared rule: of 16 dashboard badges,
   exactly **one** changes height (the broken one) in every locale; the 15 short pills are unaffected.

### 3a. Runtime status (production build, real admin session, measured)

| locale | 320 | 390 | 768 | KPI grid columns 320/390/768 | eyebrow overflows |
|---|---|---|---|---|---|
| de | scrollWidth **320** = clientWidth | 390 = 390 | 768 = 768 | 1 / 1 / 3 | 0 / 0 / 0 |
| en | 320 = 320 | 390 = 390 | 768 = 768 | 1 / 1 / 3 | 0 / 0 / 0 |
| fa | 320 = 320 | 390 = 390 | 768 = 768 | 1 / 1 / 3 | 0 / 0 / 0 |

Before 104-H: `de 320` reported scrollWidth **336** (16px document overflow), 4 overflowing German
eyebrows at 320 and 2 at 768. After: **0** overflow and **0** eyebrow overflows in every locale.
The closure was proven incrementally — each of the four fixes was rebuilt and re-measured, and the
document only reached 320 after the fourth (badge) fix, which is why all four are recorded.

## 4. RTL rules

Logical properties only. Gate asserts no physical Tailwind utility in the shell components and no
physical CSS property in any 104-H rule; the drawer anchors to logical `start`; the Persian drawer
renders under `dir="rtl"` with no Arabic `ي/ك`. Runtime: fa cells show `dir=rtl`, drawer within
viewport, Beacon present.

## 5. Accessibility contract

Exactly one visible primary authenticated navigation per viewport; the closed drawer is **absent
from the DOM** (mount-gate) — the strongest form of "not tabbable"; landmark `nav[aria-label]` in
both rail and drawer; dialog labelled by its title; all topbar controls named; 44px targets on
search / bell / account / trigger / rows; badge count is text + `aria-label` (not colour-only).
Runtime across 36 `AppShell` cells: `unnamedControls=0`, `smallTopbarTargets=0`,
`focusableButInvisible=0`; across the 90 legacy cells: `sub44=0`, `hiddenTabbable=0`, `unnamed=0`.

**Rail (frozen 104-D geometry, measured, not changed):** on the desktop rail 35–36 expanded nav
links measure **32px** tall (plus one 26–30px and one 36px control). This is the approved Rail
geometry (`--rail-item-size` 44 governs the collapsed tiles) and is outside 104-H's mutable
scope; it is recorded here so the number is not silently accepted. Frozen public headers likewise
carry pre-existing sub-44 controls (`h-9` nav disclosures 36px, logo link 95×43, the public
header's unwrapped 32×32 bell, article byline/tag inline links) — 104-E/F approved, listed in §9.

## 6. Focus lifecycle

Open → focus into panel (first focusable) · Tab/Shift-Tab trapped · Escape → close **and** focus
returns to trigger · backdrop → close · select destination → close. All asserted in the gate at
runtime (jsdom) and measured in production (12 drawer cells: `focusIn=true`, `esc closed=true`,
`restored=true`).

**Drawer identity and lifecycle are proven by DOM behaviour, not source text.** The gate mounts the
real `AppMobileNav` and asserts: the trigger's `aria-controls` resolves to **exactly one** element,
which is the `role="dialog"` panel; no duplicate panel ids exist in the document; two mounted
instances own two distinct panels and opening one leaves the other's `aria-expanded` untouched;
selecting a different destination closes; selecting the **current** destination closes (the
pathname effect alone could not); Escape closes and restores focus to the trigger; backdrop
closes and restores focus; unmount leaves `document.body.style.overflow` unlocked and no portal,
dialog or focus-guard residue in the DOM. Mutation classes M3–M6 and M16 exercise these paths.

## 7. Motion inventory (shell scope)

| Selector | Trigger | Properties | Reduced-motion | Decision |
|---|---|---|---|---|
| `.hermes-mobile-nav-item` rows | hover/active | color/bg (0.14s) | `motion-reduce:transition-none` → `none` | keep |
| trigger `IconButton` | hover | transition (0.2s) | ds handles | keep |
| Drawer | open/close | none animated (instant) | n/a | keep |
| `.hh-*`/`.hj-*` keyframes | public pages | opacity/stroke | all under `no-preference` (asserted by 104-E/F gates) | unchanged |

Production: `reduce` → row transition `none`, trigger `1e-05s`, 0 animating nodes in dialog;
`no-preference` → real transitions. No new animation of layout/paint properties introduced.

## 8. Permission / error truthfulness

- Anonymous → `/en/dashboard`: middleware redirects to `/en/auth/login?from=…` (fail-closed,
  measured, status 200 on the login page).
- `/en/<nonexistent>` → HTTP **404**, one H1, no overflow.
- Role-denied state (`RequireCapability` → `PageIntro deniedTitle/denied`) is proven at the
  contract/unit boundary; the seed session is admin-class so the **visual** denied cell is
  honestly *unavailable* — no auth was modified or bypassed to fake it.

### 8a. Production evidence set (final build, 104-H markers verified in the served CSS)

Every screenshot below was taken from the production build whose served stylesheet contains
`.hermes-mobile-nav-item`, `.ds-drawer-panel`, `.hermes-topbar-target`, `.hermes-topbar-bell`,
with the cookie banner dismissed through its real "reject non-essential" control (never CSS), and
carries its own runtime row: viewport, locale, route, `scrollWidth/clientWidth`, `dir`, hidden
tabbables, sub-44 header controls, console / hydration / page errors. **0 console, 0
hydration, 0 page errors** (39 cells on the final build after decisions A/B/C).

| Set | Cells | scrollWidth = clientWidth | Notes |
|---|---|---|---|
| AppShell `/dashboard` en 390 closed/open · en/de/fa 390 open · en/de/fa 320 open · en 768 open · en 900 · en 1023 · en 1024 rail · en 1440 rail · fa 1440 rail expanded+collapsed · palette en 320 | 15 | all | topbar sub-44 = 0 in every cell; rail 32px links = frozen 104-D (§5) |
| Legacy alerts en/fa 390 · organization de 320 · industrial en 1024 | 4 | all (organization de 320 = 320 after the heading decision) | sub-44 = 0 |
| Frozen: Home en/fa 1440+390 · Journal en/de/fa 1440+390 · article 1440+390 · Login en/fa 1440+390 · Dashboard Triad en/fa 1440+390 | 20 | all | `dir` correct per locale; sub-44 only the pre-existing frozen controls (§5) |

Plus the matrices that back the tables above: 104-F `PublicHeader` regression **72/72** (0
defects, now including the ≥8px outer-inset and no-sub-44-below-`sm` rules), band **30/30**, legacy
**90/90** cells (organization German H1 closed by the owner's typography decision, §9), `AppShell` **36**
cells + 12 drawer cells, palette contained at 320, reduced-motion `none` vs real transitions under
`no-preference`.

### 8b. Owner-decision matrices (final build; served stylesheet carries the four `min-[1600px]` utilities under one `@media (min-width:1600px)`)

| Matrix | Cells | Result | Key numbers |
|---|---|---|---|
| A · legacy nav boundary, `/dashboard/operations/alerts` 1440/1536/1599/1600/1920 × en/de/fa | 15 | **0 defects** | compact at 1440/1536/1599 (row 1152), full at 1600/1920 (row 1536); scrollWidth = clientWidth in every cell; 0 clipped labels; sub-44 = 0; outer insets 168–248 (compact) / 56 (1600) / 216 (1920) |
| B · legacy brand, same route, 320/360/390/639/640 × en/de/fa | 15 | **0 defects** | emblem visible in 15/15; wordmark hidden at 320–639, visible at 640; link 44×44 (<640) → 130/123/127×44 (640); `aria-label="Hermes OS — home"` in every cell; scrollWidth = clientWidth; outer inset 16 |
| `/admin` 320/360/390/768/1024 × en/de/fa | 15 | **0 defects** | scrollWidth = clientWidth in 15/15; reset button 71/118/78 × **44**; 1024 now 1024 (was 1129/1130/1030 before `min-w-0`) |
| `/dashboard/organization` heading, 320/360/390/640/768/1024/1440 × en/de/fa | 21 | **0 defects** | scrollWidth = clientWidth in 21/21; exactly one visible unclipped H1; no word split inside a word; de 320 = two lines "Organisation" / "verwalten" at 30px in a 272px column; hydration 0, page errors 0; the only console message on this host is the external `trustseal.enamad.ir/logo.aspx` timeout (network; with that single image stubbed 200 the run is 21/21 with 0 console errors) |
| Legacy shell matrix (5 routes × 6 widths × en/de/fa) | 90 | **90/90 · LEGACY_OVERFLOW_CELLS=0** | sub-44 0, hidden tabbables 0, unnamed 0, H1 = 1, clipped 0, focus visible, page errors 0, hydration 0 |
| PublicHeader regression `/`, `/platform`, `/articles`, article × 1440/1280/1024/768/390/320 × en/de/fa | 72 | **0 defects** | at 320: end inset **10** en/de (9 on `/platform`, sub-pixel), **17–18** fa; start inset 20–21; wordmark visible; sub-44 = 0 below `sm`; no overflow, no clipped text |

Screenshots (scratchpad `h/final/`, attached to the delivery): legacy header en/de/fa 320;
legacy header de 1440 (hamburger, closed + open), 1599, 1600 (full navigation); PublicHeader
en/de/fa 320; `/admin` de 390 after toolbar reflow; AppMobileNav open en/de/fa at 390 and 320;
Rail en 1024 and 1440 (+ fa 1440 expanded/collapsed); frozen Homepage, Journal, Login.

## 9. Accepted exceptions and remaining debt

- **Decision boundary A** — desktop `SiteNav` intrinsic width vs its 1152px row (§1a): IA call.
- **Decision boundary B** — legacy header at 320 with the wordmark visible (§1a): brand call
  between the `AppTopbar` and `PublicHeader` precedents. 390 is clean.
- de `/dashboard/organization` at 320–~376 (H1 "Organisationsverwaltung" 328px in a 272px column,
  352/320) — **fixed by owner typography decision**: the German UI heading is now
  **"Organisation verwalten"** (meaning preserved, a legitimate break between words). `org.title`
  is consumed only by this H1 (audited: 9 `org`-namespace consumers, none uses `title`), so only
  the German value changed — no new key, leaf counts untouched, navigation keeps "Organisation".
  Nothing forbidden was used (no size reduction, scale, tighter tracking, `overflow-wrap:anywhere`,
  hyphenation, soft hyphen, `<wbr>`, clipping, ellipsis, overflow-x hidden, locale CSS). Gate: the
  real path (org catalog → next-intl → `PageHeader` → `<h1.exec-display>`) is mounted, the parsed
  `.exec-display` rule is evaluated at 320 (30px, tracking −0.032em pinned) and each word must fit the
  272px column at a conservative 0.55em advance; six mutations (compound restored, key removed,
  truncate, size reduction, tighter tracking, `overflow-wrap:anywhere`) all caught. Runtime §8b.
- de `/admin` at 390/320 (filter action row) — **fixed** per owner instruction (§1b); the audit
  table itself stays `min-w-[640px]` inside its own `overflow-x-auto` scroller (contained).
- Frozen-surface sub-44 controls (§5): rail expanded links 32px (104-D), public header `h-9`
  disclosures at ≥xl and the `md` "Request a Demo" CTA at ≥sm (104-E/F), article byline/tag
  inline links (104-F). Approved geometry, not touched. (The public header's bell and logo link are
  now 44px per decision C.)
- `PublicHeader` at 320: en/de inset is 10px, fa 18px, against the required ≥8 — a 2px margin in
  en/de over measured text widths; the gate's geometry budget pins the spacing so it cannot shrink.
- Console errors seen during legacy measurement are `503` from `/api/compliance/*` (backend not
  configured on the measurement host) and cancelled `_rsc` prefetches on page close — no UI or
  page errors.
- Legacy Command Ribbon status badges extend past the viewport **inside their own scroller**
  (contained; no document overflow) — the known "Command Ribbon" debt; not a shell concern.
- External Enamad trust-badge image intermittently times out on this host (public footer,
  network, not code).
- Windows-only oxc parse failure of the route-inventory `.mjs` import (3 files) — Linux CI is the
  arbiter; not reproducible as an assertion.

## 10. Files changed (104-H)

```text
M src/components/ds/Drawer.tsx                                (id prop, .ds-drawer-panel)
M src/components/app-shell/AppMobileNav.tsx                   (aria-controls, Beacon row, close-on-select)
M src/components/app-shell/SearchTrigger.tsx                  (IconButton md → lg)
M src/components/app-shell/AppUserMenu.tsx                    (44px target, decorative avatar)
M src/components/app-shell/AppNotificationCenter.tsx          (.hermes-topbar-bell wrapper)
M src/components/dashboard/ExecutiveOverview.tsx              (KPI grid: one measured 11rem auto-fit floor, no fixed step)
M src/components/ui/ExecKpiStrip.tsx                          (cell floor 10rem; KpiSlot border-l → border-s)
M src/app/globals.css                                         (104-H block; .kpi-label + .hs-badge whole-word wrap policy)
M src/components/SiteHeader.tsx                               (legacy shell: tagline hidden < md, 44px logo link, px-4 sm:px-6, scoped bell wrapper; decision A row cap + divider on min-[1600px]; decision B emblem-only < sm)
M src/components/SiteNav.tsx                                  (legacy shell: min-h-11 disclosure triggers, 44×44 hamburger; decision A: full bar min-[1600px]:flex, hamburger + panel min-[1600px]:hidden)
M src/components/auth/AuthIndicator.tsx                       (shared: 44px sign-in/out targets, no padding — frozen PublicHeader budget)
M src/components/LanguageSwitch.tsx                           (shared: min-h-11 min-w-11, padding rhythm unchanged — decision C keeps 44px)
M src/components/public-site/PublicHeader.tsx                 (decision C: <sm gaps 4/4/8, bell wrapper, min-h-11 logo link; nothing at ≥sm changed)
M src/components/admin/AdminConsoleClient.tsx                 (German 390 overflow: action cell col-span-2 sm:col-span-1 + flex-wrap, min-h-11 buttons)
M messages/de.json                                            (org.title de: "Organisation verwalten" — owner typography decision; value-only, key unchanged)
M src/components/articles/__tests__/phase104f-journal-contract.test.ts  (bound cssF slice to its own block)
A src/components/app-shell/__tests__/phase104h-shell-closure.test.tsx   (58-test gate: 16 + 17 + 6 mutation classes, band contract, Drawer DOM lifecycle, legacy shared-layer pins, owner decisions A/B/C + admin toolbar on rendered DOM / compiled Tailwind / geometry budgets)
A docs/design/phase-104/09-responsive-rtl-a11y-motion-closure.md
```

18 paths (16 modified + 2 new). `globals.css` +95/−1 lines (123,606 → 131,642 bytes, +8,036).

`PublicHero.tsx` and `HomeStorySection.tsx` untouched. No change under `prisma/`, `src/app/api/`,
`src/lib/auth/`, `src/lib/services/`, `src/lib/industrial/`, `src/middleware.ts`, `package*.json`,
`docker*`, `deploy/`, `ops/`, `messages/`, `.github/`, `tools/figma/`.

## 11. Rollback

Before commit: `git restore` the files in §10 and delete the two new files. No migration, no
dependency, no route, no API changed — rollback is purely presentational.

## 12. Separation from 104-I

104-H closes **shared** responsive/RTL/a11y/motion behaviour of the shell and fixes the two named
Phase-104 debts (German KPI 320, Command-Ribbon containment verified). It migrates **no** route
family and touches no page composition beyond one KPI-strip column rule. Family migrations,
including moving legacy-shell dashboard routes onto `AppShell`, are 104-I.

## 13. Owner directive — Phase 104 is NOT complete after 104-H (preserved verbatim)

The following directive was issued by the project owner during the 104-H closure round and is
reproduced **verbatim** so it cannot be lost between increments. 104-H closes responsive /
accessibility mechanics only; it confers **no** visual acceptance on the legacy shell, the generic
header, the generic footer or any generic page template. The legacy-route findings of §1a/§1b are
carried into the 104-I handoff explicitly (see §13.1) and must not be deleted or weakened.

```text
IMPORTANT OWNER DIRECTIVE — Phase 104 is not complete after 104-H

Do not interpret a technically responsive legacy shell as final visual approval.

The owner requires every visible Hermes OS surface to become highly specialized, premium and professionally composed.

Phase 104-H may close responsive/accessibility mechanics, but:

LEGACY_VISUAL_ACCEPTANCE=NO
GENERIC_HEADER_ACCEPTANCE=NO
GENERIC_FOOTER_ACCEPTANCE=NO
GENERIC_PAGE_TEMPLATE_ACCEPTANCE=NO

Do not delete or weaken the legacy-route findings. Carry them explicitly into the Phase 104-I handoff.

Phase 104-I must include a complete visual-ownership inventory for every route and route family, including:

- global PublicHeader;
- authenticated and legacy headers;
- global footer and trust area;
- About;
- Company;
- Careers;
- Contact;
- Platform;
- Capabilities;
- Intelligence;
- Knowledge;
- Resources;
- Services;
- Academy;
- Legal and policy surfaces;
- authentication surfaces;
- operational/dashboard route families;
- all remaining public and authenticated layouts.

Design requirements for Phase 104-I:

1. About must receive its own bespoke industrial-company composition:
   - Hermes origin and engineering history;
   - industrial credibility;
   - mission and operating principles;
   - evidence-to-safe-action philosophy;
   - global/company footprint;
   - governance and trust;
   - custom technical graphic signature.
   It must not be a collection of generic cards.

2. Header and footer must be treated as flagship product surfaces:
   - custom Hermes industrial geometry;
   - strong hierarchy;
   - professional mega-navigation or measured compact navigation;
   - multilingual/RTL integrity;
   - trust, certification and company identity;
   - no crowded generic SaaS header;
   - no template-like multi-column footer.

3. Every primary public page must have an individual visual narrative and graphic signature.

4. Repeated operational routes may share a family system, but the family system must be purpose-built for its industrial domain—not a generic dashboard template.

5. No page may be declared complete merely because it consumes Phase 104 tokens.

6. No generic equal-card grid, stock-template hero, decorative glass spam, excessive empty space, copied Observatory diagram or repeated composition across unrelated pages.

7. Homepage Observatory and Industrial Journal remain approved references, but other pages must not become clones of them.

8. Build a route-to-visual-owner matrix with:
   - route;
   - current shell;
   - current visual state;
   - target family;
   - bespoke/shared status;
   - graphic signature;
   - responsive status;
   - RTL status;
   - visual approval status.

Final Phase 104 exit gates must eventually require:

PUBLIC_VISIBLE_ROUTES=100_PERCENT_VISUALLY_OWNED
AUTHENTICATED_ROUTE_FAMILIES=100_PERCENT_VISUALLY_OWNED
OLD_PUBLIC_HEADER_REMAINING=0
OLD_FOOTER_REMAINING=0
UNREVIEWED_PRIMARY_PAGES=0
GENERIC_PRIMARY_CARD_GRIDS=0
RESPONSIVE_MATRIX=PASS
RTL_MATRIX=PASS
ACCESSIBILITY=PASS
OWNER_VISUAL_APPROVAL=PASS
PR63_MERGE=ONLY_AFTER_ALL_ABOVE_PASS

For the current turn, finish only the narrow 104-H corrections already authorized. Do not start 104-I, but preserve this directive verbatim in the 104-H handoff so it cannot be lost.
```

### 13.1 Legacy-route findings carried into 104-I (do not delete or weaken)

| # | Finding (measured in 104-H, production build) | 104-H state | 104-I obligation |
|---|---|---|---|
| L1 | 44 page files + 7 layouts render through `PageShell → SiteHeader` — the legacy shell — not `AppShell` | ownership map derived from imports; nothing migrated | route-to-visual-owner matrix must list every one; target family per route |
| L2 | Full seven-group `SiteNav` (registry count; the brief said nine) is intrinsically 795/802/599px (en/de/fa) and needs 1342/1349/1073px at 1024 vs a 1152 row cap | decision A: full bar ≥1600 only, compact below (mechanics closed) | header must become a flagship surface (mega-navigation or measured compact navigation); the current bar/hamburger is **not** visually accepted |
| L3 | Legacy header at 320 could not hold wordmark + 44px targets | decision B: emblem-only < `sm` | brand treatment to be re-composed in the flagship header |
| L4 | Legacy header carried sub-44 controls (4–8 per cell) | 0/90 after shared-layer fixes | keep ≥44 in the redesigned header |
| L5 | `/admin` filter row overflowed at 390/320 in German | fixed (reflow/wrap) | admin family needs a purpose-built operational composition |
| L6 | Legacy dashboard family (`/dashboard/operations/*`, `/dashboard/organization`, `/dashboard/industrial`, `/compliance`, `/admin`) uses generic page templates | responsive/a11y closed only | `GENERIC_PAGE_TEMPLATE_ACCEPTANCE=NO` — each family needs its industrial-domain system |
| L7 | Public `PublicHeader` (87D glass bar) survives on every public route with `h-9` disclosures and a `md` CTA | 320 spacing/targets closed (decision C) | `OLD_PUBLIC_HEADER_REMAINING=0` at Phase 104 exit |
| L8 | Global footer / trust area untouched by 104-H | not measured beyond overflow | `OLD_FOOTER_REMAINING=0`; `GENERIC_FOOTER_ACCEPTANCE=NO` |
| L9 | Rail expanded links 32px (104-D approved geometry) | recorded, unchanged | re-evaluate in the operational family system |
| L10 | `/dashboard/organization` de 320–~376: `h1.exec-display` "Organisationsverwaltung" 328px > 272px column (352/320) | **fixed** — owner typography decision "Organisation verwalten" (value-only, key unchanged) | fluid display type / German heading policy for the operational family remains a 104-I design topic |

### 13.2 Owner approval scope of 104-H and the visual handoff for Phase 104-I (verbatim)

The owner's independent approval of 104-H covers responsive behavior, RTL, accessibility, motion,
drawer lifecycle, shared-header breakpoints, the German heading closure and frozen-surface regression
safety. **It does not constitute final owner approval of the visual design of any page**; that remains
the scope of Phase 104-I. The owner's handoff, reproduced verbatim:

```text
Important visual handoff for Phase 104-I:

* The mechanically corrected compact/full header states are accepted as Phase 104-H infrastructure, but not as the final premium header composition.
* Login, legacy authenticated shells, About/Company pages, shared footer and the remaining public/private routes still require purpose-built visual composition.
* Phase 104-I must perform the comprehensive page-family visual migration requested by the owner; it must not treat the existing generic layouts as final simply because their responsive and accessibility mechanics now pass.
```

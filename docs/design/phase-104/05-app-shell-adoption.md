# Phase 104 — Shared App-Shell Adoption (Increment 104-D)

```text
VISUAL_CHANGE=YES_SCOPED_APP_SHELL
MIGRATED_DIRECTLY_ROUTE_CONTENT=0
SHARED_SHELL_ADOPTION=YES
OWNER_VISUAL_APPROVAL=NO
```

This is the **first intentionally visible** Phase 104 increment. 104-A through 104-C proved the
design language exists and is internally consistent; nothing consumed it. Five of the eight
signatures had no product consumer. This increment gives **Rail**, **Command** and **Beacon**
their first real consumers in the shared authenticated shell — and nothing else.

| | |
|---|---|
| Scope | `APP_SHELL + RAIL + COMMAND + SHARED_WORKSPACE_CHROME` |
| Gate | `src/components/ds/__tests__/phase104-app-shell-adoption.test.tsx` — 22 assertions |
| Not started | 104-E, 104-F, 104-H, 104-I |

---

## 1. Existing-state matrix

Ownership was discovered from actual imports, not filenames.

| Component | Runtime owner | Phase 104 target | Decision |
|---|---|---|---|
| `app-shell/AppSidebar.tsx` | `AppShell` (standard mode) | **Rail**, **Beacon**, Edge | **MIGRATE_104_D** |
| `app-shell/AppCommandPalette.tsx` | `AppShell` (both modes) | **Command**, Glass | **MIGRATE_104_D** |
| `app-shell/AppShell.tsx` | route layouts across 6+ modules | — | REUSE_UNCHANGED — composition only, already on Deep Navy surfaces |
| `app-shell/AppTopbar.tsx` | `AppShell` | — | REUSE_UNCHANGED — already `surface-primary` + `border-border-default`; no Rail/Command role |
| `app-shell/SearchTrigger.tsx` | `AppTopbar` | — | REUSE_UNCHANGED — a trigger, not the Command surface; it dispatches the same event |
| `app-shell/AppMobileNav.tsx` | `AppTopbar` | — | DEFER_104_H — mobile drawer; changing it here would pre-empt the responsive closure increment |
| `app-shell/AppBreadcrumbs`, `AppUserMenu`, `AppNotificationCenter`, `OrganizationSelector`, `SideTooltip`, `SkipLink`, `AppPage` | `AppShell` / `AppTopbar` | — | REUSE_UNCHANGED — no signature role in this increment |
| `hermes/CommandRibbon.tsx` | `[locale]/dashboard/page.tsx` **only** | — | OUT_OF_SCOPE_104_E — route content, not shared chrome |
| `dashboard/DashboardCommandSurface.tsx` | `DashboardClient` | — | OUT_OF_SCOPE_104_E — dashboard route content |
| `dashboard-experience/**` | dashboard route | — | OUT_OF_SCOPE_104_E |
| `ui/GlassCard.tsx` | many routes | — | OUT_OF_SCOPE_104_E — legacy glow consumer, see §3 |
| `landing/HeroSection.tsx` | public marketing | — | OUT_OF_SCOPE — public/marketing family |

Two components carry "command" in their names and were **not** touched: `CommandRibbon` and
`DashboardCommandSurface` are rendered by the dashboard route, not by `AppShell`, so they are
route content and belong to 104-E.

---

## 2. Implemented adoption

All values are `var()` references. The adoption layer at the end of `globals.css` introduces no
colour, shadow, gradient or motion constant of its own.

### 2.1 Rail — `AppSidebar`

| Element | Before | After | Variable |
|---|---|---|---|
| collapsed width | `w-16` (64px) | 72px | `--rail-width` |
| expanded width | `w-[264px]` | 264px (unchanged) | `--rail-width-expanded` |
| surface | `bg-surface-primary` | same computed value | `--rail-surface` |
| inline-end edge | `border-border-default` | same computed value | `--rail-edge`, `--edge-width` |
| nav item gap | `gap-1` (4px) | 6px | `--rail-item-gap` |

The `border-e` utility **stays on the element**. It is a logical edge utility and the Phase 87C
shell gate pins it there to prove the rail never uses physical left/right; the adoption rule
supplies its width and colour rather than replacing the utility.

### 2.2 Command — `AppCommandPalette`

| Element | Before | After | Variable |
|---|---|---|---|
| surface width | `max-w-xl` (576px) | `min(720px, 100vw − 40px)` | `--command-width` |
| surface radius | `rounded-lg` (12px) | 16px | `--command-radius` |
| field height | `h-9` (36px) | 56px mobile / 64px ≥768px | `--command-height-mobile`, `--command-height` |
| result list | `max-h-80` (320px) | 480px | `--command-palette-max-height` |

The field is deliberately the largest control in the product — that scale is what makes the
signature recognisable. The width is clamped to the viewport, so the surface cannot cause
horizontal overflow: at 320px it resolves to 280px.

### 2.3 Beacon — the active-route locator

`--beacon-core` aliases the shipped brand primary, so the **computed colour is unchanged**; this
is a semantic adoption, not a recolour. The indicator width moves from `w-[3px]` to
`--rail-indicator-width` (2px).

Beacon appears **exactly once per view** (asserted), is `aria-hidden`, and sits inside the element
already carrying `aria-current="page"`. It is a locator, never a glow: the gate rejects any
`box-shadow`, `filter` or `text-shadow` in its rule.

### 2.4 Deliberately NOT adopted

| Variable | Why |
|---|---|
| `--rail-item-size` (44px) | Shipped rows are 264×32 expanded and 72×32 collapsed — both clear WCAG 2.2 SC 2.5.8 (24×24) comfortably. Forcing 44px would cut roughly a third of the visible navigation on a 900px viewport, and the increment brief forbids reducing information density. |
| `--rail-icon-size` (20px) | The collapsed rail renders a 28px initial-letter tile, not a 20px icon. Applying the icon metric to a glyph tile would be a false adoption. |
| `--command-width-tablet` | The surface clamps continuously between mobile and desktop; a third fixed step would add a breakpoint with no visual benefit. |
| Horizon, Triad | No legitimate shared-shell role exists. Forcing them in merely to reduce the count of unconsumed signatures would be aesthetics posing as architecture. They remain unconsumed. |

---

## 3. Legacy effect inventory

```text
LEGACY_CONSUMERS_BEFORE=2
LEGACY_CONSUMERS_AFTER=2
MIGRATED_PATHS=(none)
REMAINING_PATHS=src/components/ui/GlassCard.tsx, src/components/landing/HeroSection.tsx
UTILITY_DELETED=NO
```

Measured across shipped `src/**` source, excluding tests and the signature contract that merely
names these utilities in prose:

| Utility | Consumer |
|---|---|
| `glow-signal`, `glow-signal-strong` | `src/components/ui/GlassCard.tsx` |
| `landing-scanlines` | `src/components/landing/HeroSection.tsx` |
| `glow-ice`, `glow-danger`, `text-glow`, `text-glow-ice` | **no consumers** |

**Neither remaining consumer is in the 104-D shared-shell scope.** `GlassCard` is a generic UI
primitive used across many routes and `HeroSection` is the public marketing hero; migrating
either would change route content, which this increment is not permitted to touch. Per the
recorded owner decision, they migrate to Edge/Beacon during 104-E/104-G, and the utilities are
deleted **only once the measured consumer count reaches zero**.

The earlier report of "four consumers" counted per-utility matches including the contract file's
prose mentions. The file-level count is **2**, and that is what the gate now pins.

The gate asserts: no in-scope component consumes a legacy utility, and the global consumer set is
pinned by exact equality — so a **new** consumer anywhere fails, and the set can only shrink.

---

## 4. Behaviour preserved

Verified by rendered assertions in the gate and by the untouched Phase 87C shell suite:

| Behaviour | Result |
|---|---|
| route destinations | unchanged — `["/dashboard", "/dashboard/assets"]` asserted from the DOM |
| role-filtered groups | unchanged — server-resolved, shell performs no authorization |
| `Ctrl/Cmd+K` shortcut | unchanged — the gate now opens the palette *with it* |
| palette dialog semantics | `role="dialog"`, `aria-modal="true"` asserted |
| combobox / listbox roles | asserted on the field and the list |
| Escape, backdrop close, focus restoration | unchanged (`useOverlayBehavior` untouched) |
| collapse toggle + persistence | unchanged — `aria-expanded`, `localStorage` key asserted |
| nav landmark + accessible name | asserted |
| auth / RBAC / tenant context | untouched — no file under `src/lib/auth/`, `src/app/api/` or middleware changed |
| simulated-data and disclosure badges | untouched — none live in the shell |

No command, control or affordance was added. No alarm acknowledgement exists or was introduced —
the alerts API remains `GET`-only.

---

## 5. Accessibility

104-H remains the final cross-product closure. This increment introduces no debt:

- `aria-current="page"` retained on the active item; Beacon is `aria-hidden` and additive.
- Active state carries **three** channels: `aria-current`, semibold weight and the interactive
  surface fill, plus the Beacon bar. Colour is never the only channel — asserted.
- Collapse control keeps its accessible name and `aria-expanded`.
- Icon-only collapsed items keep their `sr-only` label and tooltip wiring.
- Target size: rows remain 264×32 / 72×32, above SC 2.5.8's 24×24 minimum.
- Reduced motion: the rail transition keeps `motion-reduce:transition-none`; the property changed
  from `width` to `inline-size` so the transition mirrors correctly under RTL.
- No horizontal overflow: the Command surface is viewport-clamped.
- All adoption CSS uses **logical properties** (`inline-size`, `border-inline-end-*`), so Persian
  RTL mirrors without a second rule. No physical left/right was introduced.

---

## 6. Responsive and locale evidence

```text
VISUAL_ARTIFACTS=BLOCKED_OWNER_TOOLING
```

The shell is authenticated-only, the repository contains **no screenshot or e2e tooling**
(`puppeteer`, `playwright`, `cypress` are all absent from `package.json`), adding a dependency is
prohibited by this increment, and no database was reachable to create an authenticated session.
**No screenshots were captured and no visual PASS is claimed.**

What *is* machine-verified is the exact geometry delta, computed from the contract:

| Surface | Before | After |
|---|---|---|
| Rail, collapsed | 64px | **72px** |
| Rail, expanded | 264px | 264px |
| Rail item gap | 4px | **6px** |
| Active indicator | 3px | **2px** |
| Command surface | 576px | **min(720px, 100vw − 40px)** |
| Command radius | 12px | **16px** |
| Command field | 36px | **56px / 64px ≥768px** |
| Command list | 320px | **480px** |

Owner visual review at 1440×900, 1024×768, 390×844 and 320×568 across `en` LTR, `fa` RTL and `de`
remains **required and outstanding**.

---

## 7. Limitations

- 104-E, 104-F, 104-H and 104-I have not started.
- **Zero route content was migrated.** Only the shared shell changed.
- Horizon and Triad remain **unconsumed** — deliberately.
- No screenshots, no owner visual approval, no Figma operation. Figma remains at the historical
  181/205 with Verify, Dry Run and Apply all **not run**.
- Legacy glow utilities remain shipped with two out-of-scope consumers.

## 8. Rollback

```bash
git revert --no-commit <104-D commit sha>
```

Reverting restores the literal rail widths, the previous palette geometry and the `w-16`
assertion. No route, API, locale catalogue or contract value is affected.

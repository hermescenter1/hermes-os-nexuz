# PHASE 87A — Figma → Code Token Mapping (proposed, no code changed)

Ground truth: the bridge pattern **already exists** — [tailwind.config.ts](../../../tailwind.config.ts)
maps semantic color names to CSS custom properties defined in
[globals.css](../../../src/app/globals.css) (Tailwind 3.4.17, `content:
./src/**/*.{ts,tsx}`). 87B extends the same mechanism; no new dependency, no
Tailwind version change.

## 1. Naming convention

```
Figma:    Color/Background/Base
CSS:      --color-background-base
Tailwind: bg-background-base   (theme.extend.colors["background-base"])
React:    variant tokens reference Tailwind classes only — components never
          hard-code hex
```

## 2. Color mapping (full)

| Figma variable | CSS custom property | Value | Tailwind key → example class |
|---|---|---|---|
| Color/Background/Base | `--color-background-base` | `#071018` | `background-base` → `bg-background-base` |
| Color/Background/Deep | `--color-background-deep` | `#040A0F` | `background-deep` → `bg-background-deep` |
| Color/Surface/Primary | `--color-surface-primary` | `#0C1720` | `surface-primary` → `bg-surface-primary` |
| Color/Surface/Elevated | `--color-surface-elevated` | `#11212C` | `surface-elevated` → `bg-surface-elevated` |
| Color/Surface/Interactive | `--color-surface-interactive` | `#152A36` | `surface-interactive` → `bg-surface-interactive` |
| Color/Surface/Glass | `--color-surface-glass` | `rgba(12,23,32,0.78)` | `surface-glass` → `bg-surface-glass` |
| Color/Brand/Primary | `--color-brand-primary` | `#16D9E3` | `brand` → `text-brand`, `bg-brand` |
| Color/Brand/Hover | `--color-brand-hover` | `#8BF4F8` | `brand-hover` |
| Color/Brand/Pressed | `--color-brand-pressed` | `#0795A5` | `brand-pressed` |
| Color/Brand/OnBrand | `--color-brand-onbrand` | `#071018` | `brand-onbrand` → `text-brand-onbrand` |
| Color/Text/Primary | `--color-text-primary` | `#EDF7FA` | `text-primary` → `text-text-primary`* |
| Color/Text/Secondary | `--color-text-secondary` | `#A9BAC6` | `text-secondary` |
| Color/Text/Muted | `--color-text-muted` | `#708694` | `text-muted` |
| Color/Text/Disabled | `--color-text-disabled` | `#495C68` | `text-disabled` |
| Color/Border/Default | `--color-border-default` | `#203743` | `border-default` → `border-border-default`* |
| Color/Border/Active | `--color-border-active` | `#21C9D5` | `border-active` |
| Color/Border/Glass | `--color-border-glass` | `rgba(139,244,248,0.10)` | `border-glass` |
| Color/Status/Success | `--color-status-success` | `#38D996` | `status-success` |
| Color/Status/Warning | `--color-status-warning` | `#F5B942` | `status-warning` |
| Color/Status/Danger | `--color-status-danger` | `#F05D68` | `status-danger` |
| Color/Status/Information | `--color-status-information` | `#54A6FF` | `status-information` |
| Color/Reasoning/Hypothesis | `--color-reasoning-hypothesis` | `#8B7CFF` | `reasoning-hypothesis` |
| Color/Reasoning/Evidence | `--color-reasoning-evidence` | `#3B82F6` | `reasoning-evidence` |
| Color/Reasoning/Contradiction | `--color-reasoning-contradiction` | `#F05D68` | `reasoning-contradiction` |
| Color/Reasoning/Missing | `--color-reasoning-missing` | `#F5B942` | `reasoning-missing` |
| Color/Reasoning/Decision | `--color-reasoning-decision` | `#16D9E3` | `reasoning-decision` |
| Color/Focus/Ring | `--color-focus-ring` | `#16D9E3` | used by global `:focus-visible`, `ring-focus` |
| Color/Focus/Halo | `--color-focus-halo` | `#8BF4F8` | `ring-offset` treatment |

\* Tailwind key naming note: to avoid the awkward `text-text-primary` /
`border-border-default` doubling, 87B may flatten to `ink/ink-secondary/…` and
`line/line-active` — **decide once at review; this table is the semantic
contract, the utility prefix is implementation detail.** Alpha ladders
(`…-subtle` 10% fill / 24% border per status) are generated with Tailwind
`<alpha-value>` on RGB-triplet vars (same trick as today's `--signal-rgb`).

## 3. Non-color mappings

| Figma | CSS | Tailwind |
|---|---|---|
| Spacing/2…96 | Tailwind default scale already matches 4-px steps; add `Spacing/6→1.5`, keep existing extras `18/22/26` during migration | `p-*`, `gap-*` |
| Radius/4 6 8 12 16 20 Full | `--radius-xs/sm/md/lg/xl/2xl` + 9999 | `rounded-xs…rounded-2xl`, `rounded-full` |
| Elevation/E1–E4 | `--shadow-e1…--shadow-e4` (values per brand doc §7) | `shadow-e1…shadow-e4` (boxShadow theme) |
| Motion/Duration Fast/Mid/Slow | `--t-fast/--t-mid/--t-slow` (already exist: 150/220/380ms) | `duration-150/220/380` + `ease-out-expo` (exists) |
| Type/Family Display/Body/Mono | `--font-display/--font-body/--font-mono` (exist) — EN adds Inter via `next/font`; per-locale assignment on `<html lang>` | `font-display/font-body/font-mono` (exist) |
| Type/Size scale | `--text-xs…--text-5xl` (exist; values realigned to §5.2) | `text-*` |
| Layout/Sidebar etc. | `--layout-sidebar: 264px` … | arbitrary values or theme `spacing` aliases |

## 4. Migration & backward compatibility (87B plan, not executed now)

1. **Additive first:** introduce all `--color-*` vars alongside the legacy
   vars; keep legacy names as aliases (`--signal: var(--color-brand-primary)`)
   so nothing breaks while components migrate. `line-2`, `steel*`,
   `hermes-gold` alias to their §3.5 replacements and are deleted last.
2. **Classified rename, not find-and-replace:** each `--signal` consumer is
   classified (brand-action → `brand`, healthy-status → `status-success`);
   same for `--ice` (→ `status-information` or `reasoning-evidence`).
3. **Utility-class layer:** `.glass*`, `.panel*`, `.h-s*`, `.card-*` collapse
   to the elevation/glass recipes; retired classes (`.hs-card-depth`,
   `.hs-led-card`, `.glow-*`, `.text-glow*`, `.landing-scanlines`,
   `.neon-border`) get a deprecation pass with grep-verified zero usage before
   deletion.
4. **Fonts:** add Inter through `next/font/google` (or self-hosted files) —
   note this touches `layout.tsx` only; no new npm dependency.
5. Every step ships with the existing gates: `npm run lint`, `npm run
   typecheck`, `npm run test`, `npm run build`.

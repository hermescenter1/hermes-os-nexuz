# PHASE 87 Closure — Repository & Visual Audit Manifest (Section A)

Read-only audit of `agent/phase87-premium-visual-foundation` (base `origin/main`
`0c8e6af`). Produced before any code change, from a 4-lens parallel sweep
(tokens/CSS, ds components, surfaces/i18n/RTL, a11y/responsive) plus direct
inspection. Findings carry `file:line` evidence and a scope decision.

Legend — **Fix** (done in this closure) · **Doc** (recorded, governed by a
checklist) · **Defer** (real, but a large cross-cutting sweep left for a staged
follow-up so the live UI is not broken at once).

---

## 1. Token & CSS architecture — HEALTHY

- **Two additive token layers.** Legacy Phase 51C (`--bg`, `--surface`,
  `--signal`, `--ink`, `--muted`, `--warn`, `--danger`) at `globals.css:26-86`;
  canonical Phase 87B (`--color-*` / `--space-*` / `--radius-*` / `--shadow-e*`
  / `--motion-*`, ~96 defs) at `globals.css:1150-1248`. The layers coexist
  cleanly — legacy untouched, new components consume only canonical tokens.
- **No token drift.** Every canonical semantic-color value matches the Figma
  frame `12:4` source exactly (Obsidian `#071018`, Hermes Cyan `#16D9E3`, text
  `#EDF7FA`, status `#F5B942`/`#F05D68`/`#38D996`, Azure `#3B82F6`, Diagnostic
  Violet `#8B7CFF`, focus ring `#16D9E3`). **Fix/enforced:** the new
  `token-contract.test.ts` locks all 28+ tokens (values **and** Tailwind
  mapping) against the contract sourced from Figma.
- **Tailwind fully exposes the canonical layer** (`tailwind.config.ts:32-84`)
  and preserves legacy keys (`:10-27`) for backward compatibility.
- **ds/ + ui/ are 100% token-clean** — zero hard-coded hex in the primitive
  library; variants use canonical Tailwind classes (e.g. `Button` →
  `bg-brand-primary text-brand-on-brand hover:bg-brand-primary-hover`).
- **Hard-coded colours (49 files)** live only in decorative/visualization/
  marketing layers (`landing/**`, SVG graph canvases, particle fields) — e.g.
  `HeroSection.tsx:21-25`, `GraphCanvas.tsx:55-72`. **Doc/Defer:** acceptable
  per brief (non-core UI); recorded for a later decorative-token pass.
- **Inline box-shadows (29 across 13 files)**, mostly landing/marketing, bypass
  `--shadow-e*`. **Defer:** low severity, decorative.
- **Legacy consumption is live and required:** 3,749 legacy Tailwind class uses
  across 307 files. **Defer (by design):** the brief forbids ripping out the
  legacy layer before v1.

## 2. ds/ component library — MATURE, with a documented gap

- 23 canonical primitives in `src/components/ds/` (Button, IconButton, Input,
  Textarea, Checkbox, Radio, Switch, Badge, StatusIndicator, Tooltip, Tabs,
  Alert, Dialog, Drawer, Card, KpiCard, InsightCard, EmptyState, ErrorState,
  Skeleton, Spinner, TechnicalValue, FormField). All token-clean.
- **Missing from `ds/` vs the Figma "Core Components" board:** Link, Select,
  Search, Dropdown, Accordion, Toast, DataTable, Pagination, Breadcrumb,
  Sidebar, TopNav, LanguageSelector, UserMenu (13); and industrial primitives
  IndustrialSignalTile, FaultHypothesisCard, EvidenceItem, ConfidenceIndicator,
  SafeActionPanel, Timeline/EventRow, AssetStatusBlock (7). Several already
  exist in feature modules / app-shell (Sidebar, TopNav, LanguageSelector,
  UserMenu; industrial tiles under `src/components/engineering/**`,
  `hermes/HermesSignal.tsx`) but are not yet promoted to first-class `ds/`
  primitives. **Defer:** promoting ~20 components is a multi-PR effort; governed
  by the component-contribution rules in [`checklists.md`](checklists.md).
- `hermes/HermesSignal.tsx` uses proprietary `hs-*` classes on the legacy tone
  layer. **Defer:** consolidate into ds/ status system in the component pass.

## 3. Surfaces, i18n & RTL — STRONG core, staged RTL debt

- FA/EN/DE multi-locale is correctly wired; per-locale reference frames exist in
  Figma. `dir=rtl/ltr` applied at the shell.
- **Logical properties widely adopted:** 1,247 logical (`ps-`/`pe-`/`ms-`/`me-`)
  + 439 `border-inline-*`. **Remaining physical:** ~1,051 `border-l/r/t/b` across
  224 files, ~108 `ml-/mr-/pl-/pr-` across 42 files, 23 absolute/fixed
  `left-/right-` (mostly landing). Nav and overlays already **enforce** logical
  props via tests (`runtime-shell-nav.test.tsx:91`, `runtime-overlays.test.tsx`).
  **Defer:** staged physical→logical migration; the RTL checklist governs new
  code so the debt does not grow.
- **Hard-coded English string in `ProvenExpertSeal`** noscript fallback
  ("View Hermes OS on ProvenExpert") is outside i18n. **Doc/Defer (rule 19):**
  the ProvenExpert seal is Production-critical and CSP-sensitive; the safe fix is
  to source the label from the `trust` i18n namespace and add a regression test,
  but it is **not** applied in a foundation-closure PR to avoid risking the seal.

## 4. Accessibility & responsive — STRONG, no critical violations

- Shared `ds-focus` ring on `:focus-visible` using `--color-focus-ring`;
  `FOCUS_RING` constant; overlay focus traps for Dialog/Drawer (tested).
- `prefers-reduced-motion` handled for ds animations (`foundation.test.ts`).
- Form label/error association in `FormField`/`Input`/`Textarea`; semantic
  landmarks + skip link (`#app-content`).
- Dark-only by design (industrial aesthetic) — no `prefers-color-scheme`; if
  light mode is ever required it is a separate token-set effort.
- **`text-muted` (#708694 on #071018 ≈ 3.5:1)** is below AA for *body* text.
  **Doc/enforced-by-contract:** the token is contract-scoped to
  "metadata, captions — NOT body text"; the a11y checklist forbids body use.
  Changing the value is prohibited (would drift from Figma).
- Minor low-severity items (heading-order not compile-enforced, limited
  `aria-live` coverage, no explicit skip-link test) are recorded in
  [`checklists.md`](checklists.md) as proactive enhancements.

---

## 5. Scope decision summary

| Finding | Severity | Decision |
|---|---|---|
| Token drift (Figma ↔ code) | — | **Fixed/enforced** — contract test |
| Contract not versionable/machine-checked | medium | **Fixed** — `token-contract.ts` + test |
| Hard-coded colours in decorative layers | medium | Defer (non-core) |
| Inline box-shadows (landing) | low | Defer |
| Missing ds/ core + industrial components | high/medium | Defer (component pass) |
| Physical RTL classes (bulk) | medium | Defer (staged), checklist-governed |
| ProvenExpert noscript i18n string | medium | Defer (rule 19), safe fix documented |
| `text-muted` body-text contrast | medium | Doc — contract-scoped, checklist-forbidden |
| a11y minor enhancements | low | Doc |

No code change was made before this manifest; the only code in the closure is
the token contract module + its test (both additive).

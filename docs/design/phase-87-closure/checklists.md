# PHASE 87 — Governance Checklists & Handoff

Operational checklists for anyone adding UI to Hermes OS. These are the
standing rules the closure formalizes; the token contract and the existing
`ds/` test suite enforce the machine-checkable parts.

---

## 1. Figma → code handoff

1. The design exists in **"Hermes OS – Design System"** (Talk-to-Figma, bridge
   :3055). Confirm the frame/node before coding — Figma is the source of truth
   (rule 6); no taste-based JSX design, no blind Figma-to-JSX conversion.
2. Read colors/spacing/type from the token frames, not by eye-dropping a screen.
3. Map every colour to a **contract token** (`token-contract.ts`). If a needed
   token does not exist, add it to Figma first, then to the contract + CSS +
   Tailwind together (see [`token-contract.md`](token-contract.md) §5).
4. Never introduce a raw hex/rgba in `src/components/ds/**` or a core surface.
   Decorative/visualization layers (`landing/**`, SVG canvases) are the only
   sanctioned exception and should still prefer tokens.
5. Reference the Figma node id in the PR for traceability (rule 16).

## 2. Component contribution rules

- New primitives live in `src/components/ds/`, are token-only, and export from
  `ds/index.ts`.
- Required states for interactive components: `hover`, `focus-visible`,
  `active`, `disabled`, `loading`, `error` — plus RTL correctness.
- Use Auto-Layout equivalents: fl*ex/grid + logical spacing tokens; no magic px.
- Add a runtime test under `ds/__tests__/` covering behavior (not snapshots
  unless stable). Do not weaken/skip existing tests (rule 9).
- Promote a feature-module component to `ds/` only with a variant/state audit;
  the ds/ gap list is in [`audit-manifest.md`](audit-manifest.md) §2.

## 3. RTL / LTR checklist

- Use **logical** properties/classes only in new code: `ps-`/`pe-`/`ms-`/`me-`,
  `start-`/`end-`, `border-inline-start/end`, `text-start/end`. Never `pl-`/`pr-`/
  `ml-`/`mr-`/`left-`/`right-`/`border-l/r` in flow layout.
- `ml-auto`/`mr-auto` flex alignment must become `ms-auto`/`me-auto`.
- Technical values (IDs, telemetry, timestamps) render LTR-isolated via
  `TechnicalValue` / `.ds-code` (`<bdi dir="ltr">`) — do not hand-format.
- Verify every surface in **both** `/en` (LTR) and `/fa` (RTL); check icon
  direction, chevrons, and truncation.
- Nav and overlays are test-enforced logical (`runtime-shell-nav.test.tsx`,
  `runtime-overlays.test.tsx`) — keep them that way.
- Existing physical-class debt (~1,051 border, ~108 margin) is a staged
  migration; do not add to it.

## 4. Accessibility checklist (WCAG 2.2 AA)

- Contrast: body text ≥ 4.5:1, large/UI ≥ 3:1. `text-muted` is **metadata only**
  (≈3.5:1) — never body. Status/reasoning colours always carry a non-color cue.
- Focus: visible ring on `:focus-visible` via `--color-focus-ring`
  (`ds-focus`); never remove outlines without an equivalent.
- Keyboard: full operability; Dialog/Drawer trap focus and restore it; skip link
  targets `#app-content`.
- Semantics: one `<h1>` per page, no skipped heading levels, landmark regions,
  labelled form controls with associated errors, `aria-live` for async status.
- Motion: honour `prefers-reduced-motion`; animate only `transform`/`opacity`.
- Zoom to 200% and long FA/DE strings must not clip or overflow.

## 5. Responsive checklist

Verify at **320 · 360 · 390 · 768 · 1024 · 1280 · 1440 · 1920**:

- No unintended horizontal overflow at 320.
- Navigation usable at every width; mobile has a defined table strategy
  (stack/scroll), not a squeezed desktop grid.
- Touch targets ≥ 44×44 on coarse pointers; hover-only affordances have a
  non-hover path (the `ds-glass` buoyancy is gated on `hover: hover`).
- Empty / loading / error / success states designed at mobile and desktop.

## 6. Performance & security checklist

- No new font or heavy asset without proven need; images responsive + optimized.
- No CLS / hydration mismatch; animate `transform`/`opacity` only.
- No new third-party script and no CSP widening without owner approval and the
  narrowest possible scope (rule 20). Trust seals (eNAMAD, ProvenExpert), footer,
  login and SMTP flow must not be disturbed (rule 19).
- Measure and report bundle/build impact in the PR.

## 7. Visual-regression procedure

The repo has no Playwright / pixel-diff harness, and none is added here (rule
10 — no heavy dependency without proven need). Until one is adopted, regression
is guarded by:

1. **Token drift** — `token-contract.test.ts` + `foundation.test.ts` (parse
   `globals.css` / `tailwind.config.ts`; fail CI on any value/mapping change).
2. **Structural runtime tests** — `ds/__tests__/runtime-*.test.tsx` assert
   behavior, RTL logical classes, focus traps, nav semantics.
3. **Manual evidence** — for a visible change, capture the affected surface in
   `/en` and `/fa` at the key viewports and attach to the PR.

If pixel-level regression becomes necessary, evaluate Playwright's built-in
screenshot assertions (already a dev-only, no-runtime-cost option) before any
third-party visual-diff service — and get owner sign-off first.

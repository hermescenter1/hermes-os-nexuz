# Phase 104 — Product Token Integration (Increment 104-A)

**Status:** tokens integrated and machine-gated. **No component consumes them yet, and this
change produces no visual difference anywhere in the product.**

| | |
|---|---|
| Increment | 104-A — product token bridge |
| Integration base | `b9424f3483aa0653dfeb014bef3d26fbae975bda` (`main`, merge of PR #62) |
| Machine source | `tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js` |
| Specification | [`01-hermes-design-dna.md`](01-hermes-design-dna.md) |
| Executable contract | `src/components/ds/phase104-token-contract.ts` |
| Gate | `src/components/ds/__tests__/phase104-token-contract.test.ts` |
| Phase 104 Figma file | `QcJcRaBv1NMrgb4pMshEVB` |

---

## 1. What this increment does, and what it deliberately does not

Phase 104's specification and its Figma executor were merged into `main` by PR #62. Both
live under `docs/` and `tools/`. Neither is reachable from the shipped product: the eleven
new colour values existed only on the design side, and nothing prevented the two layers
from drifting apart over time.

This increment closes exactly that gap and nothing else.

**Done here**

- All eleven `NEW_HUES` values are declared as CSS custom properties in `src/app/globals.css`.
- All eleven are exposed as Tailwind keys under `theme.extend.colors`.
- An executable contract derives every value *structurally* from the machine source.
- A test suite proves one-to-one coverage, exact value parity across all three layers, and
  every accessibility claim by computation — including the deliberate failures.

**Deliberately not done here**

- No component was changed. No utility class was added. No screen was redesigned.
- The Phase 87 contract (`src/components/ds/token-contract.ts`) was not touched. It is pinned
  to a different Figma file and node `12:4`; folding Phase 104 into it would assert a
  traceability that does not exist.
- Glass / Edge / Beacon tokenisation is increment 104-C. Product adoption is 104-D.

---

## 2. Why the values are derived instead of copied

`phase104-token-contract.ts` contains **no hex literal at all**. Every value is resolved at
module load from `INDUSTRIAL_STATES`, `REASONING_LADDER`, `HORIZON` and `BASE_SURFACES` in the
machine source, and each resolved value is checked against `NEW_HUES` before it is published.

That check **fails closed**: a mapped path that resolves to a value nobody justified in
`NEW_HUES` throws at import rather than silently shipping an unaudited colour. The test greps
the contract's own source for a six-digit hex and fails if one appears, so the derivation
cannot be quietly replaced by a copy later.

The token *count* is likewise derived — the gate asserts
`PHASE104_TOKEN_CONTRACT.length === NEW_HUES.length`. Adding a twelfth hue to the machine
source fails the build until it is mapped, justified and shipped through the same gate.

---

## 3. The eleven mappings

Contrast figures are **computed** by the gate against every canonical surface
(`#040A0F`, `#071018`, `#0C1720`, `#11212C`, `#152A36`); the figure quoted is the worst case,
which is always the lightest surface `#152A36` (`--color-surface-interactive`).

### 3.1 Industrial state ladder

| Key | DNA path | CSS variable | Tailwind | Value | Role | Worst case |
|---|---|---|---|---|---|---|
| `state-degraded` | `INDUSTRIAL_STATES[degraded].fill` | `--color-state-degraded` | `state-degraded` | `#C9B06A` | indicator | 6.99:1 |
| `state-critical` | `INDUSTRIAL_STATES[critical].fill` | `--color-state-critical` | `state-critical` | `#E03144` | indicator | 3.31:1 |
| `state-critical-text` | `INDUSTRIAL_STATES[critical].text` | `--color-state-critical-text` | `state-critical-text` | `#FF8A94` | text | 6.58:1 |
| `state-maintenance` | `INDUSTRIAL_STATES[maintenance].fill` | `--color-state-maintenance` | `state-maintenance` | `#5F7E9E` | indicator | 3.51:1 |
| `state-maintenance-text` | `INDUSTRIAL_STATES[maintenance].text` | `--color-state-maintenance-text` | `state-maintenance-text` | `#93AEC8` | text | 6.45:1 |
| `state-offline` | `INDUSTRIAL_STATES[offline].fill` | `--color-state-offline` | `state-offline` | `#6B7F8D` | indicator | 3.56:1 |

### 3.2 Reasoning ladder — readable partners

The canonical `--color-reasoning-*` values remain the indicator/border colours. These carry the
same meaning at text-legible luminance.

| Key | DNA path | CSS variable | Tailwind | Value | Role | Worst case |
|---|---|---|---|---|---|---|
| `reasoning-evidence-text` | `REASONING_LADDER[evidence].text` | `--color-reasoning-evidence-text` | `reasoning-evidence-text` | `#7FB0FF` | text | 6.75:1 |
| `reasoning-hypothesis-text` | `REASONING_LADDER[hypothesis].text` | `--color-reasoning-hypothesis-text` | `reasoning-hypothesis-text` | `#A99BFF` | text | 6.23:1 |
| `reasoning-contradiction-text` | `REASONING_LADDER[contradiction].text` | `--color-reasoning-contradiction-text` | `reasoning-contradiction-text` | `#FF7C86` | text | 5.99:1 |

### 3.3 Horizon atmosphere

| Key | DNA path | CSS variable | Tailwind | Value | Role | Worst case |
|---|---|---|---|---|---|---|
| `horizon-ember-fade` | `HORIZON.stops[emberFade].value` | `--color-horizon-ember-fade` | `horizon-ember-fade` | `#34201C` | atmosphere | 1.03:1 |
| `horizon-ember-core` | `HORIZON.stops[emberCore].value` | `--color-horizon-ember-core` | `horizon-ember-core` | `#6B3A22` | atmosphere | 1.59:1 |

---

## 4. Usage restrictions — these are enforced, not advisory

### 4.1 Indicator is not text

Three tokens are **indicator-only**, and the gate proves it by asserting they measure *below*
4.5:1 on every canonical surface:

| Token | Measured | Verdict | Use this for type instead |
|---|---|---|---|
| `--color-state-critical` | 3.31:1 | `EXPECTED-FAIL` as normal text | `--color-state-critical-text` |
| `--color-state-maintenance` | 3.51:1 | `EXPECTED-FAIL` as normal text | `--color-state-maintenance-text` |
| `--color-state-offline` | 3.56:1 | `EXPECTED-FAIL` as normal text | `--color-text-metadata` |

All three clear the 3:1 non-text threshold (WCAG 2.2 SC 1.4.11), so they are legitimate dots,
bars, borders and chart marks. They are not labels.

This is not a formality. `--color-state-critical` exists *because* CRITICAL must visibly
outrank ALARM, and the fully saturated red that achieves that is necessarily too dark to read
as small type on a dark surface. The split is the price of the severity ordering, and the
`EXPECTED-FAIL` assertion is what stops someone "fixing" it by lightening the indicator and
silently collapsing CRITICAL back into ALARM.

`--color-state-degraded` (6.99:1) is an indicator that *also* clears the text threshold; it
carries no `-text` partner because it does not need one.

### 4.2 Horizon is never a foreground

`--color-horizon-ember-fade` and `--color-horizon-ember-core` are background gradient stops.
They are **prohibited** as text, icon, border or data-surface fill. The gate does not merely
record the prohibition — it computes both values at **below 3:1 on every surface**, so there is
no legal foreground use to argue about.

Text never sits directly on Horizon. It sits on a Hermes Glass surface composited over it.
The wider Horizon policy (permitted surfaces, the mandatory vignette, the 22% ember-band cap,
and the machine list of surfaces where Horizon is forbidden behind dense engineering data)
lives in the machine source and in [`01-hermes-design-dna.md`](01-hermes-design-dna.md) §2.

### 4.3 Colour is never the only channel

Every industrial state also carries a glyph and an outline treatment in the machine source, so
severity survives greyscale, colour-vision deficiency and monochrome print (WCAG 2.2 SC 1.4.1).
Any component that later adopts these tokens must carry the non-colour cue with them; a state
rendered as a bare coloured dot is not a correct adoption.

---

## 5. What the gate asserts

`src/components/ds/__tests__/phase104-token-contract.test.ts`:

1. **Provenance** — the Figma file id, machine-source path, integration base SHA and
   specification path are recorded and shaped correctly.
2. **One-to-one coverage** — every value in the live `NEW_HUES` array is mapped by exactly one
   contract entry; the entry count equals `NEW_HUES.length`; no contract value falls outside
   `NEW_HUES`; every new hue carries a written justification.
3. **Structural derivation** — the contract source contains no hex literal, and every entry's
   value still resolves from its declared DNA path.
4. **Three-layer parity** — `globals.css` declares each token with the exact machine value, and
   `tailwind.config.ts` exposes each as `var(--…)`.
5. **Surface integrity** — every canonical surface in `BASE_SURFACES` still holds its shipped
   value in `globals.css`, so the contrast maths is measured against what actually renders.
6. **Computed accessibility** — text tokens ≥ 4.5:1 and indicator tokens ≥ 3:1 on *every*
   canonical surface; indicator-only tokens *fail* 4.5:1; Horizon tokens fall below 3:1.
7. **Phase 87 isolation** — no Phase 104 CSS variable leaks into `token-contract.ts`, and the
   Phase 87 contract still points at its own Figma node `12:4`.
8. **Documentation parity** — this document contains every mapping and the integration base.

---

## 6. Rollback

This increment is self-contained and independently revertible. Reverting the commit removes
two CSS `:root` declarations blocks' worth of custom properties, eleven Tailwind keys, one
contract, one test and this document. Because nothing consumes the tokens, no component,
screen, locale catalogue or API surface is affected.

```bash
git revert --no-commit <commit-sha>
```

---

## 7. Next increment

**104-B — Phase 104 CI workflow.** Wire the Phase 104 package test, the DNA contrast audit and
this product contract test into a dedicated path-filtered GitHub Actions workflow so none of
the above can regress silently.

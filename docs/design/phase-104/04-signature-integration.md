# Phase 104 — Signature Integration (Increment 104-C)

**Status:** the eight Hermes DNA signatures now exist as semantic CSS variables and a
machine-checked contract. The Glass tier family is tokenised **1:1 with zero visual change**.
Rail, Command, Triad, Beacon and Horizon have **variables and policy, but no product consumer
yet** — that adoption is 104-D and later, and this document does not claim it.

| | |
|---|---|
| Increment | 104-C — DNA signature variables and contract |
| Contract | `src/components/ds/phase104-signature-contract.ts` |
| Gate | `src/components/ds/__tests__/phase104-signature-contract.test.ts` (93 assertions) |
| Machine source | `tools/figma/hermes-phase104-visual-system/src/lib/dna-tokens.js` |

---

## 1. Why a second contract

Phase 104-A bridged the eleven new **hues**. A colour contract cannot see the parts of a design
language that actually rot: the rail's resting width, that Beacon appears at most once per view,
that Horizon is forbidden behind dense engineering data, that only the hero glass tier blurs.
Those are geometry and policy. They are derived here from the machine source and asserted, so a
spec change cannot leave the CSS behind and a CSS change cannot quietly leave the spec.

## 2. The eight signatures

| Signature | CSS variables | Consumer today |
|---|---|---|
| Hermes Horizon | 2 (`--color-horizon-ember-*`, from 104-A) | **none** — policy only |
| Hermes Deep Navy | 5 (Phase 87B surfaces, alias layer) | every page (pre-existing) |
| Hermes Glass | 9 | `.ds-glass-soft/card/interactive/elevated/hero` |
| Hermes Edge | 8 | `.ds-glass-*` borders |
| Hermes Beacon | 9 | **none** — alias layer ready |
| Hermes Rail | 8 | **none** |
| Hermes Command | 8 | **none** |
| Hermes Triad | 4 | **none** |

Every variable above is asserted to have **exactly one active declaration** in `globals.css`,
read from the PostCSS AST so a value in a comment cannot satisfy it.

## 3. The Glass tokenisation is provably 1:1

The 87L.1 filled-glass rules carried hard-coded `rgba()`. They now read variables. That is only
legitimate if it changes nothing, so:

- `SHIPPED_GLASS_TIERS` pins the literals each tier shipped with; the gate asserts the variables
  still hold exactly those values.
- The gate asserts each rule **references `var(--…)`** rather than restating the colour.
- The gate asserts **only the hero tier blurs**, per tier, from the AST.
- The lift ladder (`soft < card < elevated < interactive < hero`) and the interactive scale are
  read from `GLASS.liftLadder` / `GLASS.interactiveScale` in the machine source, not retyped, and
  checked against the shipped hover rules.

Verified from a real production build: the emitted CSS declares
`--glass-soft-fill: rgba(12,23,32,0.72)`, `--glass-card-fill-from: rgba(17,33,44,0.94)`,
`--glass-elevated-fill-from: rgba(20,38,50,0.96)`, `--glass-hero-fill-from: rgba(20,38,50,0.88)`
and `--glass-hero-backdrop: blur(18px) saturate(1.25)`, and `.ds-glass-soft` resolves to
`… var(--glass-soft-fill); border: var(--edge-width) solid var(--glass-soft-border) …`.
Computed values are unchanged, so rendering is unchanged.

CSS delta: **122,414 → 125,031 bytes (+2,617)**, entirely the new custom-property declarations.

### 3.1 One rule was deliberately NOT tokenised

`.ds-glass` (the older overlay utility) keeps its literals. `foundation.test.ts` pins the literal
`backdrop-filter: blur(` inside that rule to prove the overlay tier really blurs. Replacing the
literal with a variable would hide the value from that gate. Satisfying a check by making it
unable to see what it checks is the wrong direction, so the literal stays.

---

## 4. Open owner decisions — recorded, not silently resolved

### 4.1 The machine source's Glass SPEC does not match what ships

`GLASS.tiers` in `dna-tokens.js` is a specification and it diverges from the product:

| Tier | Spec fill / blur | Shipped fill / blur |
|---|---|---|
| soft | `rgba(12,23,32,0.55)` / 10px | `rgba(12,23,32,0.72)` / **none** |
| card | `rgba(12,23,32,0.72)` / 14px | `rgba(17,33,44,0.94)` / **none** |
| elevated | `rgba(17,33,44,0.80)` / 18px | `rgba(20,38,50,0.96)` / **none** |
| hero | `rgba(20,38,50,0.86)` / 22px | `rgba(20,38,50,0.88)` / 18px |

The divergence is intentional in origin: 87L.1 dropped `backdrop-filter` on the app tiers because
blur has nothing to sample on a solid dark shell and only costs compositing time on dense
dashboards.

**Phase 104-C did not resolve this.** Adopting the spec numbers would change how every card in the
product renders — a visual decision for the owner, not something to smuggle in under the word
"migration". The gate asserts the two still differ, so collapsing them in *either* direction has
to be a deliberate, reviewed change.

**Owner decision required:** amend the spec to match the shipped values, or approve a visual
change that adopts the spec.

### 4.2 The retired glow utilities are still shipped

The Phase 104 DNA notes state that `03-brand-system.md:320` retired `.glow-*`, `.text-glow*` and
`.landing-scanlines`. They are **still defined in `globals.css`**, and four of them still have
consumers in `src/`:

| Utility | Consumer files |
|---|---|
| `.glow-signal` | 1 |
| `.glow-signal-strong` | 1 |
| `.glow-ice` | 0 |
| `.glow-danger` | 0 |
| `.text-glow` | 1 |
| `.landing-scanlines` | 2 |

Deleting shipped utilities that pages still reference is not a token increment's call. What Phase
104 **is** held to, and what the gate asserts, is that its own signature layer introduces no glow,
bloom, scanline or text-shadow — checked on the AST, because the prose that forbids glow contains
the word "glow" and a substring scan cannot tell a prohibition from a violation.

**Owner decision required:** migrate the six remaining consumers and delete the utilities, or
amend the DNA notes to stop describing them as retired.

---

## 5. Mutation evidence

The gate was mutation-tested against the real `globals.css`; each mutation was reverted:

| Mutation | Result |
|---|---|
| Drift a shipped Glass literal (`--glass-soft-fill` → the spec value) | 1 failed / 92 passed |
| Break `--rail-width` away from the DNA (72 → 80) | 1 failed / 92 passed |
| Add an outer glow variable to the Phase 104 layer | 1 failed / 92 passed |
| Un-tokenise one glass rule back to a literal | 1 failed / 92 passed |

## 6. Rollback

```bash
git revert --no-commit <commit-sha>
```

Reverting restores the hard-coded `rgba()` in the five `.ds-glass-*` rules and removes the
signature variables, the contract and its gate. No component consumes the new variables, so no
screen, locale catalogue or API surface is affected.

## 7. Next

**104-D** — adopt Rail, Command, Triad and Beacon in the App Shell and Workspace Home, giving each
signature its first real consumer. Until that lands, five of the eight signatures are declared and
gated but unconsumed, and this document says so rather than implying otherwise.

# Phase 104 — Signature Integration (Increment 104-C)

**Status:** the eight Hermes DNA signatures now exist as semantic CSS variables and a
machine-checked contract. The Glass tier family is tokenised **1:1 with zero visual change**.
Rail, Command, Triad, Beacon and Horizon have **variables and policy, but no product consumer
yet** — that adoption is 104-D and later, and this document does not claim it.

| | |
|---|---|
| Increment | 104-C — DNA signature variables and contract |
| Contract | `src/components/ds/phase104-signature-contract.ts` |
| Gate | `src/components/ds/__tests__/phase104-signature-contract.test.ts` — **153 assertions** as of this commit. A point-in-time measurement, deliberately **not** gated: it is not derivable from the contract, and pinning it would turn every new assertion into a documentation edit. The per-signature variable counts below **are** derived and gated. |
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
| Hermes Horizon | 2 | **none** — policy only |
| Hermes Deep Navy | 5 | every page (pre-existing) |
| Hermes Glass | 26 | `.ds-glass-soft/card/interactive/elevated/hero` |
| Hermes Edge | 8 | `.ds-glass-*` borders |
| Hermes Beacon | 9 | **none** — alias layer ready |
| Hermes Rail | 8 | **none** |
| Hermes Command | 8 | **none** |
| Hermes Triad | 4 | **none** |
| **Total** | **70** | |

Every variable above is asserted to have **exactly one active declaration** in `globals.css`,
read from the PostCSS AST so a value in a comment cannot satisfy it.

These counts are **derived from the executable contract and gated** — the suite reads
`SIGNATURE_CONTRACT[].cssVars.length` and requires this table to publish the same numbers, so
the document cannot silently contradict the code again. That is a direct response to review:
an earlier revision of this file still said Glass owned **9** variables in its summary while
§4.3 below already said **26**.

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

## 4. Owner decisions

### 4.1 The Glass conflict — RESOLVED in favour of the shipped rendering

`GLASS.tiers` in `dna-tokens.js` used to be an aspirational specification that diverged from the
product. **The owner has ruled the restrained operational rendering canonical**, and the machine
source has been updated to agree with it:

| Tier | Was (spec) | Now (canonical, = shipped) |
|---|---|---|
| soft | `rgba(12,23,32,0.55)` / blur 10 | `rgba(12,23,32,0.72)` / **blur 0** |
| card | `rgba(12,23,32,0.72)` / blur 14 | `rgba(17,33,44,0.94)` / **blur 0** |
| interactive | `rgba(17,33,44,0.74)` / blur 14 | `rgba(17,33,44,0.94)` / **blur 0** |
| elevated | `rgba(17,33,44,0.80)` / blur 18 | `rgba(20,38,50,0.96)` / **blur 0** |
| hero | `rgba(20,38,50,0.86)` / blur 22 | `rgba(20,38,50,0.88)` / **blur 18** |

The ruling, as encoded:

- operational cards stay **filled and high-legibility** (alpha 0.94–0.96);
- **blur is reserved for hero and overlay contexts**, never ordinary operational cards — it
  samples nothing on a solid dark shell and only costs compositing time on dense dashboards;
- **`interactive` shares the card surface recipe** while keeping its own distinct interaction: a
  deeper lift (−6 vs −3) and the 1.012 scale. The gate asserts both halves of that sentence.

**No rendering changed.** `globals.css` was already the canonical source; only the design-side
spec moved. The lift ladder (−2/−3/−5/−6/−8), the 1.012 scale and the 0.72 Horizon alpha floor
are unchanged, and the executor's asset contract is unaffected because `dna-spec.js` derives the
variable count from structure, not values (still 102 variables / 205 appliable assets).

The Figma plugin bundle was **rebuilt deterministically** so it no longer carries the retired
values: two consecutive builds on the same tree produced the identical
`dist/code.js` sha256 `e3faea25…`, `build-report.json` agrees with it, and the package suite is
**85 passed / 0 failed**. `Apply` was **not** run.

> Worth recording: the package suite passed 85/0 *while the bundle was stale* — the tests compare
> `dist` against `build-report.json`, and both regenerate together, so nothing detects "sources
> changed, bundle not rebuilt". The rebuild here was done deliberately, not because a gate caught it.

The gate now asserts spec and shipped values **match**, so drifting them apart again fails.

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

**Owner decision — RECORDED, executed in a later increment.** Nothing is deleted in this
correction. The agreed sequence is:

1. During **104-D / 104-G** migration, the remaining `landing-scanlines` and `glow-signal`
   consumers migrate to the **Hermes Edge** and **Hermes Beacon** primitives.
2. Once the consumer inventory for a utility reaches **zero**, the unused `.glow-*`, `.text-glow*`
   and scanline utilities are removed.
3. **Deletion happens only after the inventory is zero** — never speculatively, because a utility
   deleted while a page still references it is a silent visual regression on that page.

Until then the utilities stay defined, and the gate holds Phase 104 to what it can actually own:
its own signature layer introduces no glow, bloom, scanline or text-shadow.

### 4.3 The Glass parity gap — CLOSED

External review found that the contract owned only **9 of the 26** active `--glass-*` variables,
and proved it by setting `--glass-card-fill-to` to magenta: **all 93 assertions of the then-current
gate passed** while every card in the product would have rendered with a magenta gradient. (Those
93 are the historical figure at commit `f15b73e`; the gate now stands at 143.)

`GLASS_VARIABLE_CONTRACT` is now **complete (26/26)**, and the gate requires **set equality**
between the owned keys and the active `--glass-*` declarations parsed from the CSS — so a
variable that is added, removed, renamed or left unowned fails, not merely one that drifts. Each
variable must appear as **exactly one active declaration** whose parsed value matches exactly, and
every `--glass-*` referenced by a `.ds-glass-*` rule must be owned.

---

## 5. Mutation evidence

The gate was mutation-tested against the real `globals.css`; each mutation was reverted. Results
below were **re-measured against the current 143-assertion gate**, not carried over from the
104-C run:

| Mutation | Result |
|---|---|
| Drift a shipped Glass literal (`--glass-soft-fill` → the retired spec value) | **2 failed / 151 passed** |
| Set `--glass-card-fill-to` to magenta (the exact hole review found) | **2 failed / 151 passed** |
| Delete an owned Glass variable (`--glass-card-inner`) | **3 failed / 150 passed** |
| Break `--rail-width` away from the DNA (72 → 80) | **1 failed / 152 passed** |
| Add an outer glow variable to the Phase 104 layer | **1 failed / 152 passed** |
| Un-tokenise one glass rule back to a literal | **1 failed / 152 passed** |

The first three are the ones that mattered: before the parity gap was closed, the magenta
mutation passed 93/93 and the deletion would not have been noticed at all.

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

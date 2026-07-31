# Design Token Contract — Governance

The **machine-checked** contract lives in code:
[`src/components/ds/token-contract.ts`](../../../src/components/ds/token-contract.ts),
verified by
[`token-contract.test.ts`](../../../src/components/ds/__tests__/token-contract.test.ts).
This document is the human-readable governance around it. Where this prose and
the `.ts` file ever disagree, **the `.ts` file wins** — it is the versionable
source and the thing CI enforces.

## 1. The chain of truth

```
Figma variable            CSS custom property           Tailwind key              React
(collection               (src/app/globals.css :root)   (tailwind.config.ts       (components use the
 "Semantic Colors",                                       theme.extend.colors)      Tailwind class only —
 frame 03 / node 12:4)                                                              never a raw hex)

Color/Brand/Primary   →   --color-brand-primary  →      brand-primary        →     bg-brand-primary
     #16D9E3                    #16D9E3                  var(--color-brand-primary)
```

Every row of `TOKEN_CONTRACT` records: `figma` (variable name), `cssVar`,
`value`, `tailwind` key, `group`, `usage`, and (where relevant) measured `a11y`
contrast. The test asserts rows 1–3 of the chain stay in lockstep; the React
rule (no raw hex in `ds/`) is enforced by review + the audit's grep baseline.

## 2. Naming rules

- Tokens are **semantic**, never visual. Use `surface-elevated`, `text-primary`,
  `action`/`brand-primary`, `status-danger`, `reasoning-evidence` — never
  `blue-500` / `gray-300` as a product API.
- Figma path `Color/<Group>/<Role>` maps to `--color-<group>-<role>` and Tailwind
  `<group>-<role>`. Compound roles keep the full path
  (`Color/Brand/Hover → --color-brand-primary-hover`); this is the implemented
  spelling and supersedes the earlier 87A *proposal* in
  `docs/design/phase-87a/05-figma-token-mapping.md` (which the contract now
  makes authoritative).
- Alpha ladders (`…-subtle` 10% fill / `…-border` 24%) are derived from the base
  color; they are not independent brand values.

## 3. Groups

| Group | Purpose |
|---|---|
| `background` | app canvas (Obsidian) — 70% of every screen |
| `surface` | cards, panels, elevated overlays, glass |
| `brand` | Hermes Cyan — CTAs, active, live signal (+ hover/pressed/on-brand) |
| `text` | primary / secondary (Titanium) / muted / disabled / inverse |
| `border` | structural (default) and active/selected |
| `status` | success / warning (Amber) / danger (Safety Red) / information — **semantic only, never decorative** |
| `reasoning` | Industrial Brain layer — hypothesis (Violet), evidence (Azure), contradiction, missing, decision |
| `focus` | ring (`:focus-visible` only) + halo (on cyan fills) |

## 4. Accessibility constraints baked into the contract

- `text-muted` (#708694) is **metadata/caption only** — ~3.5:1 on Base, below AA
  for body. Never use it for readable body content (checklist-enforced).
- `brand-on-brand` (#071018) is the only permitted foreground on cyan fills —
  **white-on-cyan is prohibited**.
- Every status/reasoning color is paired with a non-color cue (icon, label,
  dashed treatment for `missing`) so meaning is never color-only (SC 1.4.1).

## 5. Changing a token

1. Edit the Figma variable in "Semantic Colors" (frame 12:4) **first** — Figma is
   the source of truth (rule 6: no taste-based value changes in code).
2. Mirror the value in `token-contract.ts` and `globals.css` in the same change.
3. `npm run test` — `token-contract.test.ts` fails until all three agree.
4. New token: add the `--color-*` var, the Tailwind mapping, and the contract
   row together; the test enforces all three exist.

## 6. Migration & backward compatibility

The legacy Phase 51C layer (`--bg`, `--signal`, `--ink`, `--warn`, …) stays live
(3,749 uses). Migration is **additive and classified**, never find-and-replace:
each legacy consumer is reclassified to a semantic canonical token
(`--signal` → `brand-primary` for actions, `status-success` for healthy state)
in a staged pass. `foundation.test.ts` guards that the legacy values are **not**
altered, so no in-flight page shifts. Do not delete a legacy token before a
grep proves zero consumers.

## 7. Primary consumers

- `src/components/ds/**` — the primitive library (token-only).
- `src/components/ui/**` — compatibility wrappers mapping legacy APIs to
  `ds-glass-*` recipes.
- `tailwind.config.ts` — exposes every canonical token as a utility.
- App surfaces under `src/app/**` consume via Tailwind classes.

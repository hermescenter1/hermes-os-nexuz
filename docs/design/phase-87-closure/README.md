# PHASE 87 — Premium Visual Foundation · Closure & Acceptance Manifest

Status: **foundation closed, Production-ready.** This directory is the governance
capstone for Phase 87 (the premium visual foundation before v1). It ties the
now-live Figma source of truth to the shipped code and locks the design-token
contract in CI.

> **Scope boundary.** Phase 87 = premium visual *foundation*. The immersive /
> cinematic redesign (heavy WebGL, full experience rework) is **Phase 103**,
> after v1, and is deliberately out of scope here. See
> [Deferred to Phase 103](#deferred-to-phase-103).

---

## 1. What "closure" means

Phase 87 was executed across sub-phases 87A–87L (see `docs/design/phase-87a/`):

| Sub-phase | Delivered | Where |
|---|---|---|
| 87A | Brand system, Figma construction spec, token-mapping plan, visual audit, component inventory | `docs/design/phase-87a/` |
| 87B | Canonical semantic token layer + `ds/` primitive library + foundation tests | `src/app/globals.css`, `src/components/ds/`, `tailwind.config.ts` |
| 87C–87L | App shell, public site, auth experience, dashboard/CRM/ERP/assets/CMMS/documents/org surfaces, glass-card visual system, cross-module consistency | `src/components/**`, `src/app/**` |

When those sub-phases ran, **the Figma file did not yet exist** — the 87A docs
were the *plan* (`docs/design/phase-87a/README.md` still carried a
"FIGMA CONNECTION REQUIRED" caveat). This closure was executed with a **live
Talk-to-Figma connection** to the now-existing file **"Hermes OS – Design
System"**, and confirms the code matches the design source. It adds the two
things the prior sub-phases could not: a machine-checked, versionable
**token contract bound to real Figma nodes**, and this governance capstone.

---

## 2. Figma source of truth (verified live)

Connected via Talk-to-Figma MCP (bridge :3055, channel `eesk9gpi`) and read
read-only. File: **"Hermes OS – Design System"** (single page, 34 frames).

| Figma frame | Node | Role |
|---|---|---|
| 00 — Cover | `2:2` | Governance cover |
| 02 — Foundations | `12:117` | Spacing / radius / elevation / grid foundations |
| 03 — Variables and Tokens | `12:4` | **Semantic Colors collection — token source of truth** |
| 04 — Typography | `12:95` | Type scale |
| 06 — Core Components | `12:189` | Component gallery |
| 24 — Prototype Flow | `30:1397` | Prototype |
| 25 — Developer Handoff | `30:1402` | Handoff |

The six reference experiences (PHASE 87A.3), each Desktop/Mobile × EN/FA:

| Experience | Desktop EN | Desktop FA | Mobile EN | Mobile FA |
|---|---|---|---|---|
| Homepage | `26:783` | `28:941` | `28:1001` | `28:1032` |
| Platform | `28:1055` | `29:1093` | `30:1123` | `30:1148` |
| Login | `30:1171` | `30:1205` | `30:1229` | `30:1246` |
| Copilot | `30:1264` | `30:1320` | `30:1352` | `30:1376` |
| Dashboard | `12:260` | `24:632` | `24:466` | `25:733` |
| IndustrialBrain | `18:381` | `24:672` | `24:494` | `25:760` |

Every semantic-color token read from frame `12:4` matches the code exactly —
**no token drift** (verified both by the audit and by the new contract test).

---

## 3. Deliverables of this closure

| Deliverable | File | Kind |
|---|---|---|
| Versionable, machine-readable token contract (Figma node → CSS var → Tailwind → value → usage → WCAG) | `src/components/ds/token-contract.ts` | code (data) |
| Data-driven drift guard — asserts every contract token in `globals.css` **and** `tailwind.config.ts` | `src/components/ds/__tests__/token-contract.test.ts` | test |
| Repository + visual audit (Section A) | [`audit-manifest.md`](audit-manifest.md) | doc |
| Token contract governance (naming rules, migration, consumers) | [`token-contract.md`](token-contract.md) | doc |
| RTL/LTR · a11y · responsive checklists, Figma-to-code handoff, component contribution rules, visual-regression procedure | [`checklists.md`](checklists.md) | doc |
| This acceptance manifest | `README.md` | doc |

No production runtime code, API, Prisma schema, auth, RBAC, middleware, CSP,
trust seal (eNAMAD / ProvenExpert), footer, or SMTP flow was changed by this
closure. It is additive: one token-data module, one test, and documentation.

---

## 4. Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| Figma is the source of truth and is reachable | ✅ | live channel `eesk9gpi`, frame `12:4` read |
| Canonical tokens match Figma exactly (no drift) | ✅ | `token-contract.test.ts` (28+ tokens) + `foundation.test.ts` (21) |
| Token contract is versionable and machine-checked | ✅ | `token-contract.ts` + CI test |
| Traceability Figma ↔ CSS var ↔ Tailwind | ✅ | contract records Figma node + cssVar + tailwind key |
| No behavior / API / auth / RBAC / tenant / OT / CMMS change | ✅ | diff is docs + token-data + test only |
| Trust seals, footer, login, SMTP untouched | ✅ | not in diff |
| Backward compatibility (legacy token layer intact) | ✅ | `foundation.test.ts` asserts legacy `--bg`/`--signal` unchanged; 3,749 legacy uses preserved |
| Accessibility baseline documented | ✅ | [`checklists.md`](checklists.md) + audit |
| RTL/LTR and FA/EN/DE first-class | ✅ | reference frames per-locale; audit §RTL |
| No new dependency, no CSP widening | ✅ | none added |

Validation gates (lint, typecheck, unit/integration tests, build, `git diff
--check`) are run on the closure branch and reported in the PR.

---

## 5. Deferred to Phase 103

Immersive/cinematic redesign, heavy WebGL, and full per-surface experience
rework are Phase 103 (post-v1) and were not attempted here.

## 6. In-scope debt deferred within Phase 87 (documented, not silently dropped)

The audit ([`audit-manifest.md`](audit-manifest.md)) records findings that are
real but whose fixes are **large, cross-cutting sweeps** that would violate the
Phase 87 rule "do not break the whole UI at once" if forced in this closure.
They are recorded with exact locations and safe-fix approaches:

- Physical → logical RTL class migration (bulk): ~1,051 physical border + ~108
  physical margin classes remain (alongside 1,247 logical adoptions). Nav and
  overlays are already enforced logical by tests; the remainder is a staged
  migration.
- `ds/` component-library completion: 13 core components + 7 industrial
  reasoning primitives named in the Figma "Core Components" board are not yet
  first-class `ds/` primitives (several exist in feature modules / app-shell).
- `ProvenExpertSeal` noscript fallback carries one hard-coded English string —
  a real i18n gap, but the seal is Production-critical and CSP-sensitive
  (Phase 19 rule: trust seals must not be damaged), so the fix is specified in
  the audit rather than applied in a foundation-closure PR.

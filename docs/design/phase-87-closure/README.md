# PHASE 87 — Premium Visual Foundation · Governance & Traceability Foundation

> ## ⚠️ Status: Phase 87 is **PARTIAL — not closed, not accepted**
>
> This directory delivers the **governance & traceability foundation only**
> (audit + versionable, machine-checked token contract + docs). It is **not** a
> Phase 87 closure and must not be treated as acceptance.
>
> **`BLOCKED_BY_FIGMA_WRITE_ACCESS`** — the "Figma Native Productionization"
> half of Phase 87 (native color **Variables** + semantic modes; typography/
> spacing/radius/elevation/motion **Styles/Variables**; converting the 23 code
> primitives to native **Components/Variants**; completing 13 core + 7 industrial
> native components) **cannot be performed** with the connected tooling. The
> Talk-to-Figma MCP exposes node/shape/property write (frames, text, fills,
> layout) but **no** create/update tool for Figma Variables, Styles, or
> Components — proven by the capability preflight below. Drawing frames as
> fake components/variables is an explicitly prohibited workaround, so it was
> not done.
>
> See [Capability preflight](#0-capability-preflight-figma-write) and
> [Remaining Phase 87 gaps](#7-remaining-phase-87-gaps).

This directory ties the now-live Figma source of truth to the shipped code and
locks the design-token contract in CI. It is a real, useful foundation — but
only one part of Phase 87.

## 0. Capability preflight (Figma write)

Performed live (channel `eesk9gpi`) before any further work:

| Capability | Tool(s) | Result |
|---|---|---|
| Node/frame/shape/text create | `create_frame`, `create_rectangle`, `create_text` | ✅ available |
| Property update (fill/stroke/layout/radius/…) | `set_fill_color`, `set_layout_mode`, … | ✅ available |
| Node delete | `delete_node` | ✅ available |
| **Color Variables + semantic modes** | *(none)* | ❌ **no tool** |
| **Paint/Text/Effect Styles** | `get_styles` read-only (returns empty) | ❌ **no create tool** |
| **Components / variant sets** | `create_component_instance` needs an existing key; `get_local_components` = 0 | ❌ **no create tool** |

**Non-destructive proof.** Created a probe frame off-canvas
(`__phase87_write_probe__DELETE_ME`, id `131:2`, x/y 20000) with fill `#0B1720`,
read it back, updated the fill to Hermes Cyan `#16D9E3`, read it back, then
deleted it and verified the node is gone and the page is back to 34 frames.
Node/property write works; the **native Variables/Styles/Components** APIs the
phase requires are absent, hence `BLOCKED_BY_FIGMA_WRITE_ACCESS`.

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

## 3. Deliverables of this foundation

| Deliverable | File | Kind |
|---|---|---|
| Versionable, machine-readable token contract (Figma node → CSS var → Tailwind → value → usage → WCAG) | `src/components/ds/token-contract.ts` | code (data) |
| Data-driven drift guard — asserts every contract token in `globals.css` **and** `tailwind.config.ts` | `src/components/ds/__tests__/token-contract.test.ts` | test |
| Repository + visual audit (Section A) | [`audit-manifest.md`](audit-manifest.md) | doc |
| Token contract governance (naming rules, migration, consumers) | [`token-contract.md`](token-contract.md) | doc |
| RTL/LTR · a11y · responsive checklists, Figma-to-code handoff, component contribution rules, visual-regression procedure | [`checklists.md`](checklists.md) | doc |
| This governance manifest | `README.md` | doc |

No production runtime code, API, Prisma schema, auth, RBAC, middleware, CSP,
trust seal (eNAMAD / ProvenExpert), footer, or SMTP flow was changed. It is
additive: one token-data module, one test, and documentation.

---

## 4. What this PR does and does **not** satisfy

These governance/traceability checks hold for **this PR**:

| Governance check | Result | Evidence |
|---|---|---|
| Figma is the source of truth and is reachable (read) | ✅ | live channel `eesk9gpi`, frame `12:4` read |
| Canonical code tokens match Figma exactly (no drift) | ✅ | `token-contract.test.ts` + `foundation.test.ts` |
| Token contract is versionable and machine-checked | ✅ | `token-contract.ts` + CI test |
| Traceability Figma node ↔ CSS var ↔ Tailwind | ✅ | contract records all three |
| No behavior / API / auth / RBAC / tenant / OT / CMMS change | ✅ | diff is docs + token-data + test only |
| Trust seals, footer, login, SMTP untouched | ✅ | not in diff |
| Backward compatibility (legacy token layer intact) | ✅ | `foundation.test.ts` + 3,749 legacy uses preserved |
| No new dependency, no CSP widening | ✅ | none added |

The full **Phase 87 acceptance** criteria are **NOT** met by this PR:

| Phase 87 acceptance criterion | Result |
|---|---|
| Figma **write** / native productionization | ❌ `BLOCKED_BY_FIGMA_WRITE_ACCESS` (no Variables/Styles/Components create tools) |
| Native color Variables + semantic modes | ❌ blocked |
| Native typography/spacing/radius/elevation/motion styles/variables | ❌ blocked |
| 23 primitives → native components/variants | ❌ blocked |
| 13 core + 7 industrial native components | ❌ blocked |
| Reference experiences connected to native variables/components | ❌ blocked |
| Runtime surfaces updated to the foundation | ❌ not done (would follow native productionization) |
| Real responsive / RTL / a11y **evidence** on changed surfaces | ❌ n/a (no surfaces changed) |

---

## 5. Deferred to Phase 103

Immersive/cinematic redesign, heavy WebGL, and full per-surface experience
rework are Phase 103 (post-v1) and were not attempted here.

## 6. In-scope debt (documented, not silently dropped)

Recorded in the audit ([`audit-manifest.md`](audit-manifest.md)) with exact
locations and safe-fix approaches: staged physical→logical RTL migration
(~1,051 border + ~108 margin classes remain; nav/overlays already enforced by
tests); `ds/` completion (13 core + 7 industrial primitives, several already in
feature modules); `ProvenExpertSeal` noscript i18n string (real gap, seal is
Production-critical + CSP-sensitive so not touched here).

## 7. Remaining Phase 87 gaps

**`REMAINING_PHASE_87_GAPS` ≠ NONE → Phase 87 is PARTIAL, not complete.**

1. **Figma native productionization — BLOCKED_BY_FIGMA_WRITE_ACCESS.** The
   Talk-to-Figma MCP has no create/update tool for Variables, Styles, or
   Components (see §0). Native Variables/modes, Styles, and Component/variant
   sets cannot be built without either (a) a Figma MCP that exposes the
   Variables/Styles/Components plugin APIs, or (b) the design team building them
   in Figma directly. Faking them as plain frames is a prohibited workaround.
2. **Runtime surface productionization** (public shell, login, dashboard shell,
   Industrial Brain reference surfaces) and the token contract's runtime
   adoption depend on (1) and are not done.
3. **Executable responsive / RTL / a11y evidence** on changed surfaces is not
   produced because no surface was changed.

**Unblock path:** provide a Figma integration with native Variables/Styles/
Components write access (or have the design team author the native library),
then this same branch/PR can proceed to the productionization + code + evidence
work. Until then this PR should be read as the **governance foundation only**
and must not be accepted as a Phase 87 closure.

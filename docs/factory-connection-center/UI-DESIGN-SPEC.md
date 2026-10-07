# UI-DESIGN-SPEC.md

HFCC visual and interaction specification. Phase 0 — design only.
Built on the **existing** Hermes design system; this is not a new visual
language.

---

## 1. DESIGN LANGUAGE — INHERITED, NOT INVENTED

The established Hermes language is: premium industrial, dark glassmorphism,
ice-blue and cyan accents, strong readability, clear hierarchy, professional
enterprise appearance. HFCC adopts it unchanged.

**Enforced by contracts already in the repository:**

```
src/components/ds/token-contract.ts
src/components/ds/phase104-token-contract.ts
src/components/ds/phase104-signature-contract.ts
```

These are **enforced**, not advisory. HFCC introduces no raw colour, spacing or
type value — every value resolves to a registered token. A new token, if one
proves necessary, is registered in the contract, not improvised in a component.

**HFCC must not look like a generic SaaS template.** Concretely, that means:

- Values are **technical values**, not marketing numbers: `1.84 s`, not `1.8s`;
  `99.1 % good`, not a smiley; fingerprints in grouped lowercase hex, not
  truncated with an ellipsis.
- Monospace tabular numerals for every measurement, so columns align and a
  changing value does not reflow the row. The `TechnicalValue` component
  already exists for exactly this.
- No decorative illustration, no gradient hero, no "🎉" on completion. A
  commissioning record is a legal-adjacent document.
- Density is **high by default**. An OT engineer comparing 400 tags needs rows,
  not cards.

---

## 2. COMPONENT REUSE — 23 EXIST, ~4 ARE NEW

From `src/components/ds/`:

| Existing component | HFCC use |
|---|---|
| `StatusIndicator` | every state badge: lifecycle, gateway, collector, relay, shadow, certificate |
| `KpiCard` | the Overview health cards |
| `TechnicalValue` | lag, queue depth, offsets, counts, fingerprints |
| `Card` | every panel |
| `Badge` | `executionMode` flags, severity, protocol support |
| `Alert` | HOLD banners, blocker notices, the "no password here" intake notice |
| `Tabs` | connectivity run history, FAT per-mode columns |
| `Drawer` | **the evidence drawer** |
| `Dialog` | transition confirmations, one-time credential reveal, revoke |
| `Skeleton` | every loading state |
| `EmptyState` | the *empty* and *locked* states |
| `ErrorState` | the *unavailable* and *forbidden* states |
| `FormField` / `Input` / `Textarea` / `Checkbox` / `Radio` / `Switch` | the intake wizard and all settings |
| `Button` / `IconButton` | all actions |
| `Tooltip` | units, abbreviations, check definitions |
| `Spinner` | in-flight operations |
| `InsightCard` | security preflight verdict summary |
| `a11y.tsx`, `direction.ts`, `cn.ts`, `layers.ts`, `overlay.ts` | accessibility, RTL, class merging, z-index, overlays |

### Genuinely new compositions (four)

1. **`FactoryProgressStepper`** — the 9-step lifecycle stepper. Not a generic
   wizard: it must render *blocking* states (`SECURITY_HOLD`, `HOLD`,
   `SUSPENDED`) as an interruption on the current step rather than a step of
   their own, and `REVOKED` as a terminal overlay on the whole bar.
2. **`NetworkTopologyView`** — inline SVG, no library.
   `Plant → Collector → DMZ Relay → 443 → Hermes CORE`, with per-hop health and
   a one-way arrow set that makes "outbound only" visible. **No inline
   `<style>`** (CSP), **no `dangerouslySetInnerHTML`** (XSS gate). Fully
   keyboard-navigable with a text-equivalent table behind a disclosure, because
   a diagram alone is not accessible.
3. **`CertificateFingerprintViewer`** — subject, issuer, serial, validity window,
   and the SHA-256 in grouped lowercase hex with a copy affordance. Shows
   **declared vs. observed** side by side, and renders `MISMATCH` as a
   full-width alert, not a subtle colour change.
4. **`TagMappingTable`** — virtualised (400–20 000 rows), per-column filter and
   sort, inline row-level error display with the error code, and a
   preview-vs-committed mode distinction. This is the one component where the
   existing DS has no near-equivalent.

The `FatChecklist`, `QuarantinePanel`, `AuditTimeline` and `BlockerList` are
**compositions of existing primitives**, not new components.

> **Two known DS hazards.**
> - The `ds` barrel's `buttonVariants` is **client-tainted**; HFCC server
>   components must not import it from the barrel.
> - **Vitest 4 (oxc) cannot import `.tsx`**, so the four new components' tests
>   must use the established workaround rather than a direct import.

---

## 3. STATUS COLOUR SYSTEM — ACCESSIBLE AND NEVER COLOUR-ALONE

| State class | Token role | Glyph | Text |
|---|---|---|---|
| healthy / pass | positive | `⬤` filled | `LIVE`, `PASS`, `CONNECTED` |
| warning / degraded | caution | `◐` half | `STALE`, `MAJOR`, `DEGRADED` |
| blocked / fail | critical | `⬤` filled + ring | `HOLD`, `FAIL`, `BLOCKER`, `MISMATCH` |
| unknown / not measured | neutral | `○` hollow | `UNKNOWN`, `NOT_RUN`, `NOT_MEASURED` |
| disconnected | muted | `◌` dotted | `DISCONNECTED` |
| simulated / lab | **flagged** | `⚑` | `SIMULATOR`, `LAB` |
| revoked / terminal | inverse | `⊘` | `REVOKED` |

**Rules, absolute:**

1. **Colour is never the only channel.** Every state carries a distinct glyph
   *and* a text label. This is a WCAG requirement, and it is also an industrial
   one: control rooms have bad monitors, glare, and colour-blind operators.
2. **`UNKNOWN` is visually distinct from healthy *and* from failed.** It is
   hollow and neutral. The failure mode to prevent is an unmeasured signal
   reading as green — see `UX-INFORMATION-ARCHITECTURE.md` §5.
3. **`SIMULATOR` / `LAB` always carry `⚑`**, in every location, including inside
   table cells and chart legends. The flag is part of the status token, never a
   tooltip or a footnote.
4. Contrast ≥ **4.5:1** for text and ≥ **3:1** for the glyphs and graphical
   state indicators, in **both** light and dark themes.

---

## 4. LAYOUT AND RESPONSIVENESS — 320 px TO 1920 px

| Breakpoint | Layout |
|---|---|
| 320–479 | single column; stepper becomes a horizontally-scrolling pill row with the current step pinned; tables become stacked definition lists |
| 480–767 | single column; two-up KPI cards |
| 768–1023 | two columns; stepper horizontal; tables scroll horizontally inside their own container |
| 1024–1439 | two/three columns; side-by-side declared-vs-observed |
| 1440–1920 | three columns; topology and charts at full width |

**No horizontal page scroll at any width, including 320 px.** A table that must
scroll scrolls **inside its own container**, with the container's overflow
visibly indicated, never the page body. This is tested, not asserted
(`TEST-AND-QUALIFICATION-PLAN.md`, the mobile-overflow suite) — because a
measured `scrollWidth > clientWidth` on `<body>` is the only honest check, and
this programme has already been caught by an unbreakable long token overflowing
a box whose container fit (Gate C.0).

**Long-token hazards HFCC specifically creates:**

- OPC UA NodeIds (`ns=4;s=|var|CPU.Line2.Furnace.Zone3.Temperature.Actual`)
- SHA-256 fingerprints (64 hex chars)
- endpoint URLs
- German compound nouns (`Sicherheitsrichtlinienverhandlung`)

All four need explicit wrapping strategy: `overflow-wrap: anywhere` plus a
deliberate break opportunity, and for German, a soft hyphen in the catalogue
where a compound genuinely cannot break — the technique already used in
`messages/de.json`.

---

## 5. RTL AND LOCALISATION

**Persian is true RTL**, not a mirrored afterthought. `direction.ts` already
exists and is the mechanism.

| Element | fa (RTL) | en / de (LTR) |
|---|---|---|
| page flow, nav, labels | right → left | left → right |
| stepper progression | right → left | left → right |
| **topology diagram** | **left → right, unmirrored** | left → right |
| numbers, fingerprints, NodeIds, URLs, endpoints | **LTR, isolated** | LTR |
| charts (time axis) | **left → right, unmirrored** | left → right |

**Why the topology and the time axis do not mirror.** The diagram encodes a
physical direction of data flow (plant → cloud) and the chart encodes time.
Mirroring them would assert that data flows the other way, or that time runs
backwards. Industrial convention keeps both LTR in every locale. The *labels*
are RTL; the *arrows* and the *axis* are not. This is a deliberate exception and
must be recorded in the component, not left for a future contributor to
"fix".

**Bidirectional isolation is mandatory** for every technical value embedded in
Persian prose. Without `dir="ltr"` + isolation, a NodeId or an endpoint URL
inside a Persian sentence reorders visibly and becomes wrong — not merely ugly.

### Persian orthography — enforced

- `ی` (U+06CC), never Arabic `ي` (U+064A)
- `ک` (U+06A9), never Arabic `ك` (U+0643)
- correct ZWNJ (U+200C) in compounds: `می‌شود`, `اتصال‌های`, `داده‌ها`
- Persian digits where the catalogue already uses them; **technical values stay
  Latin** (a fingerprint in Persian digits is unusable)

A gate test scans the Persian catalogue for the Arabic code points. Note the
existing hazard: **`fa.assetOperations` is a known English carryover**, and
`fa.json` is **CRLF** — an LF-vs-CRLF raw compare gives a Windows-only false
difference (FINDING-105-001).

### Numbers and dates per locale

| | fa | en | de |
|---|---|---|---|
| decimal | `٫` / `.` per catalogue convention | `.` | `,` |
| thousands | per catalogue convention | `,` | `.` |
| date | Jalali where the app already uses it | `2026-10-05` | `05.10.2026` |
| time | 24 h | 24 h | 24 h |
| **stored timestamps** | **always ISO 8601 UTC `Z`** | same | same |

The last row matters: a *displayed* time is localised; a *stored or exported*
timestamp is strictly RFC 3339 UTC `Z` with a real calendar — the R21-F11 rule.
The evidence pack and the audit chain use the stored form, never the localised
one.

### i18n placement

Per `EXISTING-FACTORY-INVENTORY.md` §9, the recommendation (**OD-E**) is to nest
HFCC's leaves under the existing **`otEdge`** namespace, which is already
registered in the German catalogue's `TRANSLATED_NS` and already held to zero
carryover. This avoids the `TRANSLATED_NS` registration step and one of the two
leaf-count bumps.

Whichever is chosen, the gates require: exact three-way key / placeholder /
rich-tag parity, **zero DE == EN** (any genuine loanword needs an explicit
`de-identical-allowlist` entry with a recorded reason), zero FA == EN, and the
leaf total bumped in **every** pin site — re-measured on the chosen baseline,
never copied.

**No hard-coded visible string.** The translation infrastructure exists, so a
literal in a component is a defect. This includes `aria-label`s, chart axis
labels, empty-state copy, error messages and the `<title>`. Precedent: the
Academy header shipped three hard-coded English literals into `/fa` and `/de`,
and production served an English `<h1>` as the only h1 on the Persian page.

---

## 6. ACCESSIBILITY — WCAG 2.1 AA

| Requirement | Implementation |
|---|---|
| keyboard navigation | every control reachable and operable; logical tab order; no keyboard trap |
| focus visible | a 2 px token-coloured ring, ≥ 3:1 against both adjacent backgrounds |
| skip link | to main content, on every page |
| headings | one `h1` per page, no level skipped |
| landmarks | `main`, `nav`, `aside`, `section` with accessible names |
| the stepper | `nav` + `ol`; `aria-current="step"`; each step's state in text, not colour |
| tables | real `<table>` with `<th scope>`; `aria-sort`; `<caption>` |
| the topology SVG | `role="img"` + `aria-labelledby`; **plus a text-equivalent table** behind a disclosure |
| charts | `role="img"` with a textual summary; underlying data available as a table |
| live regions | `aria-live="polite"` for shadow counters; `assertive` for a new BLOCKER |
| forms | label-for-control, `aria-describedby` for hints, `aria-invalid` + `role="alert"` on errors, an error summary that links to each field |
| the credential reveal dialog | focus trapped, `aria-modal`, focus restored on close, the value in a labelled read-only field |
| colour | never the sole channel (§3) |
| motion | every transition respects `prefers-reduced-motion` |
| zoom | usable at 200 % without loss of content or function |
| screen-reader labels | all icon-only buttons; `⬤`/`○`/`⚑` glyphs are `aria-hidden` with the state carried by adjacent text |

**The glyph rule is easy to get wrong:** a decorative `⬤` must be
`aria-hidden="true"` with the state in real text beside it — otherwise a screen
reader announces "black circle" and the operator learns nothing. The repo has
already needed yes/no text alternatives for an acknowledgement glyph in the
SCADA Control Room, which is the same problem.

---

## 7. LIGHT AND DARK

Both themes follow the existing token system. Every HFCC state colour is defined
in **both**, and both are contrast-verified independently — a status colour that
passes on dark and fails on light is a failure.

Theme is inherited from the app; HFCC adds no theme switch of its own.

---

## 8. REQUIRED PAGE STATES — ALL SEVEN, FOR EVERY PAGE

| State | Appearance | Not to be confused with |
|---|---|---|
| **loading** | `Skeleton` matching the real layout's shape | — |
| **empty** | `EmptyState` + the action that creates the first item | locked |
| **locked** | `EmptyState` variant naming *what unlocks it* and *which transition* | empty |
| **error / unavailable** | `ErrorState` + `correlationId` + retry. **An error, not an empty.** | empty |
| **forbidden** | `ErrorState` variant: "you lack the capability" | empty, unavailable |
| **HOLD** | `Alert` banner with the HOLD reason + the blocker list; dangerous controls disabled **with their reason stated inline** | error |
| **disconnected** | distinct muted state with last-seen time; `DISCONNECTED ≠ STALE ≠ UNKNOWN` | unknown |

Skeletons mirror the real layout's dimensions, so the page does not reflow on
load — a measurable layout-shift requirement, not a preference.

---

## 9. THE QUALIFICATION HOLD TREATMENT

While the feature gate is `QUALIFICATION_HOLD`, every page carries a persistent,
non-dismissible banner:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚠  QUALIFICATION HOLD                                                    │
│    Production provisioning, real connectivity execution and FAT approval  │
│    are disabled pending formal qualification. Results shown are           │
│    SIMULATOR or LAB measurements and are not factory evidence.            │
└──────────────────────────────────────────────────────────────────────────┘
```

Every gated control is disabled **and states its reason inline** — not in a
tooltip, which a touch user cannot reach and a screen reader may not announce:

```
[ Build provisioning package ]   ← disabled
  Disabled: QUALIFICATION HOLD. Requires formal authorisation.
```

The disabled attribute is accompanied by `aria-disabled` and the reason is
associated via `aria-describedby`.

**The banner is not the control.** Every one of these operations is also refused
by its route handler with `423 qualification_hold`
(`SECURITY-THREAT-MODEL.md` P-09). The UI reflects the server; it does not
substitute for it.

**Forbidden strings:** `FACTORY_READY`, `PILOT_READY`, `DEPLOY_READY`,
`PRODUCTION_READY` must not appear in any rendered surface or any of the three
catalogues without a formal owner ruling. Gate-tested against the build output
and all three catalogues.

---

## 10. MOTION

Minimal and functional. Transitions ≤ 200 ms. No motion conveys information on
its own. Charts do not animate on data update — a moving line in a control room
is a distraction and makes a value harder to read, not easier.
`prefers-reduced-motion: reduce` removes all non-essential motion.

---

## 11. CHART SPECIFICATIONS

Three charts, each with a stated purpose and an accessible equivalent.

| Chart | Type | Axes | Accessible equivalent |
|---|---|---|---|
| queue depth over time | line, bounded window | x: time (LTR always) · y: messages | table of time-bucketed maxima |
| ingest lag over time | line + threshold band | x: time · y: ms | table + the threshold value stated in text |
| data quality | stacked bar per interval | x: time · y: % by `TelemetryQuality` | table of percentages |

Rules:

- Every chart's time window is **bounded and stated** ("last 60 minutes"). An
  unbounded time series over an unpartitioned `TelemetryRecord` is a known
  performance hazard.
- Thresholds are drawn as a band with a **text label**, never colour alone.
- A gap in data is drawn as a **gap**, not interpolated across. Interpolating
  across an outage invents plant data.
- `SIMULATOR`/`LAB` series carry the `⚑` in the legend.
- The underlying numbers are always available as a table.

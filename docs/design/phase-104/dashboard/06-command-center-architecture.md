# Phase 104-I.D1 — Industrial Command Center architecture

The authenticated environment is an **industrial instrument**, not an admin
template. Its job is to make an engineer's next decision obvious and safe, and
to be honest about what it does not know.

## Design principles

1. **Composition creates hierarchy — not glow.** One dominant element per
   surface, then supporting evidence. Never a wall of equal cards.
2. **Colour is semantic before it is decorative.** Cyan/ice marks navigation and
   active context. Amber and red mean severity and nothing else. No severity may
   claim the affirmative accent.
3. **Depth is meaning.** Elevation comes from the `--shadow-e0…e4` scale and is
   spent only where layering is real.
4. **Unknown outranks pretty.** A surface with no evidence says so. Zero is a
   measurement; absent is not.
5. **Advisory, never operational.** Hermes recommends; the engineer decides.
   No control implies a backend capability that does not exist.

## Existing architecture — reused, not replaced

`AppShell` already provides the rail, topbar, breadcrumbs, command palette,
notification centre, user menu, mobile drawer and skip link. The Phase 104-D2
Triad (`TriadGroup`, `RiskEvidence`, `SafeActionGrid`, `OperationalStatusHeader`,
`AttentionPanel`) already derives every value from a real snapshot through
`buildCommandModel()` and is fully translated.

**Gate A added no shell and duplicated no primitive.** Auditing first showed the
shell and Triad were sound; the debt was elsewhere.

## New primitives (`src/components/command-center/`)

Four were justified by the audit. Each earns its place by removing a class of
defect, not by adding a shape.

### `alarm-state.ts` — the state model

Framework-free, in `.ts` because this repository's vitest transform cannot
import `.tsx` into a unit test, so testable logic must live outside components.

| Export | Purpose | Forbidden inference |
| --- | --- | --- |
| `interpretResponse` | turn a fetch outcome into a state | a non-OK status can never become data |
| `isAlertsPayload` | structural validation | a 200 with the wrong shape is a failure, not "empty" |
| `selectQueue` | queue view | `empty` and `filtered` never collapse |
| `buildLedger` | severity proportions | no proportion is drawn from a zero total |
| `dominantSeverity` | posture | `null` when nothing is observed |
| `distinctVendors` | vendor count | blank vendor ids are not a vendor |
| `assessFreshness` | age of the data | unparseable or future ⇒ `unknown` |

`AlarmFailure` is a discriminated union (`unavailable` / `rateLimited` /
`malformed` / `network`). The type system, not a convention, is what stops a
transport failure from being rendered as an empty result.

### `StateBoundary.tsx` — the honest-state primitive

| Contract | Value |
| --- | --- |
| Accepts | `title`, optional `body`, optional machine `detail`, optional action |
| `tone` | closed union `neutral` / `warning` / `danger` — **there is no success tone**, so an unknown state cannot be painted as fine |
| Empty | caller supplies distinct copy per state |
| Error | tone + a factual request line; never a server-supplied message |
| Permission | rendered as its own state, never as empty |
| a11y | `role="status"`, `aria-live="polite"`, `aria-busy` while pending |
| Mobile | single column, no transformation needed |
| RTL | logical properties only |
| Tokens | `--color-*`, `border-line`, `bg-surface`, type scale |

### `SeverityLedger.tsx` — the dominant composition

One proportional band, read in flow direction so RTL mirrors for free. Counts
are subordinate to the band. Renders **only** proportions of a real total; the
caller shows an empty state when the total is zero, because a full-width calm
bar would assert "all clear" without evidence. The band is `aria-hidden` — the
same facts are in the `<dl>` beneath it, so exposing both would duplicate them.

### `ProvenanceFooter.tsx` — where the numbers came from

Source, freshness, build time and the read-only boundary, in one line. Freshness
of `unknown` prints as unknown. There is no path that converts an unparseable
timestamp into a plausible age.

### `severity-tokens.ts` — the one place severity becomes colour

Four `Record<AlertSeverity, string>` maps. Typed over a closed union so a new
severity fails the build rather than rendering unstyled, and so the two-domain
collision that produced `down → success` cannot recur.

## Primitives from the brief NOT built

The brief listed fifteen candidate primitives "only where justified". Building
all fifteen for two reference surfaces would have created unused abstractions
whose real contracts are still unknown. These were deliberately not built:

`SystemPostureBand`, `EvidenceRail`, `OperationalTimeline`, `SignalStatusStrip`,
`ActionQueue`, `AssetContextHeader`, `ProvenanceBadge`, `FreshnessIndicator`,
`ConstraintNotice`, `SafeActionPanel`, `EngineeringMetric`, `FamilyWorkspace`,
`IndustrialDataTable`.

Where a concept was needed it was met by an existing component or folded into one
of the four above — `SeverityLedger` covers the posture band, the evidence rail
is a layout region, `ProvenanceFooter` covers provenance and freshness together,
and `SafeActionGrid` already exists. `OperationalTimeline` and
`IndustrialDataTable` have no data contract to serve yet: the alerts feed carries
no per-alert timestamp, so a timeline would have nothing truthful to plot.

## Family workspace contract

Established by the operations family and intended as the pattern for D3–D7:

1. **The layout owns the family**: locator eyebrow, family description,
   sub-navigation. It renders **no `<h1>`** — a layout cannot know which child it
   wraps, and a shared heading makes every route in the family announce the same
   name.
2. **The page owns its identity**: exactly one translated `<h1>`, optional lead.
3. **The client owns the data**: fetch, state, evidence, provenance.

This split is enforced by tests, and `NC-08` proves the enforcement works.

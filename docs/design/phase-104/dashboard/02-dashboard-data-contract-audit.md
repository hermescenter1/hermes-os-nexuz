# Phase 104-I.D0 — Data contract audit

Scope: the data sources the two Gate A reference surfaces actually consume, and
what those sources can and cannot support. Contracts were read from the route
handlers and **confirmed against live responses** from a local server, not
inferred from client code.

## Reference A — Workspace Home (`/[locale]/dashboard`)

| Question | Answer |
| --- | --- |
| Source | `GET /api/telemetry` |
| Implementation | `simulateSnapshot()` — `src/lib/industrial/simulator.ts` |
| Database | none — the route touches no Prisma client |
| Provenance | **SIMULATED**, declared in the route's own docblock |
| Declared in UI? | yes — `PageStatusBadge variant="simulated"` on the page header |
| Transport guard | `telemetryService.snapshot()` checks `res.ok` before parsing |
| Failure rendering | `DataUnavailableState`, distinct from empty; raw error never shown |

**Finding: this contract is honest.** The values are simulated, the route says
so, the page carries a `simulated` badge, and the transport layer already
distinguishes failure from data. No change was required to its truthfulness.

The `PLATFORM_FACTS` values in the Global Operations strip are static platform
facts (knowledge libraries, engineering cases, supported vendors), not telemetry.
They are constants by design and are not presented as live measurements.

## Reference B — Alarm Center (`/[locale]/dashboard/operations/alerts`)

| Question | Answer |
| --- | --- |
| Source | `GET /api/operations/alerts` |
| Implementation | `buildEngGraph()` — derived engineering knowledge graph |
| Methods exported | **`GET` only** (verified by exhaustive verb scan) |
| Authentication | the **page** is protected; the **API is anonymous**, bounded by `guardDerivedGraphRequest` (rate limit only) |
| Determinism | deterministic, no AI — severity derives from a fixed category set |
| Error shape | `{ error: "alerts_unavailable" }` with HTTP 500 |
| Throttle shape | HTTP 429 from the shared `derived-graph` bucket |

### Observed payload (live probe, 2026-08-26)

```
counts     { total: 14, critical: 5, warning: 8, info: 1 }
byCategory 13 entries
builtAt    2026-08-26T05:20:26.874Z
alert keys id, label, category, severity, vendor, vendorName,
           deviceId, deviceLabel, caseId, status
```

### What the contract does NOT support

These were the decisive findings for the redesign. Each is now rendered as
unknown rather than invented:

1. **There is no per-alert timestamp.** Only a payload-level `builtAt` exists.
   The surface therefore prints "Not provided by the feed" for an alarm's
   observation time. Formatting `builtAt` into that row would assert the moment
   *this* alarm was raised — a different and unsupported claim.

2. **`status` is a constant, not observed state.** The builder writes
   `status: "active"` for every alarm unconditionally. The previous UI displayed
   it as a data row labelled "Status: ACTIVE", which reads as observed lifecycle.
   It is no longer presented as one.

3. **`severity` is the only server-side filter.** Category and vendor filtering
   would be client-side over an already-complete list. The surface exposes only
   the severity filter, so no control implies a server capability that is absent.

4. **There is no acknowledgement, assignment or state-change endpoint.** The
   surface therefore has no acknowledge control at all — not even a disabled one.

5. **`vendor` can be empty** when the builder cannot resolve the device.
   `distinctVendors()` excludes blanks rather than counting a nameless vendor.

### Freshness

`builtAt` is the single freshness anchor and is treated as follows:

| Condition | Rendering |
| --- | --- |
| age ≤ 15 min | "Current" |
| age > 15 min | "Stale" (warning tone) |
| unparseable | "Build time unknown" |
| future-dated | "Build time unknown" — never a negative age |

## Contract defects found in the shipped client

| # | Defect | Consequence |
| --- | --- | --- |
| D-B1 | `fetch(...).then(r => r.json())` never checked `r.ok` | A 500 or 429 body was stored **as data**; the truthiness guard passed and the render read `data.counts.total` off an object with no `counts` — **a TypeError, so an API outage rendered as a broken page** |
| D-B2 | Hard-coded `{ label: "Resolution Coverage", value: "100%" }` | A **fabricated KPI** in the affirmative accent with no backing field anywhere in the payload |
| D-B3 | No empty state | Zero alarms, and a filter matching nothing, both rendered as a blank column |
| D-B4 | `status: "ACTIVE"` shown as a data row | A constant presented as observed lifecycle state |
| D-B5 | Every string hard-coded English | The surface rendered English inside `/de` and `/fa` |

All five are closed. D-B1 and D-B2 are the ones that mattered: one turned an
outage into a crash, the other asserted a number that does not exist.

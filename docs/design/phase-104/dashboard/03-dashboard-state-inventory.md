# Phase 104-I.D0 — State inventory

The rule this phase enforces everywhere: **zero is a measurement, absent is not.**
A surface may only render a calm or affirmative state when it has evidence for
one. Every other outcome must name itself.

## The state vocabulary

| State | Meaning | Never rendered as |
| --- | --- | --- |
| `LOADING` | a read is in flight | final data |
| `EMPTY` | the source reported nothing, successfully | an error |
| `NO_MATCH` | data exists; this filter excludes it | `EMPTY` |
| `UNAVAILABLE` | the read failed (5xx, network, bad shape) | `EMPTY` or zero |
| `THROTTLED` | the read was rate-limited (429) | `UNAVAILABLE` (it is recoverable) |
| `STALE` | data is real but older than its freshness budget | `Current` |
| `UNKNOWN` | the contract carries no value for this field | zero, or a plausible substitute |
| `PERMISSION_REQUIRED` | the actor may not see this | `EMPTY` |

## Reference B — Alarm Center, state by state

| State | Trigger | Rendering |
| --- | --- | --- |
| `LOADING` | request in flight | `StateBoundary busy`, `role="status"`, `aria-busy` |
| `EMPTY` | HTTP 200, `alerts: []` | "No alarms derived" + explicit "this is a reported result, not a connection failure" |
| `NO_MATCH` | filter excludes all alarms | "No alarms at this severity" + the **real** remaining count + a control to clear the filter |
| `UNAVAILABLE` | non-OK status, network error, or a 200 with the wrong shape | danger tone, "Alarm state is UNKNOWN — this is not a report that the estate is clear", plus the exact request line and status |
| `THROTTLED` | HTTP 429 | warning tone (recoverable), distinct copy, retry offered |
| `STALE` | `builtAt` older than 15 min | provenance footer switches to "Stale" in the warning tone |
| `UNKNOWN` (time) | no per-alert timestamp exists | "Not provided by the feed" |
| `UNKNOWN` (field) | blank `vendorName` / `caseId` / `deviceLabel` | "Not recorded" |

The three failure kinds are modelled as a discriminated union
(`AlarmFailure`), so the type system itself prevents a transport failure from
collapsing into an empty result.

### The distinction that matters most

`EMPTY` and `UNAVAILABLE` produce opposite operational decisions. "No alarms" is
a reason to relax; "the alarm feed is unreadable" is a reason to escalate. The
shipped client could not tell them apart — a 500 became a crash and, had the
render survived, would have shown zeroes. They are now separate states with
separate copy, separate tone, and a behavioural test that fails if they are
merged (`NC-12`).

## Reference A — Workspace Home, state by state

| State | Trigger | Rendering |
| --- | --- | --- |
| `LOADING` | first poll pending | `DashboardSkeleton` with a localized label |
| `UNAVAILABLE` | `telemetryService` reports `!ok` | `DataUnavailableState`; the raw error string is never shown |
| `EMPTY` (attention) | no items need attention | explicit "queues are clear" copy — a real, evidenced statement |
| `SIMULATED` | always, in V1 | `PageStatusBadge variant="simulated"` in the page header |

This surface already separated failure from data correctly. The Gate A work on
it was **token and type discipline**, not truthfulness:

1. `Panel` painted its elevation with two inline `rgba()` shadows, bypassing the
   DNA elevation scale entirely. Now `shadow-e2` / `shadow-e3`.
2. `statusColor` was one `Record<string, string>` serving **two** semantic
   domains — lifecycle status and risk-trend direction. That is how the literal
   `"down"` came to map to the success accent: correct for "risk trending down",
   dangerously wrong for a device that is down. Because the record was keyed by
   `string`, both readings type-checked. It is now four exhaustive records over
   four closed unions (`LineStatus`, `DeviceStatus`, `HealthStatus`, trend), so
   the collision is unrepresentable.
3. Two of the five call sites had no `?? ""` fallback, so a miss emitted the
   literal class name `undefined`. Exhaustive records remove the possibility.

## Estate-wide state coverage (derived)

Only two routes in the entire `src/app` tree declare a `loading.tsx`
(`/admin/observability`, `/videos`) and only three declare a `not-found.tsx`.
Route-level loading and not-found boundaries are therefore **not** an
estate-wide convention; state is handled inside client components. That is a
finding for the D3–D9 families, not something Gate A changes.

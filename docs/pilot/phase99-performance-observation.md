# Hermes OS — Phase 99 Performance Observation Plan

Status: **observation plan, not yet executed against a pilot**. This plan
reuses the approved thresholds and measurement surfaces from
`docs/release/slo-sli-contract.md` (Phase 93) verbatim — it does not define,
loosen, or tighten any threshold. Where the pilot needs a threshold that
contract does not define, this document marks it `OWNER_THRESHOLD_REQUIRED`
rather than inventing one.

## 1. Principle

Observation, not load generation against anything real. Any bounded load
exercise in this plan runs only against a disposable, non-production
environment, at a scale explicitly agreed before the run. **No load test is
ever run against a customer environment or against production** — this
mirrors the existing capacity policy already recorded in
`docs/release/phase93-production-acceptance.md` (STEP 1, item 13) and
`docs/release/go-no-go-matrix.md`.

## 2. Measurement surfaces (existing, in-repo, no new vendor)

| Surface | Use |
|---|---|
| `GET /api/metrics` | Prometheus-format counters/histograms (bearer token or admin session). |
| `GET /api/admin/observability` | Aggregated operator snapshot: dependency health, alerts, security summary, error fingerprints, recent audit, metrics snapshot. |
| `GET /api/health`, `GET /api/health/ready` | Liveness / readiness. |
| `/{locale}/admin/observability` | FA/EN/DE dashboard over the same surfaces. |

## 3. What is observed, with the existing approved threshold

Each item below cites its SLI from `docs/release/slo-sli-contract.md` — the
number is not repeated as a new decision, only referenced.

| Observation | Source | Threshold (as approved in the SLO/SLI contract) |
|---|---|---|
| Request latency (p95 / p99) | `http_request_duration_ms` (SLI-4) | p95 warning > 800 ms, critical > 2000 ms; p99 critical > 5000 ms, over 10 min. |
| 5xx / HTTP error rate | `http_requests_total{status}` (SLI-3) | warning > 1%, critical > 5%, over 5 min. |
| Availability | `http_requests_total{status}` (SLI-1) | ≥ 99.5% over 30 days; error budget ≈ 3h39m/30d. |
| Readiness | `GET /api/health/ready` (SLI-2) | any 503 sustained > 60 s ⇒ critical. |
| Database health | `dependency_up{postgres}` (SLI-7) | `==0` ⇒ critical immediately. |
| Redis health | `dependency_up{redis}`, `redis_degraded_total` (SLI-7) | degraded ⇒ warning; auth limiter fails safe to the in-process fallback, not critical on a single node. |
| Container restart / crash signal | Docker restart count (SLI-8) | > 0 in 15 min ⇒ warning; ≥ 3 in 5 min ⇒ critical (crash loop). |
| Auth/security event spikes | `auth_failures_total`, `security_events_total` (SLI-5/6) | detector at 20 events/60 s per event type ⇒ warning; any `refresh_replay`/`cross_tenant_denied` ⇒ critical. |
| Alert delivery | `alert_delivery_total{result}` (SLI-9) | any `failed` after bounded retries ⇒ warning. |

## 4. Pilot-specific observations without an approved threshold

These are real things worth observing during the pilot, but the SLO/SLI
contract does not define a number for them. Each is marked
`OWNER_THRESHOLD_REQUIRED` rather than inventing a value.

| Observation | Why it matters for the pilot | Status |
|---|---|---|
| Resource pressure (CPU / memory) on the host | No CPU/memory gauge is currently emitted by the app's own metrics surface; only Docker-level inspection is available today. | `OWNER_THRESHOLD_REQUIRED` |
| High-value workflow timing (e.g. Industrial Brain analysis submit-to-result, case creation) | Not a distinct SLI in the contract; useful as a pilot-specific user-experience signal. | `OWNER_THRESHOLD_REQUIRED` |
| Background-job timing (e.g. export generation, audit-retention batch) | No dedicated SLI exists for background-job duration. | `OWNER_THRESHOLD_REQUIRED` |
| Concurrent pilot-user count / session volume | The SLO contract's thresholds are ratio/rate based, not sized to a specific pilot's expected concurrency. | `OWNER_THRESHOLD_REQUIRED` |

The owner should set explicit numbers for these (or explicitly decide none are
needed for a pilot of this size) before Phase 4 of `phase99-pilot-plan.md`
begins; until then, observe and record actuals without treating any of these
as a pass/fail gate.

## 5. Bounded, non-production load exercises

If a bounded load exercise is run at all during the pilot (for example, to
observe latency under a handful of concurrent synthetic users), it must:

- run only against a disposable environment that is not production and not
  the pilot's own connected integration path;
- use only synthetic fixtures (see `phase99-uat-cases.json` conventions,
  e.g. `hermes99test_*`, `pilot-alpha`);
- be scoped and agreed in advance (target concurrency, duration, and which
  endpoints) — no open-ended or unannounced load generation;
- be stopped immediately if it approaches or crosses any SLI-3/SLI-4/SLI-8
  threshold above, since that would itself start to look like a self-inflicted
  incident rather than a controlled observation.

## 6. Reporting

Record observed values (not just pass/fail) for §3 and §4 for the pilot
window, and reference this document from `phase99-acceptance-template.md`
(`performanceObservationReference`). Any critical breach traced to the pilot
path is handled per `docs/release/incident-response-runbook.md`, not silently
noted here.

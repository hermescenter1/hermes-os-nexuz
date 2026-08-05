# Hermes OS — SLO / SLI Operational Contract (Phase 93)

Status: **v1 acceptance contract** · Owner: Platform/SRE · Derived from the
Phase 92 Observability & SRE foundation. No external vendor is required to
observe any SLI below; every source is already shipped in-repo.

## 1. Purpose & scope

This document is the formal service-level contract for the Hermes OS production
deployment (`https://www.hermesnovin.com`). It defines, for each critical
service-level indicator (SLI): the **metric source** already emitted by the app,
a **threshold**, an **observation window**, **warning/critical** severities, the
**owner action** on breach, and **false-positive considerations**.

It is deliberately conservative for a single-node, single-region industrial SaaS
at v1. Targets are review-and-tighten as real traffic history accumulates.

### Measurement surfaces (all in-repo, no new vendor)

| Surface | How to read it |
|---|---|
| Prometheus text metrics | `GET /api/metrics` — bearer `METRICS_TOKEN` or admin session (`src/app/api/metrics/route.ts`). Metric catalogue: `src/lib/observability/metric-names.ts`. |
| Operator snapshot (JSON) | `GET /api/admin/observability` — admin-only (`src/app/api/admin/observability/route.ts`): dependency health, active alerts, security summary, error fingerprints, recent audit, metrics snapshot. |
| Dashboard (FA/EN/DE) | `/{locale}/admin/observability` — admin-gated server page. |
| Readiness / liveness | `GET /api/health/ready`, `GET /api/health` (`src/app/api/health/*`). |
| Structured logs | versioned schema `src/lib/observability/log-schema.ts` (schemaVersion 1), redacted at source. |
| Alerts (optional delivery) | `src/lib/observability/alerts.ts` — webhook when `ALERTS_ENABLED=true` + `ALERT_WEBHOOK_URL`. |

> **Error budget.** Availability SLO 99.5%/30d ⇒ a monthly budget of ~3h39m of
> unavailability. When the trailing-30d budget is >50% consumed, freeze
> non-essential deploys until the burn rate recovers.

---

## 2. SLI contracts

### SLI-1 — Availability (successful responses)

- **Definition:** fraction of HTTP responses that are not 5xx.
- **Source:** `http_requests_total{status}` (counter). Availability = `1 − (5xx / total)`.
- **SLO / threshold:** ≥ **99.5%** over 30 days. Warning at 99.7% burn trend; **critical** below 99.5%.
- **Window:** rolling 5 min (fast burn) + 30 d (budget).
- **Owner action:** on critical, check dependency health (SLI-7), recent errors
  (`/api/admin/observability` → `errors`), and container restarts; consider rollback (see DR runbook).
- **False positives:** low traffic makes the ratio jumpy — require ≥ 100 requests in the fast window before alerting; ignore client 4xx (not counted against availability).

### SLI-2 — Readiness

- **Definition:** `GET /api/health/ready` returns 200.
- **Source:** readiness route (fails **closed** to 503 when the DB is unreachable; response body stays opaque — proven by `src/app/api/health/__tests__/phase92-health-coverage.test.ts`).
- **Threshold:** any 503 sustained > **60 s** ⇒ **critical**; a single transient 503 ⇒ warning.
- **Window:** 60 s.
- **Owner action:** treat as a dependency outage; inspect PostgreSQL/Redis (SLI-7).
- **False positives:** during a deploy the container is briefly not-ready; the nginx health check and rolling `--no-deps hermes-web` rebuild absorb this. Exclude the deploy window.

### SLI-3 — HTTP error rate

- **Definition:** server-error ratio `5xx / total`.
- **Source:** `http_requests_total{status}`; corroborate with `errors_total` and error fingerprints.
- **Threshold:** warning at **> 1%** over 5 min; **critical** at **> 5%** over 5 min.
- **Window:** 5 min.
- **Owner action:** open the top error fingerprint (`errors` in the snapshot; SHA-256 fingerprint, redacted sample) and triage.
- **False positives:** a single failing dependency inflates this — cross-check SLI-7 before assuming an application regression.

### SLI-4 — Latency (p95 / p99)

- **Definition:** request latency percentiles.
- **Source:** `http_request_duration_ms` histogram (buckets `LATENCY_BUCKETS_MS`, `metric-names.ts`).
- **Threshold:** p95 warning **> 800 ms**, critical **> 2000 ms**; p99 critical **> 5000 ms** — all over 10 min.
- **Window:** 10 min.
- **Owner action:** check DB query health / index usage (capacity baseline), Redis degradation, and CPU on the node.
- **False positives:** cold start after a deploy, and long-running AI/RAG routes, skew the tail — segment by route where possible; exclude the first 2 min post-deploy.

### SLI-5 — Authentication / session failures

- **Definition:** rate of auth failures, authz denials, and session anomalies.
- **Source:** `auth_failures_total`, `authz_denials_total`, `session_operations_total`, `security_events_total{event}` (incl. `refresh_replay` = critical).
- **Threshold:** a **spike** (built-in detector: `RATE_THRESHOLD=20` events / 60 s per event type, `security-monitor.ts`) ⇒ warning; **any** `refresh_replay` or `cross_tenant_denied` ⇒ **critical** (fires an alert immediately).
- **Window:** 60 s sliding (matches the in-app detector).
- **Owner action:** on `refresh_replay`/`cross_tenant_denied`, reconstruct the incident by correlationId (`/api/admin/observability?correlationId=…`) and consider a kill-switch (`revokeAllSessions`).
- **False positives:** a bad deploy of a client can cause benign auth-failure spikes; correlate with a release. Lockouts are expected under credential-stuffing and are themselves the mitigation.

### SLI-6 — Security-event spikes (see also SLI-5)

- **Definition:** abnormal volume of any single security event.
- **Source:** `security_events_total{event,severity}` + the in-process spike detector.
- **Threshold:** detector escalation to an `error` alert ⇒ warning; sustained critical events ⇒ **critical**.
- **Window:** 60 s.
- **Owner action:** triage via the security summary in the snapshot (bounded, redacted). Follow the incident-response runbook.
- **False positives:** synthetic monitors / pen-tests inflate counts — schedule and annotate them.

### SLI-7 — Dependency health (PostgreSQL / Redis)

- **Definition:** are PostgreSQL and Redis reachable and healthy?
- **Source:** `dependency_up{dependency}` gauge, `dependency_latency_ms` histogram, `redis_degraded_total`, and `health.rateLimiter` in the snapshot (`isAuthLimiterDegraded()`).
- **Threshold:** `dependency_up{dependency="postgres"}==0` ⇒ **critical** immediately. Redis degraded ⇒ **warning** (the auth limiter fails **safe** to an in-process fallback — proven by `phase93-redis-unavailable-failmode.test.ts` — so throttling continues; it is not multi-instance-safe, hence not critical on a single node).
- **Window:** 60 s.
- **Owner action:** Postgres down ⇒ follow the DR runbook. Redis down ⇒ restore the Redis container; auth continues meanwhile.
- **False positives:** a Redis restart briefly flips degraded; require > 60 s before paging.

### SLI-8 — Restart / crash count

- **Definition:** container restarts of `hermes-web` (and canonical services).
- **Source:** Docker restart count (`docker compose -p hermes ps`), corroborated by a gap in metrics/logs and process-start log lines.
- **Threshold:** **> 0** unplanned restarts in 15 min ⇒ warning; a crash loop (≥ 3 in 5 min) ⇒ **critical**.
- **Window:** 5–15 min.
- **Owner action:** read container logs; if a bad release, roll back per the DR runbook.
- **False positives:** an operator-initiated deploy restarts `hermes-web` by design — exclude the deploy window.

### SLI-9 — Alert delivery failures

- **Definition:** alerts that could not be delivered to the configured webhook.
- **Source:** `alert_delivery_total{result}` (`result=failed|dropped|sent|deduplicated|suppressed`).
- **Threshold:** any `result="failed"` after the bounded retries ⇒ **warning** (the alerting path itself is degraded); `result="dropped"` while `ALERTS_ENABLED=true` ⇒ warning.
- **Window:** 15 min.
- **Owner action:** verify `ALERT_WEBHOOK_URL` reachability; note that alert delivery is best-effort and never blocks the request path (`alerts.ts` bounded retries, never throws).
- **False positives:** if `ALERTS_ENABLED` is false (v1 default until the owner configures a destination), alerts are tracked in-process and reported `dropped` by design — this is expected, not a breach. See `DEFERRED_OWNER_CONFIGURATION` in the acceptance report.

---

## 3. Severity → response summary

| Severity | Meaning | Response time (target) |
|---|---|---|
| **warning** | budget burning / degraded but serving | next business day; investigate |
| **critical** | user-facing outage or active security event | immediate; page owner |

## 4. Review cadence

Re-baseline thresholds after the first 30 days of real traffic, then quarterly.
Any threshold change is a reviewed PR to this file.

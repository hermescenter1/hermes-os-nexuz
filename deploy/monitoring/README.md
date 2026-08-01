# Hermes OS — Monitoring

## Architecture Note

**Uptime Kuma should ideally run on a separate VPS**, not alongside the app. If the app server goes down, monitoring should still be up to alert you. The `--profile monitoring` in `docker-compose.prod.yml` is provided for single-server convenience only.

---

## Uptime Kuma Setup

### Start (single-server, convenience mode)

```bash
docker compose -p hermes -f docker-compose.prod.yml --profile monitoring up -d
```

Access the dashboard at: `http://your-server-ip:3001`

On first launch, create an admin account. Then add monitors as described below.

### Recommended Monitors

#### 1a. App Liveness (process alive)

| Field      | Value                                    |
|------------|------------------------------------------|
| Type       | HTTP(s)                                  |
| URL        | `https://yourdomain.com/api/health`      |
| Interval   | 60 seconds                               |
| Keyword    | `"status":"ok"`                          |

`/api/health` is the LIVENESS probe: it proves only that the process is up and
serving, and never touches a dependency. A transient PostgreSQL outage cannot
trigger container restarts (Phase 90 fixed this).

Example response:
```json
{ "status": "ok" }
```

#### 1b. App Readiness (ready for traffic)

| Field    | Value                                      |
|----------|--------------------------------------------|
| Type     | HTTP(s)                                    |
| URL      | `https://yourdomain.com/api/health/ready`  |
| Interval | 60 seconds                                 |
| Keyword  | `"status":"ready"`                         |

`/api/health/ready` answers "should this instance receive traffic?" — it checks
the required dependency (PostgreSQL) and returns `503 {"status":"not_ready"}`
when unreachable. Redis is deliberately NOT a readiness dependency (its
consumers degrade to an in-process fallback), so a Redis outage never removes an
instance from the pool. The body carries status only — never a connection
string, host, or credential.

#### 2. App Uptime (root page)

| Field    | Value                          |
|----------|--------------------------------|
| Type     | HTTP(s)                        |
| URL      | `https://yourdomain.com/`      |
| Interval | 60 seconds                     |

#### 3. Operator Observability Dashboard

| Field      | Value                                              |
|------------|----------------------------------------------------|
| Type       | HTTP(s)                                            |
| URL        | `https://yourdomain.com/en/admin/observability`    |
| Interval   | 5 minutes                                          |
| Keyword    | `"Observability"` (or locale-specific: داشبورد)   |

The operator observability page (Phase 92) provides a bounded real-time snapshot
of app health: active alerts, security events, error fingerprints, dependency
gauges, and incident timeline reconstruction. **Requires admin session.** For
fully automated scraping, use `/api/metrics` (Prometheus format) or
`/api/admin/observability` (JSON) with `METRICS_TOKEN` bearer auth.

#### 4. Prometheus Metrics (for Grafana / time-series systems)

| Type     | HTTP(s)                                  |
|----------|------------------------------------------|
| URL      | `https://yourdomain.com/api/metrics`     |
| Interval | 30 seconds                               |
| Auth     | Bearer token = `${METRICS_TOKEN}` (env)  |

Phase 92 emits Prometheus text exposition format with cardinality-bounded
metrics: request counts, error rates, dependency health, alert delivery,
security event rates, and session operations. **Enables Grafana dashboards.**

Example scrape:
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1024
http_requests_total{method="POST",status="201"} 512
# HELP dependency_up Dependency health gauge
# TYPE dependency_up gauge
dependency_up{dependency="database"} 1
dependency_up{dependency="redis"} 1
# HELP dependency_latency_ms Dependency latency histogram
# TYPE dependency_latency_ms histogram
dependency_latency_ms_bucket{dependency="database",le="10"} 50
```

#### 6. PostgreSQL (TCP ping)

| Field    | Value              |
|----------|--------------------|
| Type     | TCP Port           |
| Host     | `postgres`         |
| Port     | `5432`             |
| Interval | 60 seconds         |

Note: PostgreSQL has no public port in production (internal Docker network only). For TCP monitoring from an external Kuma instance, set up a pg_isready check via SSH or a sidecar.

#### 7. Redis (TCP ping)

| Field    | Value     |
|----------|-----------|
| Type     | TCP Port  |
| Host     | `redis`   |
| Port     | `6379`    |

---

## Alerting

Uptime Kuma supports Telegram, Slack, email, PagerDuty, and many others. Configure notification channels in Settings → Notifications, then attach them to each monitor.

---

## Phase 92: Observability & SRE Foundation

### Structured Logging & Redaction

All log lines are emitted as JSON with mandatory fields:

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-08-01T12:34:56.789Z",
  "severity": "error",
  "service": "hermes-os",
  "message": "Failed to connect to database",
  "correlationId": "req_abc123xyz",
  "environment": "production",
  "data": {
    "operation": "database.query",
    "errorClass": "ECONNREFUSED"
  }
}
```

**Redaction** is automatic and recursive:
- All password, token, secret, and API key values are masked
- Free-text messages are scrubbed for URL credentials and key=value patterns
- Circular object references are detected and marked `[CIRCULAR]`
- Depth is bounded at 8 levels to prevent stack overflows
- Error objects are introspected (name, message extracted)

### Metrics & Prometheus

The endpoint `/api/metrics` exports Prometheus text format with the following
metric families:

- `http_requests_total` — request counts by method, status, route
- `http_request_duration_ms` — latency histogram (10, 50, 100, 500, 1000ms buckets)
- `auth_failures_total` — login/session failures by reason
- `session_operations_total` — session creates, rotations, revokes
- `alert_delivery_total` — alerts raised, deduped, delivered, failed
- `error_fingerprints_total` — error aggregation by fingerprint
- `dependency_up` — boolean gauge: database, redis (1=healthy, 0=down)
- `dependency_latency_ms` — histogram of check latency
- `security_events_total` — security event counts by type
- `redis_degraded_total` — counter when Redis becomes unavailable

**Cardinality Control:** Label sets are bounded; high-cardinality dimensions (user
IDs, email addresses, URLs) are never included. Labels are sanitized to prevent
Prometheus line breakage.

### Alert Manager

Alerts deduplicate by key, enforce severity floors, and throttle with a 300-second
cooldown window. Disabled by default (`ALERTS_ENABLED=true` to enable). Delivery is
retry-bounded (max 2 retries) and configurable transport (webhook URL via
`ALERT_WEBHOOK_URL`).

Alert severity levels:

- **info** — Informational, no action needed
- **warning** — Degradation detected; investigate
- **error** — Service error; mitigate
- **critical** — Security event or severe outage; page on-call

### Security Events & Ring Buffer

Closed taxonomy of 20+ event types (login_success, login_failure, refresh_replay,
cross_tenant_denied, permission_denied, object_deleted, billing_changed, api_key_created, etc.)
are recorded to an in-process ring buffer (2000 max). Rate-spike detection flags when
≥20 events arrive in a 60-second window.

Security events automatically raise alerts at configurable severities.

### Incident Timeline Reconstruction

Query `/api/admin/observability?correlationId=req_abc123xyz` to reconstruct a
multi-layer incident timeline merging:

1. **Security events** (highest priority)
2. **Audit log rows** (RBAC/data changes)
3. **Error fingerprints** (stack trace patterns)

All ordered deterministically by timestamp, source, and label for Root Cause
Analysis (RCA).

### Audit Retention Policy

The CLI script `npm run audit:retention` sweeps old audit rows with protected-action
prefixes retained forever:

```bash
node scripts/audit-retention.mjs [--apply] [--batch 500] [--max-batches 10]
```

Protected prefixes (never deleted):
- `login.`
- `auth.`
- `site.access.`
- `org.ownership`
- `billing.`
- `api.key.`
- `security.`

Default: dry-run only. Pass `--apply` to actually delete. Batches default to 500
rows; cap is 5000. Output is JSON for automated ingestion.

---

## Separate-Host Deployment (Recommended)

```bash
# On a second VPS
docker run -d \
  --restart unless-stopped \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1
```

Point its monitors at `https://yourdomain.com/api/health` from the outside — this verifies both app availability and SSL certificate validity from the user's perspective.

# Phase 92 — Observability & SRE Operator Runbook

This runbook is the operator reference for the Phase 92 observability surface:
structured logging, in-process metrics, operational alerting, error/security
aggregation, incident reconstruction, health signals and the audit-retention
policy. It is deliberately vendor-neutral — nothing here requires a specific
APM/SaaS product.

> Safety contract: none of these surfaces run destructive work automatically.
> Alerting is **disabled by default**; retention is **dry-run by default**; the
> operator endpoints are **admin/token gated**; the migration is **additive**.

---

## 1. Surfaces & authentication

| Surface | Path | Auth | Notes |
|---|---|---|---|
| Liveness | `GET /api/health` | none | process-only; never touches a dependency |
| Readiness | `GET /api/health/ready` | none | checks PostgreSQL; `503` when not ready |
| Prometheus metrics | `GET /api/metrics` | admin session **or** `Authorization: Bearer $METRICS_TOKEN` | text exposition; `Cache-Control: no-store` |
| Operator snapshot | `GET /api/admin/observability` | admin session | bounded JSON; `?correlationId=` for a timeline |
| Operator dashboard | `/{locale}/admin/observability` | admin (RequireCapability) | FA/EN/DE; incident lookup form |

`/api/metrics` never falls open: with no `METRICS_TOKEN` configured and no admin
session it answers `401/403`. The token is compared in constant time and read
from the environment only.

---

## 2. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LOG_LEVEL` | `INFO` (prod) / `DEBUG` | minimum emitted log level |
| `METRICS_TOKEN` | _unset_ | bearer token for `/api/metrics` scrapers; unset ⇒ admin-session only |
| `ALERTS_ENABLED` | `false` | master switch for webhook delivery |
| `ALERT_WEBHOOK_URL` | _unset_ | operator-configured destination (see §6) |
| `ALERT_MIN_SEVERITY` | `error` | delivery floor (`info`/`warning`/`error`/`critical`) |
| `ALERT_COOLDOWN_MS` | `300000` | per-key dedup/cooldown window |
| `ALERT_MAX_RETRIES` | `2` | delivery retries before giving up |
| `AUDIT_RETENTION_DAYS` | `365` | retention window for ordinary audit rows (floor 30) |

---

## 3. Migration deployment (AuditLog indexes)

Phase 92 adds two additive indexes on `AuditLog`:

- `AuditLog_createdAt_idx` — bounded retention sweeps and time-window queries
- `AuditLog_correlationId_idx` — incident timeline reconstruction

### 3a. Ordinary deploy (small/quiet table)

```bash
npx prisma migrate deploy
```

`prisma migrate deploy` builds both with a plain `CREATE INDEX`, which takes a
brief `ACCESS EXCLUSIVE` lock. On a small or low-traffic `AuditLog` this is fine.

### 3b. Large, write-hot table — build CONCURRENTLY out of band

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction, so it is **not** in
the migration file. For a large table, build the indexes manually during a
low-traffic window, then mark the migration applied so Prisma's history stays
consistent:

```bash
# 1. Build without blocking writers (run each separately, not in a tx):
psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");'
psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY "AuditLog_correlationId_idx" ON "AuditLog" ("correlationId");'

# 2. Verify both are valid (indisvalid = t):
psql "$DATABASE_URL" -c "SELECT indexrelid::regclass, indisvalid FROM pg_index WHERE indexrelid::regclass::text LIKE 'AuditLog_%_idx';"

# 3. Record the migration as applied WITHOUT re-running its SQL:
npx prisma migrate resolve --applied 20260816000000_phase92_audit_observability_indexes
```

If a `CONCURRENTLY` build is interrupted it can leave an `INVALID` index; drop it
(`DROP INDEX CONCURRENTLY "…";`) and retry before step 3.

Both paths (plain deploy on a fresh **and** on a populated legacy DB, plus the
`CONCURRENTLY` rebuild and idempotent re-deploy) are rehearsed on a disposable
PostgreSQL in CI — see `.github/workflows/ci.yml` (`phase92-postgres`) and
`scripts/ci/phase92-legacy-rehearsal.mjs`.

### 3c. Rollback

The indexes are additive and safe to drop; no data is affected:

```sql
DROP INDEX IF EXISTS "AuditLog_createdAt_idx";
DROP INDEX IF EXISTS "AuditLog_correlationId_idx";
```

---

## 4. Audit retention

Ordinary audit rows older than `AUDIT_RETENTION_DAYS` are eligible for deletion.
**Protected** rows are retained forever regardless of age:

```
login.   auth.   site.access.   org.ownership   billing.   api.key.   security.
```

Run it manually (dry-run first — **always**):

```bash
# Dry-run (default): reports candidate count, deletes NOTHING
npm run audit:retention

# Apply, with explicit bounded batches:
node scripts/audit-retention.mjs --apply --batch 500 --max-batches 50

# Custom window:
AUDIT_RETENTION_DAYS=730 node scripts/audit-retention.mjs
```

Output is JSON (`candidates`, `deleted`, `batches`) suitable for log ingestion.
The CLI never prints `DATABASE_URL`, credentials or row contents.

> Phase 92 does **not** schedule this and does **not** run it against production.
> Any scheduled sweep is an operator-owned maintenance job.

---

## 5. Incident reconstruction

Given a correlation id (the `X-Request-ID` echoed on responses / present in log
lines), reconstruct the ordered timeline across the security ring, audit rows and
error fingerprints:

- Dashboard: open `/{locale}/admin/observability`, paste the id into the
  incident lookup.
- API: `GET /api/admin/observability?correlationId=<id>`.

A malformed id is rejected (never queried). Audit `metadata` is never included —
only action/entity/outcome/identity — so no protected payload is surfaced.

---

## 6. Alerting

Alerting is **off by default**. To enable webhook delivery:

```bash
ALERTS_ENABLED=true
ALERT_WEBHOOK_URL=https://alertmanager.internal.example/api/v2/alerts
ALERT_MIN_SEVERITY=error
```

Safety properties:

- The destination is read from the **environment only** — never from a request
  body, query parameter or any observed content (no SSRF via user input).
- The URL must be a valid `http(s)` URL; anything else is treated as unconfigured.
- Delivery does **not** follow redirects (`redirect: "error"`): the POST reaches
  exactly the configured endpoint or fails.
- A **private/internal** address is intentionally allowed — an in-cluster
  Alertmanager or collector is a legitimate operator choice.
- Alerts deduplicate by key with a cooldown window and are retry-bounded, so a
  flapping condition cannot storm the destination.

---

## 7. Multi-process / in-memory limitation (IMPORTANT)

The metrics registry, the active-alert set, the security ring buffer and the
error-fingerprint store are **per-process, in-memory** structures. In a
multi-instance / multi-replica deployment:

- `/api/metrics` and `/api/admin/observability` reflect **only the instance that
  served the request**. Scrape every instance (Prometheus service discovery)
  and aggregate centrally — do not assume one scrape represents the fleet.
- In-process alert dedup/cooldown is **per instance**; for fleet-wide dedup, send
  metrics to Prometheus and alert from a central Alertmanager rather than relying
  solely on the in-process webhook.
- The security ring and error store are best-effort recent-history buffers, not a
  durable audit trail. The **durable** record of security-relevant events is the
  `AuditLog` table (queried by the incident timeline); the ring is a fast,
  bounded operational view on top of it.

Durable, cross-instance history lives in PostgreSQL (`AuditLog`); the in-memory
surfaces are the low-latency operational layer over it.

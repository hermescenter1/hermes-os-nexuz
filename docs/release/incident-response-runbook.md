# Hermes OS — Incident-Response Runbook (Phase 93)

Status: **v1 acceptance** · Owner: Platform/SRE + Operations · Companion to the
SLO/SLI contract and the disaster-recovery runbook.

An **incident** is any breach of a critical SLO (see `slo-sli-contract.md`) or any
confirmed security event: unavailability, sustained 5xx, a `refresh_replay` or
`cross_tenant_denied` security event, a dependency outage, or a crash loop.

---

## 1. Roles

| Role | Responsibility |
|---|---|
| **Incident Commander (IC)** | Owns the incident, decides mitigation (rollback/restore/kill-switch), coordinates comms. |
| **Operator** | Executes infra actions (deploy, rollback, restore) per the DR runbook. |
| **Scribe** | Records the timeline (start, detection, actions, resolution) for the post-incident review. |

At v1 a single owner may hold all three; still record the timeline.

## 2. Detect → triage → mitigate → recover → review

### 2.1 Detect
Signals: an alert (if `ALERTS_ENABLED`), a failing SLI on `/api/admin/observability`
or the FA/EN/DE dashboard (`/{locale}/admin/observability`), a 503 from
`/api/health/ready`, or a user report.

### 2.2 Triage (first 5 minutes)
Open `GET /api/admin/observability` (admin) and read, in order:
1. `health` — is PostgreSQL/Redis degraded? (SLI-7)
2. `alerts` — what is active?
3. `security` — any critical events (`refresh_replay`, `cross_tenant_denied`)?
4. `errors` — top error fingerprints (SHA-256, redacted sample).
5. `metrics` — 5xx ratio, latency, restart signal.

Classify severity: **critical** (user-facing outage or active security event) vs
**warning** (degraded, budget burning).

### 2.3 Reconstruct (security / correlated incidents)
Every request carries a correlation id (`resolveRequestId`, validated by
`isSafeRequestId`). Reconstruct a full, ordered, tenant-scoped timeline across the
security ring, audit rows, and error fingerprints:
```
GET /api/admin/observability?correlationId=<id>
```
(`reconstructIncident`, `src/lib/observability/incident.ts` — bounded to 500 entries,
audit `metadata` deliberately omitted, never throws). A **malformed** correlation
id is reported invalid **without** running any query.

### 2.4 Mitigate — decision tree
| Symptom | First mitigation |
|---|---|
| PostgreSQL down (SLI-7 critical) | DR runbook §3/§5; do not restart-loop the app. |
| Bad release (5xx/latency spike after deploy) | DR runbook §4 — roll back the app only. |
| `refresh_replay` / suspected session compromise | Kill-switch: `revokeAllSessions(userId)` (bumps `tokenVersion`, invalidates all sessions); force re-auth. |
| `cross_tenant_denied` spike | Confirm it is *denied* (fail-closed working); investigate the caller by correlationId; do NOT relax authorization. |
| Redis down | Warning only — auth limiter fails safe to in-process fallback; restore the Redis container. |
| Crash loop (SLI-8) | Roll back to the last good image; capture container logs first. |

### 2.5 Recover
Restore service, confirm `/api/health/ready` == 200, watch the SLIs return to
target for at least 15 min, and confirm the error budget is no longer burning.

### 2.6 Review (within 48 h)
Blameless post-incident review: timeline, root cause, what detected it, RTO/RPO
achieved vs target, and concrete follow-ups (tests, alerts, guardrails). File
follow-ups as scoped issues.

---

## 3. Security-incident specifics

- **Never** weaken an authorization check, tenant filter, or rate limit to "make
  it work" during an incident — fail-closed behavior is the mitigation, not the bug.
- Owner-context ambiguity/unavailability returning 409/503 is **correct**
  fail-closed behavior (Phase 90B), not an outage to be bypassed.
- Rate-limit throttles are keyed on the spoof-resistant `X-Real-IP` (Phase 93);
  do not re-introduce `X-Forwarded-For` keying.
- Logs and error responses are redacted at source (secrets/JWT/passwords, stacks
  stripped) — safe to share internally, but still treat correlation ids and user
  ids as sensitive.

## 4. Communication

- Internal: post status in the ops channel at detection, on mitigation, and at
  resolution.
- External (customer-facing): only the owner authorizes external status messages.
  Do not disclose security-incident specifics before the review concludes.

## 5. Alert delivery (v1 status)

Alert **delivery** requires `ALERTS_ENABLED=true` + a valid `ALERT_WEBHOOK_URL`.
Until the owner configures a destination (see `DEFERRED_OWNER_CONFIGURATION` in the
acceptance report), alerts are computed and tracked in-process but not delivered —
detection at v1 relies on the admin observability surface. Configuring delivery is
the top operational follow-up.

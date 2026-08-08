# ADR — Phase 98 Release Rollout Strategy

**Status:** Accepted (Phase 98)
**Decision:** `BLUE_GREEN` for the application service (`hermes-web`) only.

## Context

The production stack is a single-node Docker Compose deployment with one Nginx
edge, one PostgreSQL service, one Redis service and canonical named volumes, under
the canonical Compose project `hermes` (`docker-compose.prod.yml`). The existing
deploy pipeline (`.github/workflows/deploy.yml`, Gate 0A/0D) is manual-only
(`workflow_dispatch`), pins the exact commit SHA, runs in a protected `production`
environment and rebuilds only `hermes-web` with `-p hermes`.

The roadmap requires exactly one explicit rollout strategy: blue/green or rolling.

## Options considered

1. **Rolling** — replace application instances one at a time keeping ≥1 healthy.
   On a single-node Compose stack there is only one application service instance
   behind Nginx; a `stop`→`recreate` of that single container is a restart, not a
   genuine rolling replacement. Calling it "rolling" would be dishonest.
2. **Blue/green (app-only)** — run a second application container (the candidate)
   alongside the active one, both pointed at the SAME authoritative PostgreSQL,
   Redis and uploads volumes. Health-check the candidate BEFORE an atomic Nginx
   cutover; keep the previous-good container until soak succeeds; rollback is an
   atomic switch back when schema compatibility allows.

## Decision

Choose **BLUE_GREEN for the application service only**. It is the safer strategy
that is genuinely demonstrable on the current architecture, and it satisfies the
roadmap requirement without falsely labelling a single-container restart as rolling.

Invariants:

- One canonical Compose project `hermes`; one PostgreSQL, one Redis, one Nginx edge;
  canonical persistent volumes are NEVER duplicated for release switching.
- Candidate and active application containers coexist and share the same
  authoritative PostgreSQL/Redis and the same uploads persistence.
- The inactive candidate MUST pass health/readiness checks before cutover.
- Nginx cutover is atomic/reload-safe; active color/state is stored in safe local
  release metadata (the release-state journal); stale color state fails closed.
- Rollback is an atomic switch to the previous healthy application container when
  schema compatibility allows (`APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA`); otherwise it
  is an incident requiring explicit operator authority and follows the migration
  rollback classification. The database is NEVER auto-restored on deploy failure.

## Consequences

- The database is not duplicated; application rollback does not restore data.
- A forward-only or breaking migration constrains rollback to the classification
  recorded in the release manifest (`docs/release/phase98-release-engineering-runbook.md`).
- Zero-downtime is achievable for compatible releases but is only claimed where the
  atomic Nginx cutover between two healthy app containers is actually exercised.

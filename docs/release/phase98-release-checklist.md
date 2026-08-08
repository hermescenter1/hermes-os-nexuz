# Phase 98 — Release Checklist (Go/No-Go)

**Checklist version:** 1.0
One authoritative pre-release checklist. Every item requires an artifact/reference
and a verified state — a bare "done" is not acceptable. A release proceeds only
when every REQUIRED item is satisfied. Production deployment is manual-only and
requires explicit owner approval.

> This checklist governs a FUTURE release. Phase 98 itself performs NO Production
> deploy. `v1.0.0` GA is reserved for a later phase and is not tagged here.

## 1. Identity & approvals
- [ ] Exact target commit SHA (40-hex, on approved `main` history): `__________`
- [ ] Previous-good commit SHA (40-hex, required — release blocked if unknown): `__________`
- [ ] PR review/approval state recorded: `__________`
- [ ] Incident Commander + release operator on call (roles, not names): `__________`

## 2. CI / assurance (all must be PASS, no skipped required jobs)
- [ ] Phase 95 eval — reference: `__________`
- [ ] Phase 96 eval — reference: `__________`
- [ ] Phase 97 eval — reference: `__________`
- [ ] Phase 98 assurance run (offline + encrypted-PG + full-stack) — run URL: `__________`
- [ ] `eval:phase98` 17/17 invariant groups PASS
- [ ] Adversarial production-safety static review PASS
- [ ] Full unit test suite + build PASS

## 3. Migration gate
- [ ] Migration classification: `NO_MIGRATION | ADDITIVE_COMPATIBLE | FORWARD_ONLY_REQUIRES_BACKUP | BREAKING_OR_UNKNOWN`
- [ ] Migration list + checksums recorded in the release manifest
- [ ] No historical-migration mutation (fail-closed check PASS)
- [ ] Migration rehearsal result: `__________`
- [ ] If a migration exists: a VERIFIED encrypted pre-migration backup exists —
      artifact ref: `__________`, transportSha256: `__________`, verified: `yes/no`

## 4. Backups (artifact + verification required — not a checkbox)
- [ ] Latest PostgreSQL `.hbk` — file: `__________`, keyId: `__________`, verified: `yes`
- [ ] Latest uploads `.hbk` (both surfaces) — file: `__________`, manifestSha256: `__________`
- [ ] Backup verifier available (BACKUP_VERIFIER_MISSING would fail the backup)
- [ ] Retention: ≥ `BACKUP_MIN_VERIFIED_COPIES` verified copies retained
- [ ] Off-host copy status (or explicitly `OWNER_CONFIGURATION_REQUIRED`): `__________`

## 5. Configuration & recovery
- [ ] `phase98-configuration-inventory.json` up to date + secret-free (`config:inventory:check`)
- [ ] All required env keys present in the target environment (names only)
- [ ] Recovery set manifest hash recorded: `__________`

## 6. Release plan
- [ ] Release strategy: `BLUE_GREEN` (app-only)
- [ ] Previous-good image identity recorded: `__________`
- [ ] Rollback classification: `APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA | APP_ROLLBACK_REQUIRES_DB_RESTORE | RELEASE_ROLLBACK_BLOCKED`
- [ ] Rollback command/procedure referenced (release-engineering-runbook)
- [ ] Required health endpoints: `/api/health` (+ others): `__________`
- [ ] Observability/monitoring confirmed available during the window
- [ ] Release manifest built + SHA-256 recorded: `__________`
- [ ] Changelog section exists for the release version (`CHANGELOG.md`)
- [ ] Version tag (SemVer `vMAJOR.MINOR.PATCH`) — deploy still resolves the exact SHA

## 7. Cutover & soak
- [ ] Candidate health-checked BEFORE cutover (no cutover to an unhealthy candidate)
- [ ] Atomic Nginx cutover under `docker compose -p hermes`
- [ ] Post-cutover public + internal readiness verified
- [ ] Soak observation window completed
- [ ] Previous color retired only after success criteria

## 8. Final authorization
- [ ] Explicit Production deploy approval (protected environment reviewer): `__________`
- [ ] Release-state journal entry written (result, manifest hash, artifact refs)
- [ ] Post-cutover validation sign-off (Final recovery verification owner): `__________`

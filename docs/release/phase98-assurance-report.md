# Phase 98 — Assurance Report

Safe assurance evidence for Phase 98 (Full-Stack DR & Release Engineering). Contains
NO secrets, PII, credentials, row content, Production hosts/IPs, or key material.

- **Branch:** `agent/phase98-full-stack-dr-release-engineering`
- **Base:** `agent/phase97-compliance-privacy-legal-readiness` @ `63a4b48`
- **Final commit SHA:** _recorded on commit; see PR body_
- **Backup format:** `.hbk` v1, cipher `aes-256-gcm`
- **Release strategy:** `BLUE_GREEN` (application service only)
- **Redis persistence decision:** `REBUILD_FROM_AUTHORITATIVE_STATE`

## Offline assurance — `npm run eval:phase98` (17/17 groups PASS)

BACKUP_ENCRYPTION, POSTGRES_RECOVERY, UPLOAD_RECOVERY, REDIS_RECOVERY_POLICY,
CONFIGURATION_RECOVERY, FULL_NODE_RECOVERY, MIGRATION_GATE, MIGRATION_ROLLBACK,
RELEASE_MANIFEST, DEPLOYMENT_SAFETY, RELEASE_STRATEGY, RELEASE_ROLLBACK,
VERSION_AND_CHANGELOG, RPO, RTO, RECOVERY_OWNERSHIP, PRODUCTION_ACTIONS_DISABLED.

## Real Docker rehearsals (disposable containers/volumes/projects; guarded)

| Rehearsal | Closure sub-gates | Local result |
|---|---|---|
| Encrypted PostgreSQL | POSTGRES_BACKUP_RESTORE_REHEARSAL, wrong-key/corruption/tag/truncation/unknown-version rejection, restore integrity, post-restore migration | PASS |
| Uploads/documents (2 disposable volumes) | UPLOAD_RESTORE_REHEARSAL, manifest hash match, per-file digest restore, wrong-key/corruption rejection, path safety | PASS |
| Migration gate + rollback | MIGRATION_ROLLBACK_GATE, historical-mutation blocked, additive app-compat, restore-rollback integrity | PASS |
| Release rollback (blue/green) | RELEASE_ROLLBACK_GATE, candidate health before cutover, unhealthy-candidate-no-cutover, previous-good retained, no-auto-db-restore | PASS |
| Full-node recovery (disposable Compose project) | FULL_NODE_RECOVERY_REHEARSAL, DISPOSABLE_PROJECT_GUARD, DB/uploads/application/redis after full recovery, rehearsal RTO | PASS (rehearsal RTO ≈ 26s on a small dataset) |

> **Note (release blocker found + fixed):** the full-node rehearsal — the first thing
> to boot the standalone production image — surfaced a Next.js dynamic-route slug
> conflict (`legal-documents/[id]` vs `[type]`, introduced by Phase 97, absent on
> `origin/main`) that returned 500 on every route including `/api/health`. Fixed in
> this phase by moving the authenticated admin `[id]` tree under a static `entries/`
> segment (`/api/compliance/legal-documents/entries/{id}`); the public, security-
> reviewed `[type]` endpoint is unchanged. App now boots healthy (`/api/health` 200).

## Integrity method

Deterministic per-row digests (md5 of `row_to_json`, aggregated in digest order)
over critical tables — detects mutation, deletion and phantom rows without exposing
row content — plus an exact all-table row-count map. Uploads use per-file SHA-256 +
an aggregate manifest SHA-256, verified from inside the rebuilt volumes.

## RPO

Per-component (see `scripts/dr/rpo-rto.mjs`): PostgreSQL 24h (owner-activated cron),
uploads 24h, configuration continuous (Git + secret store), application continuous
(rebuild from pinned SHA), Redis not-in-RPO, OpenBao 24h. **System RPO = 24h**
(worst durable component). CI proves the mechanism + schedule↔RPO relationship +
restore correctness — NOT wall-clock cron execution.

## RTO

`MECHANISM_RTO` measured in the disposable full-node rehearsal (rehearsal evidence
on a small dataset — NOT Production timing). `PRODUCTION_RTO_TARGET` = 4h (owner
policy, historical from Phase 93). Every recovery step has a bounded, documented
procedure (decrypt, PG restore, uploads restore, config reconstruction, app start).

## Recovery ownership

Every recovery-critical component has a primary + backup role, authority, procedure
and escalation reference; no item is `OWNER=UNKNOWN` (see
`scripts/dr/recovery-ownership.mjs`, validated by the eval).

## Static production-safety review

`node scripts/dr/production-safety-check.mjs` — all gates 0:
PRODUCTION_VOLUME_DESTRUCTION_PATH, UNIDENTIFIED_DB_RESTORE_PATH, SECRET_LOGGING_PATH,
CI_PRODUCTION_ACCESS, AUTO_PRODUCTION_DEPLOY_TRIGGER, AUTO_DATABASE_ROLLBACK,
FAIL_OPEN_RELEASE_GATE.

## Local validation (host)

- `git diff --check`: clean
- `db:validate`: valid
- `config:inventory:check`: PASS (up to date + secret-free)
- `tsc --noEmit`: exit 0
- `lint`: no new errors (pre-existing warnings only)
- Focused Phase 98 tests: 122/122
- `eval:phase95` / `eval:phase96` / `eval:phase97` / `eval:phase98`: PASS
- Full `npm test` + `npm run build`: _recorded at commit time; authoritative on CI_

## Safety posture

PRODUCTION_REHEARSAL_EXECUTED=False, PRODUCTION_BACKUP_EXECUTED=False,
PRODUCTION_RESTORE_EXECUTED=False, PRODUCTION_MIGRATION_EXECUTED=False,
PRODUCTION_DEPLOY_EXECUTED=False, PRODUCTION_SECRET_ROTATED=False,
PROVIDER/CUSTOMER/REGULATOR_CONTACTED=False, NOTIFICATION_SENT=False.

## Owner configuration still required

Provision the real backup key file + key id; activate the host backup cron for
PostgreSQL + uploads; one-time populate the new `documents_data` volume on the live
host; decide/configure an off-host encrypted-backup destination
(`OFFHOST_BACKUP_DESTINATION=OWNER_CONFIGURATION_REQUIRED`).

## GitHub Actions

_The real `Phase 98 DR & Release Assurance` run result is recorded in the PR body
after the branch is pushed. Every mandatory job must conclude `success`._

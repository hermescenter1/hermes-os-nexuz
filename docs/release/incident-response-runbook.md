# Hermes OS — Incident-Response Runbook (Phase 93 → Phase 98)

Status: **v1 acceptance (Phase 93) + Phase 98 DR/release incident paths** ·
Owner: Platform/SRE + Operations · Companion to the SLO/SLI contract and the
disaster-recovery runbook (`docs/release/disaster-recovery-runbook.md`) and the
release-engineering runbook
(`docs/release/phase98-release-engineering-runbook.md`).

> **Rule (unconditional).** Never weaken an authorization check, tenant
> filter, rate limit, or a fail-closed DR/release gate (e.g. the encrypted
> backup requirement, the `RESTORE_CONFIRM` guard, the migration gate, the
> pre-cutover health gate) "to restore service faster." A fail-closed gate
> tripping during an incident is the control working as designed, not the
> incident itself.

Phase 98 also defines a **component-level recovery-ownership matrix**
(`scripts/dr/recovery-ownership.mjs`) with dedicated roles per DR/release
component (Database recovery owner, Upload recovery owner, Configuration
recovery owner, Application/release owner, OpenBao recovery owner, DNS/TLS
recovery owner, Monitoring owner, Final recovery verification owner). This is
a **separate, complementary axis** to the incident-command roles below (§1):
the IC/Operator/Scribe roles run the incident; the component owner roles
listed per-path in §3 execute the actual recovery action for their component
and report status back to the IC.

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
| PostgreSQL down / corrupted (SLI-7 critical) | DR runbook §Postgres / §Full-node recovery; do not restart-loop the app. See §3.1 below. |
| Bad release (5xx/latency spike after deploy) | DR runbook §Bad release — roll back the app only. See §3.9 below. |
| `refresh_replay` / suspected session compromise | Kill-switch: `revokeAllSessions(userId)` (bumps `tokenVersion`, invalidates all sessions); force re-auth. |
| `cross_tenant_denied` spike | Confirm it is *denied* (fail-closed working); investigate the caller by correlationId; do NOT relax authorization. |
| Redis down | Warning only — auth limiter fails safe to in-process fallback; restore the Redis container. See §3.6 below. |
| Crash loop (SLI-8) | Roll back to the last good image; capture container logs first. |
| Encrypted-backup key missing / decryption fails | See §3.2 / §3.3 below — never weaken the fail-closed key/authentication gate. |
| Uploads missing / restore needed | DR runbook §Uploads. See §3.4 / §3.5 below. |
| Failed migration / failed cutover / post-cutover 5xx | Release-engineering runbook rollback procedure. See §3.10–§3.12 below. |

### 2.5 Recover
Restore service, confirm `/api/health/ready` == 200, watch the SLIs return to
target for at least 15 min, and confirm the error budget is no longer burning.

### 2.6 Review (within 48 h)
Blameless post-incident review: timeline, root cause, what detected it, RTO/RPO
achieved vs target, and concrete follow-ups (tests, alerts, guardrails). File
follow-ups as scoped issues.

---

## 3. Phase 98 DR & release incident paths

Each path below follows: **Detect / Classify / Authority required / First
safe action / What NOT to do / Recovery sequence / Verification / RPO-RTO
evidence / Escalation owner.** The unconditional rule at the top of this
document applies to every path: never weaken a fail-closed gate to restore
service faster.

### 3.1 PostgreSQL corruption

- **Detect:** `/api/health/ready` 503, `dependency_up{postgres}==0` (SLI-7),
  or an application error indicating a corrupt index/table.
- **Classify:** critical, data-integrity incident.
- **Authority required:** Incident Commander decision to restore; Database
  recovery owner executes.
- **First safe action:** `docker compose -p hermes ps`; stop writes by
  pausing/stopping `hermes-web` if corruption is actively spreading (e.g. a
  runaway write loop) rather than restarting it repeatedly.
- **What NOT to do:** do not run ad hoc repair SQL against Production; do not
  skip `verify-backup.sh`/`hbk.mjs verify` "to save time."
- **Recovery sequence:** DR runbook §Postgres, Scenario A — pick the newest
  verified `.hbk`, run `restore-postgres.sh` with `RESTORE_CONFIRM`, then
  `prisma migrate deploy` if needed.
- **Verification:** `/api/health/ready` == 200; spot-check case/knowledge
  data; `/api/admin/observability` healthy, no fresh error spike.
- **RPO/RTO evidence:** RPO ≤ 24 h (owner-activated daily backup);
  MECHANISM_RTO from the `phase98-encrypted-pg` CI rehearsal; record actual
  wall-clock time achieved for the post-incident review.
- **Escalation owner:** Database recovery owner → Incident Commander.

### 3.2 Encrypted-backup key unavailable

- **Detect:** `restore-postgres.sh`/`backup-postgres.sh` exits with
  "`HERMES_BACKUP_KEY_FILE` must point to the decryption key" or the key file
  is missing/unreadable on the host.
- **Classify:** critical if a restore is actively needed; otherwise a
  configuration-readiness gap to fix before the next backup window.
- **Authority required:** Secret store access (per the ownership matrix,
  `scripts/dr/recovery-ownership.mjs`).
- **First safe action:** confirm the correct key **id** (`HERMES_BACKUP_KEY_ID`
  in the artifact's `.meta.json`/header) so the right key is retrieved from the
  secret store — do not guess or substitute an unrelated key file.
- **What NOT to do:** never regenerate a new key and re-point
  `HERMES_BACKUP_KEY_FILE` at it to "unblock" a restore of an **existing**
  artifact — a different key can never authenticate an artifact sealed with
  the original key; this only produces a fail-closed decryption failure (§3.3)
  against real data, not a fix.
- **Recovery sequence:** retrieve the exact key file from the operator vault /
  secret store for the recorded `keyId`; place it at the path referenced by
  `HERMES_BACKUP_KEY_FILE`, `chmod 600`, owner-only; retry.
- **Verification:** `node scripts/dr/hbk.mjs header --in <artifact.hbk>`
  succeeds (structural check, no key needed) and confirms the expected
  `keyId`; then `hbk.mjs verify --in <artifact.hbk> --key-file <key>` passes.
- **RPO/RTO evidence:** a missing key does not change the RPO of the
  underlying artifact, but it extends the effective RTO for as long as key
  retrieval takes — record this delay separately from the mechanism RTO.
- **Escalation owner:** Database recovery owner (backup key) or Upload
  recovery owner (uploads key) → Incident Commander.

### 3.3 Encrypted-backup authentication failure

- **Detect:** `hbk.mjs decrypt`/`verify` fails with "authentication failed —
  wrong key or corrupted artifact" (GCM tag mismatch) or a
  `CHECKSUM_MISMATCH`/`ARTIFACT_TYPE_MISMATCH` error.
- **Classify:** critical — the artifact in hand cannot be trusted as a
  recovery point.
- **Authority required:** Database/Upload recovery owner; Incident Commander
  if this is the only available recovery point.
- **First safe action:** do **not** delete or overwrite the failing artifact —
  preserve it for forensic review. Check for an alternate verified artifact
  (`selectRestoreArtifact` semantics: newest verified, complete, encrypted).
- **What NOT to do:** never bypass authentication (e.g. by patching the
  script to skip `hbk.mjs verify`/`decrypt`'s tag check) to force a restore
  from an unauthenticated artifact — an unauthenticated "restore" could be
  corrupted or tampered data reaching Production.
- **Recovery sequence:** fall back to the next-newest verified artifact
  (retention guarantees at least `BACKUP_MIN_VERIFIED_COPIES` = 3 are kept);
  re-run the restore procedure against that artifact; investigate the root
  cause of the failed artifact (wrong key id recorded, storage corruption,
  truncated transfer) as a separate follow-up.
- **Verification:** the fallback artifact passes `hbk.mjs verify` before any
  restore is attempted against it.
- **RPO/RTO evidence:** falling back to an older verified copy increases the
  effective data-loss window for this incident beyond the nominal 24 h RPO —
  record the actual gap used in the post-incident review.
- **Escalation owner:** Database recovery owner / Upload recovery owner →
  Incident Commander.

### 3.4 Uploads loss

- **Detect:** missing files under `/app/public/uploads` or
  `/app/.data/documents`, 404s on previously-working document/avatar URLs, or
  volume-loss evidence (e.g. `documents_data`/`uploads_data` recreated empty).
- **Classify:** critical if user-facing document access is broken; otherwise
  warning (isolated missing files).
- **Authority required:** Upload recovery owner; operator confirmation to
  restore.
- **First safe action:** confirm the scope (one root or both) and stop any
  process that might overwrite the empty directory before restore.
- **What NOT to do:** do not regenerate/synthesize placeholder documents to
  "fill the gap" — that would inject fake data into a production path.
- **Recovery sequence:** DR runbook §Uploads → §3.5 below.
- **Verification:** `FILE_COUNT`/`MANIFEST_SHA256` from
  `restore-uploads.mjs` match the `.meta.json` sidecar of the artifact used.
- **RPO/RTO evidence:** RPO ≤ 24 h (owner-activated daily uploads backup);
  MECHANISM_RTO from the `phase98-full-stack` CI rehearsal
  (`phase98-uploads-rehearsal.mjs`).
- **Escalation owner:** Upload recovery owner → Incident Commander.

### 3.5 Upload restore

- **Detect:** this is the recovery action following §3.4 — triggered once an
  uploads loss is confirmed and a verified `.hbk` uploads artifact is
  identified.
- **Classify:** planned recovery action under an active incident.
- **Authority required:** Upload recovery owner executes; Incident Commander
  approves for a Production target.
- **First safe action:** identify the exact destination roots
  (`public-uploads:/app/public/uploads,data-documents:/app/.data/documents`)
  — never point restore at an arbitrary/guessed path.
- **What NOT to do:** do not use `--empty-check` against a live Production
  target that legitimately still has files you intend to keep alongside the
  restored ones — `--empty-check` is a rehearsal safety net, not a Production
  restore mode; understand whether this is a full-root restore (target should
  be empty first) or a partial recovery before running it.
- **Recovery sequence:**
  ```bash
  node scripts/dr/restore-uploads.mjs \
    --in /backups/uploads/hermes_uploads_<TIMESTAMP>.hbk \
    --dest "public-uploads:/app/public/uploads,data-documents:/app/.data/documents" \
    --key-file "$HERMES_BACKUP_KEY_FILE"
  ```
- **Verification:** compare `FILE_COUNT`/`MANIFEST_SHA256` output against the
  artifact's `.meta.json`; spot-check a known document/avatar URL.
- **RPO/RTO evidence:** same as §3.4.
- **Escalation owner:** Upload recovery owner → Incident Commander.

### 3.6 Redis total loss

- **Detect:** Redis health probe fails, `dependency_up{redis}==0`, or the
  container/volume is gone.
- **Classify:** warning, not critical — Redis is `NOT_IN_RPO`.
- **Authority required:** Platform/SRE.
- **First safe action:** confirm the auth rate limiter has degraded to its
  in-process fallback (fail-safe, not fail-open) rather than disabling rate
  limiting.
- **What NOT to do:** never disable or bypass rate limiting to "work around"
  Redis being down; never attempt to restore Redis data from an application
  backup — there is none, by design.
- **Recovery sequence:** bring up a fresh Redis instance
  (`docker compose -p hermes -f docker-compose.prod.yml up -d --no-deps redis`);
  no data migration — `REBUILD_FROM_AUTHORITATIVE_STATE`.
- **Verification:** `dependency_up{redis}==1`; rate limiting still functions
  (per-instance fallback or restored shared counters).
- **RPO/RTO evidence:** N/A for RPO (not in scope); RTO is effectively the
  time to restart the container.
- **Escalation owner:** Platform/SRE → Incident Commander.

### 3.7 Configuration loss

- **Detect:** missing/incorrect environment variables on the host, a failed
  `config:inventory:check`, or application errors indicating a required
  variable is absent.
- **Classify:** critical if Production cannot start; otherwise warning.
- **Authority required:** Configuration recovery owner; secret store access
  for `SECRET_EXTERNAL` entries.
- **First safe action:** consult
  `docs/release/phase98-configuration-inventory.json` for the affected key's
  `sourceClass` and `recoverySource` before guessing a value.
- **What NOT to do:** never invent/hardcode a placeholder secret value in
  source, logs, or this runbook; never commit a recovered secret to Git.
- **Recovery sequence:** `REPOSITORY_MANAGED` → recover from Git/Compose
  defaults; `SECRET_EXTERNAL` → recover from the operator vault/secret store;
  `OWNER_CONFIGURATION` → apply the owner's documented decision;
  `HOST_MANAGED` → recover from host/runtime defaults.
- **Verification:** `npm run config:inventory:check` passes; application
  starts and `/api/health/ready` == 200.
- **RPO/RTO evidence:** RPO = 0 h (continuous, Git + secret store); RTO is the
  time to re-apply the missing values.
- **Escalation owner:** Configuration recovery owner → Incident Commander.

### 3.8 Full host loss

- **Detect:** host unreachable, provider-reported hardware/VM loss, or total
  Docker daemon/data-volume loss.
- **Classify:** critical, highest severity.
- **Authority required:** Incident Commander; all component owners engaged.
- **First safe action:** confirm DNS/TLS is not itself the actual point of
  failure (§3.14) before assuming full host loss.
- **What NOT to do:** do not attempt partial in-place repair once host loss is
  confirmed — provision a new host per the DR runbook rather than nursing a
  failed one back for a stateful service.
- **Recovery sequence:** DR runbook §Full-node recovery, Scenario C
  (provision → restore secrets/env → data services → PostgreSQL restore →
  uploads restore + one-time `documents_data` population if applicable →
  `hermes-web` + `nginx` → TLS verification).
- **Verification:** `/api/health/ready` == 200; TLS valid; spot-check
  data/documents against the recovery set's `maxSnapshotSkewMs`.
- **RPO/RTO evidence:** system RPO = 24 h (worst durable component);
  MECHANISM_RTO from `phase98-full-node-recovery.mjs`;
  PRODUCTION_RTO_TARGET = 4 h (owner policy, not yet Production-timed).
- **Escalation owner:** Incident Commander (coordinates Database, Upload,
  Configuration, Application/release, DNS/TLS, and OpenBao recovery owners).

### 3.9 Bad application release

- **Detect:** 5xx/latency spike or crash loop immediately following a deploy.
- **Classify:** critical if user-facing; warning if caught in soak before
  cutover completes.
- **Authority required:** Application/release owner.
- **First safe action:** confirm whether cutover has actually completed
  (release-state journal) — if the candidate is still pre-cutover, this is a
  failed health gate (§3.11), not a live-traffic incident.
- **What NOT to do:** do not restore the database as a first response to an
  application-only regression; do not attempt a down-migration.
- **Recovery sequence:** release-engineering runbook rollback procedure — app
  rollback if `APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA`; otherwise this becomes a
  DB-restore incident (§3.1) since the classification blocks a plain app
  rollback.
- **Verification:** `/api/health/ready` == 200 on the rolled-back release; 5xx
  ratio and latency return to target.
- **RPO/RTO evidence:** RTO = time to redeploy the previous-good image
  (fast path if the image is still available; see §3.13 otherwise).
- **Escalation owner:** Application/release owner → Incident Commander.

### 3.10 Failed migration

- **Detect:** `migrate deploy` fails during rollout, or the release migration
  gate (`scripts/dr/migration-gate.mjs`) reports `deployBlocked: true`
  (historical mutation or a `BREAKING_OR_UNKNOWN` new migration).
- **Classify:** critical if it fails mid-deploy against Production; a release
  is correctly **blocked pre-deploy** if the gate caught it before rollout —
  that is the gate working, not an incident.
- **Authority required:** Application/release owner + Database recovery
  owner (pre-migration backup was required by the gate).
- **First safe action:** do not retry the same migration blindly — read the
  gate's `reasons` output (mutated/missing migration names, or the specific
  dangerous SQL pattern matched).
- **What NOT to do:** never hand-edit an already-applied migration to "fix"
  a mismatch; never disable the migration gate to force a deploy through.
- **Recovery sequence:** if it failed mid-deploy against Production and left
  the schema partially applied, restore from the pre-migration backup
  (§Postgres, Scenario A) rather than attempting a manual forward/backward
  patch; Hermes migrations are forward-only, so there is no down-migration
  path.
- **Verification:** `prisma migrate status` clean; schema fingerprint matches
  the release manifest.
- **RPO/RTO evidence:** the pre-migration backup (`preMigrationBackupRequired:
  true` whenever `migrationClassification !== NO_MIGRATION`) is exactly what
  makes this recoverable within the normal PostgreSQL RPO/RTO.
- **Escalation owner:** Application/release owner → Database recovery owner
  → Incident Commander.

### 3.11 Failed cutover

- **Detect:** the blue/green orchestrator (`scripts/dr/blue-green.mjs`)
  reports `CANDIDATE_START_FAILED`, `UNHEALTHY_CANDIDATE_NO_CUTOVER`, or
  `CUTOVER_FAILED`.
- **Classify:** warning, not critical — by design, the previous-good color
  remains active in all three cases; users are unaffected.
- **Authority required:** Application/release owner.
- **First safe action:** none required for user-facing service — the failure
  mode is safe by construction (no cutover occurred).
- **What NOT to do:** never force a cutover to an unhealthy candidate to
  "unblock" a release.
- **Recovery sequence:** inspect candidate logs, fix the underlying issue
  (build, config, migration), and re-run the release from a fresh candidate
  build.
- **Verification:** `activeColor()` still reports the previous-good color;
  `/api/health/ready` == 200 throughout.
- **RPO/RTO evidence:** no RPO/RTO impact — no user-facing outage occurred.
- **Escalation owner:** Application/release owner.

### 3.12 Post-cutover 5xx spike

- **Detect:** health check fails or 5xx ratio spikes immediately after
  cutover completes (state `CUTOVER`/`SOAK`).
- **Classify:** critical — traffic has already moved to the new release.
- **Authority required:** Application/release owner decides per the rollback
  classification; Incident Commander if it becomes `POST_CUTOVER_INCIDENT`.
- **First safe action:** check the rollback classification
  (`classifyRollback`) recorded for this release **before** acting.
- **What NOT to do:** never blindly flip traffic back to the previous color
  when the migration classification is `BREAKING_OR_UNKNOWN` or
  `FORWARD_ONLY_REQUIRES_BACKUP` without a proven app-rollback path — running
  old code against a new, incompatible schema can corrupt data.
- **Recovery sequence:**
  - `APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA` → atomic cutover back to the previous
    color (`rollbackToPrevious`); result `POST_CUTOVER_ROLLED_BACK`.
  - Otherwise → `POST_CUTOVER_INCIDENT`: escalate to the Incident Commander;
    the database is **not** auto-restored; decide between a forward fix and a
    full DB-restore-backed rollback (§3.1) as a human decision.
- **Verification:** `/api/health/ready` == 200 on whichever color is active
  after the decision; 5xx ratio returns to target.
- **RPO/RTO evidence:** a safe app rollback has effectively zero RPO impact;
  a DB-restore-backed rollback carries the normal PostgreSQL RPO/RTO (§3.1).
- **Escalation owner:** Application/release owner → Incident Commander.

### 3.13 Previous-good image unavailable

- **Detect:** the release manifest's `previousGoodGitSha` cannot be resolved
  to a runnable image/build (e.g. the build artifact was pruned).
- **Classify:** critical for release safety — `requirePreviousGood` throws
  `UNKNOWN_PREVIOUS_GOOD_RELEASE` and blocks any new rollout until resolved,
  by design.
- **Authority required:** Application/release owner.
- **First safe action:** do not proceed with a new deploy while there is no
  known-good rollback target — resolve this first.
- **What NOT to do:** never fabricate a `previousGoodGitSha` value or point it
  at an untested commit just to satisfy the gate.
- **Recovery sequence:** rebuild the previous-good commit from source
  (`git checkout <sha> && docker compose -p hermes -f docker-compose.prod.yml
  build hermes-web`) and re-verify it passes health checks before recording it
  as the new previous-good reference.
- **Verification:** the rebuilt image starts and passes the health gate.
- **RPO/RTO evidence:** extends RTO for this release by the rebuild time; no
  RPO impact.
- **Escalation owner:** Application/release owner → Incident Commander.

### 3.14 TLS/DNS recovery dependency

- **Detect:** `/api/health/ready` is fine internally but the public domain is
  unreachable / TLS handshake fails after a recovery action.
- **Classify:** critical if customer-facing.
- **Authority required:** DNS/TLS recovery owner (DNS registrar + Certbot
  access, per the ownership matrix).
- **First safe action:** distinguish application recovery from DNS/TLS
  recovery — a fully-recovered application behind a broken DNS/TLS layer is
  still an outage from the customer's perspective.
- **What NOT to do:** do not disable TLS or downgrade to an unverified/expired
  certificate to restore access faster.
- **Recovery sequence:** per `deploy/ssl/README.md` — re-issue/renew
  certificates, confirm DNS records point at the recovered host, verify from
  outside the host network.
- **Verification:** external HTTPS request to the production domain succeeds
  with a valid certificate.
- **RPO/RTO evidence:** N/A for RPO; RTO is dominated by DNS propagation and
  certificate issuance/renewal time, tracked separately from application RTO.
- **Escalation owner:** DNS/TLS recovery owner → Incident Commander.

### 3.15 OpenBao dependency unavailable

- **Detect:** OpenBao-backed secret resolution fails (Phase 94/95 credential
  plane); `readSecretBackendReadiness`/observability surface reports the
  backend degraded.
- **Classify:** warning unless a live incident requires OpenBao-issued
  credentials right now, in which case critical.
- **Authority required:** OpenBao recovery owner (operator + unseal
  authority).
- **First safe action:** confirm whether the affected feature is disabled by
  default (Phase 94/95 OpenBao integration ships DISABLED by default) before
  treating this as a production-blocking incident.
- **What NOT to do:** never fall back to a hardcoded/static credential in
  place of an OpenBao-issued one; never unseal with a reduced quorum outside
  the documented unseal procedure.
- **Recovery sequence:** per `ops/openbao/RUNBOOK.md` — restore from the Raft
  snapshot (owner-operated, 24 h RPO) and follow the documented unseal
  procedure.
- **Verification:** OpenBao health surface reports ready; dependent
  credential issuance succeeds.
- **RPO/RTO evidence:** RPO ≤ 24 h (owner-operated snapshot); RTO per the
  OpenBao runbook's own rehearsal evidence, not this document.
- **Escalation owner:** OpenBao recovery owner → Incident Commander.

### 3.16 Monitoring unavailable during recovery

- **Detect:** `/api/admin/observability` itself is unreachable, or the
  FA/EN/DE dashboard fails to load, while a recovery is in progress.
- **Classify:** warning that increases risk of an undetected regression
  during recovery — treat with heightened manual verification, not as a
  reason to pause recovery.
- **Authority required:** Monitoring owner.
- **First safe action:** fall back to direct signals — `/api/health/ready`,
  container logs (`docker compose -p hermes logs`), and manual spot checks —
  while monitoring is restored in parallel.
- **What NOT to do:** do not declare an incident "resolved" purely because
  monitoring itself came back green if the underlying recovery was not
  independently verified while monitoring was down.
- **Recovery sequence:** per `deploy/monitoring/README.md`; restart/restore
  the monitoring host/service.
- **Verification:** monitoring surface returns and corroborates the manual
  verification already performed.
- **RPO/RTO evidence:** N/A directly, but any recovery performed while
  monitoring was unavailable must be documented in the post-incident review
  with the manual evidence used instead.
- **Escalation owner:** Monitoring owner → Incident Commander.

---

## 4. Security-incident specifics

- **Never** weaken an authorization check, tenant filter, or rate limit to "make
  it work" during an incident — fail-closed behavior is the mitigation, not the bug.
- Owner-context ambiguity/unavailability returning 409/503 is **correct**
  fail-closed behavior (Phase 90B), not an outage to be bypassed.
- Rate-limit throttles are keyed on the spoof-resistant `X-Real-IP` (Phase 93);
  do not re-introduce `X-Forwarded-For` keying.
- Logs and error responses are redacted at source (secrets/JWT/passwords, stacks
  stripped) — safe to share internally, but still treat correlation ids and user
  ids as sensitive.

## 5. Communication

- Internal: post status in the ops channel at detection, on mitigation, and at
  resolution.
- External (customer-facing): only the owner authorizes external status messages.
  Do not disclose security-incident specifics before the review concludes.

## 6. Alert delivery (v1 status)

Alert **delivery** requires `ALERTS_ENABLED=true` + a valid `ALERT_WEBHOOK_URL`.
Until the owner configures a destination (see `DEFERRED_OWNER_CONFIGURATION` in the
acceptance report), alerts are computed and tracked in-process but not delivered —
detection at v1 relies on the admin observability surface. Configuring delivery is
the top operational follow-up.

# Hermes OS — Disaster-Recovery Runbook (Phase 93 → Phase 98)

Status: **v1 acceptance (Phase 93) + Phase 98 encrypted-backup / full-stack
hardening** · Owner: Operations · Scope: PostgreSQL data loss / corruption,
uploads loss, Redis loss, configuration loss, bad release, and full-node
recovery for the production deployment (`https://www.hermesnovin.com`, Docker
Compose project **`hermes`**).

> **Golden rule.** Never run a restore, destructive query, or chaos test against
> the production database as a rehearsal. The backup→restore pipeline is
> rehearsed automatically on every PR in CI (Phase 93 job **`Phase 93
> disaster-recovery restore rehearsal`** plus the Phase 98 jobs **`Phase 98
> encrypted PostgreSQL recovery`** and **`Phase 98 full-stack recovery and
> rollback`**, `.github/workflows/phase98-dr-release-assurance.yml`) against
> disposable, CI-only databases/volumes. Use production restore ONLY for a
> genuine incident.

> **Phase 98 supersedes the plaintext backup flow.** The Phase 93 plaintext
> `.dump` artifact is **SUPERSEDED**. The durable artifact produced by
> `scripts/backup-postgres.sh` is now an authenticated-encryption `.hbk`
> envelope; a plaintext dump exists only transiently in a private temp
> directory during backup/restore and is removed before the script exits. Any
> `.dump` file still present in `${BACKUP_DIR}` predates Phase 98 and should be
> treated as legacy, unencrypted, at-rest data.

---

## 1. Recovery objectives (Phase 98)

RPO is derived per component from its actual backup/authoritative-source
mechanism. **System RPO = the worst durable component.**

| Component | Authoritative source | Mechanism | Schedule | RPO | Owner |
|---|---|---|---|---|---|
| PostgreSQL | `postgres_data` volume | Encrypted `pg_dump` (`.hbk`) via `scripts/backup-postgres.sh` | 24 h, owner-activated host cron | **≤ 24 h** | Database recovery owner |
| Uploads | `uploads_data` + `documents_data` volumes | Encrypted uploads archive (`.hbk`) via `scripts/dr/backup-uploads.mjs` | 24 h, owner-activated | **≤ 24 h** | Upload recovery owner |
| Configuration | Git + external secret store | Repository-managed + secret store (no data-loss window for repo config) | Continuous | **0 h** | Configuration recovery owner |
| Application source/image | `origin/main` pinned SHA | Rebuild from pinned commit | Continuous | **0 h** | Application/release owner |
| Redis | N/A | `REBUILD_FROM_AUTHORITATIVE_STATE` — not a recovery source | N/A | **Not in RPO** | Platform/SRE |
| OpenBao | Raft snapshot (Phase 94/95 contract) | Owner-operated snapshot per `ops/openbao` runbooks | 24 h, owner-activated | **≤ 24 h** | OpenBao recovery owner |

**System RPO = 24 h** (worst durable component: PostgreSQL / uploads /
OpenBao, each on an owner-activated 24 h cadence).

> CI proves the **mechanism** (encrypt → verify → decrypt → restore →
> integrity check) and the **schedule↔RPO relationship** (that a 24 h cadence
> implies a 24 h worst case), never the wall-clock execution of a Production
> cron job. Whether the owner-activated cron is actually running in Production
> is an operational fact outside what CI or this repository can observe or
> assert — see [Known limitations](#known-limitations).

### RTO

| | Value | Basis |
|---|---|---|
| **MECHANISM_RTO** | Measured every CI run (`scripts/ci/phase98-full-node-recovery.mjs` and the encrypted-PG rehearsal) | **Rehearsal evidence on a small, disposable dataset — NOT a claim of Production timing.** |
| **PRODUCTION_RTO_TARGET** | **≤ 4 h** | Owner policy (`scripts/dr/rpo-rto.mjs` `RTO_CONTRACT`), carried forward from the Phase 93 accepted objective. `productionRtoVerificationStatus = MECHANISM_VERIFIED_IN_REHEARSAL` — the mechanism is proven, the 4 h Production figure is a policy target, not a timed Production drill. |

Recovery steps whose durations the rehearsal measures, in order: encrypted
backup decryption → PostgreSQL restore → uploads restore → configuration
reconstruction → application start/readiness.

---

## 2. Encrypted backup format & key handling

### Format

Every durable backup artifact (PostgreSQL and uploads) is an **AES-256-GCM
authenticated-encryption envelope**, file extension **`.hbk`**, format
version **1**:

```
MAGIC "HBK1" (4 bytes)
headerLen  uint32-BE (4 bytes)
header     canonical-JSON, UTF-8, length = headerLen — AUTHENTICATED AS AAD
ciphertext (streamed AES-256-GCM output)
tag        GCM authentication tag (16 bytes)
```

The header (not secret; safe to print via `node scripts/dr/hbk.mjs header --in
<file>`) carries: `formatVersion`, `cipher`, `keyId`, `nonce` (base64),
`plaintextSha256`, `plaintextSize`, `createdAt`, `artifactType`
(`postgres`|`uploads`). The header is passed as GCM **additional authenticated
data (AAD)**, so tampering with the header (e.g. swapping `artifactType` or
`plaintextSha256`) fails authentication exactly like tampering with the
ciphertext.

### Key handling

- The encryption/decryption key is a **file**, referenced by
  `HERMES_BACKUP_KEY_FILE` (path) — **never** a raw value on the command line
  or in an environment variable value.
- `HERMES_BACKUP_KEY_ID` is a **non-secret** identifier for that key, recorded
  in the envelope header and the `.meta.json` sidecar so a rotated key can be
  told apart from an old one without exposing key material.
- Generate a key: `umask 077 && openssl rand -hex 32 > /secure/path/hermes-backup.key`
  (owner-only, `chmod 600`). `scripts/dr/hbk.mjs genkey --out <file>` does the
  same thing and never prints the key.
- **Never** commit the key file, log it, echo it, or place it in any
  manifest/journal — `release-manifest.mjs`, `release-journal.mjs` and
  `recovery-set.mjs` all reject values shaped like key material.
- The real Production backup key is **NOT provisioned by this repository**.
  Provisioning it on the live host is an owner action.

### Verification

Both `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` verify
**before** and **after** encryption/decryption:

- Backup: `pg_dump` (plaintext, private temp dir) → `verify-backup.sh`
  (`pg_restore --list` + essential-table check) → `hbk.mjs encrypt` →
  `hbk.mjs verify` (re-authenticates the sealed artifact) → transport SHA-256
  → atomic `.partial` → final `.hbk` publish → safe `.meta.json` sidecar
  (no secrets) → **remove the temporary plaintext**.
- Restore: `hbk.mjs header` (structural/version check, no decryption) →
  `hbk.mjs decrypt` (authenticates the GCM tag **before** any byte reaches the
  database) → `pg_restore --list` on the decrypted plaintext → fail-closed
  target-specific confirmation → destructive restore → remove the decrypted
  plaintext.

> **Temp plaintext caveat (honest limitation).** The private-temp-directory
> plaintext is *removed* (`rm -f`), not cryptographically erased. On SSD/CoW
> filesystems the underlying blocks may remain recoverable until overwritten
> by the storage layer. Mitigate with full-disk encryption on the backup/host
> volume; this repository does not (and cannot) guarantee block-level erasure.

### Retention

`scripts/dr/apply-retention.mjs` + `scripts/dr/backup-retention.mjs` enforce:

- Never prune below `BACKUP_MIN_VERIFIED_COPIES` (default **3**).
- Never delete the **newest verified** recovery point.
- `.partial` and unverified artifacts are never counted as recovery points and
  are never selected for restore (`selectRestoreArtifact` only returns
  verified, complete, encrypted artifacts, newest first).

---

## Postgres

### What is backed up, and how

| Script | Action |
|---|---|
| `scripts/backup-postgres.sh` | `docker exec` → `pg_dump --format=custom --no-acl --no-owner` into a **private temp dir** → `verify-backup.sh` on the plaintext → `hbk.mjs encrypt` (AES-256-GCM) → `hbk.mjs verify` on the sealed artifact → atomic `<name>.hbk.partial` → `<name>.hbk` → safe `.meta.json` sidecar → remove the temp plaintext → `apply-retention.mjs`. **Requires `HERMES_BACKUP_KEY_FILE` + `HERMES_BACKUP_KEY_ID`; fails closed if either is missing or the verifier is absent.** |
| `scripts/verify-backup.sh` | Integrity of the plaintext dump: `pg_restore --list` (parses every byte of the TOC) **and** asserts the essential tables `Organization`, `User`, `IndustrialSite`, `IndustrialAsset` are present. |
| `scripts/restore-postgres.sh` | Validate the `.hbk` envelope (`hbk.mjs header`) → authenticate + decrypt fully into a private temp plaintext (`hbk.mjs decrypt`) → verify the decrypted dump (`pg_restore --list`) → **fail-closed target-specific confirmation** → stop `hermes-web` → terminate connections → `DROP DATABASE` + `CREATE DATABASE` → `pg_restore --no-acl --no-owner` → remove the temp plaintext → restart `hermes-web` → reminder to run `migrate deploy`. |

**BACKUP_PERMISSIONS = ENFORCED:** `backup-postgres.sh` sets `umask 077`,
hardens `BACKUP_DIR` to `0700`, the temp plaintext dump to `0600`, and the
`.hbk`/`.meta.json` sidecar to `0600`.

**RESTORE_ENVIRONMENT_GUARD = FAIL_CLOSED:** `restore-postgres.sh` refuses by
default. It runs only on an explicit, **target-specific** confirmation —
interactively (type `restore <db>`) or non-interactively via
`RESTORE_CONFIRM="restore <db>"`. The phrase embeds the exact target database,
so a confirmation meant for staging cannot authorise a production restore;
with no confirmation and no TTY it exits non-zero without touching the
database.

### Scenario A — Restore after data loss / corruption

1. **Confirm the incident.** Is PostgreSQL up?
   `docker compose -p hermes ps`. Is `/api/health/ready` returning 503
   (SLI-2)? Is `dependency_up{postgres}==0` (SLI-7)?
2. **Pick the newest verified backup.** `ls -lt ${BACKUP_DIR}/hermes_postgres_*.hbk`.
   Confirm the matching `.meta.json` shows `"verified":true, "partial":false`.
3. **Restore** (drops + recreates the DB — the app is briefly stopped;
   fail-closed confirmation required, interactively or via
   `RESTORE_CONFIRM`; requires `HERMES_BACKUP_KEY_FILE` to point at the
   matching decryption key):
   ```bash
   POSTGRES_CONTAINER=hermes-postgres-1 \
   HERMES_BACKUP_KEY_FILE=/secure/path/hermes-backup.key \
   RESTORE_CONFIRM="restore hermes_db" \
   bash /opt/hermes-os-nexuz/scripts/restore-postgres.sh \
     /opt/hermes-os-nexuz/backups/hermes_postgres_<TIMESTAMP>.hbk
   ```
4. **Apply migrations** if the backup predates the deployed schema:
   ```bash
   docker compose -p hermes -f docker-compose.prod.yml exec hermes-web npx prisma migrate deploy
   ```
5. **Verify recovery.** `/api/health/ready` == 200; log in; spot-check a case /
   knowledge article; `/api/admin/observability` shows healthy dependencies
   and no fresh error spike.
6. **Record** the incident (start, cause, backup used, RTO achieved) per the
   incident-response runbook.

---

## Uploads

Two durable upload surfaces are covered, both packed into a single `.hbk`
uploads archive (`artifactType: "uploads"`) by `scripts/dr/backup-uploads.mjs`:

| Label | Path | Volume | Contents |
|---|---|---|---|
| `public-uploads` | `/app/public/uploads` | `uploads_data` | Author avatar uploads |
| `data-documents` | `/app/.data/documents` | `documents_data` (Phase 98, additive) | Documents, extracted text, compliance export packages |

### Backup

```bash
node scripts/dr/backup-uploads.mjs \
  --roots "public-uploads:/app/public/uploads,data-documents:/app/.data/documents" \
  --out /backups/uploads/hermes_uploads_<TIMESTAMP>.hbk \
  --key-file "$HERMES_BACKUP_KEY_FILE" --key-id "$HERMES_BACKUP_KEY_ID"
```

Produces a `.hbk` + `.meta.json` sidecar (file count, per-root breakdown,
manifest SHA-256, transport SHA-256). Symlinks, path traversal and absolute
paths inside the archive are refused.

### Restore

```bash
node scripts/dr/restore-uploads.mjs \
  --in /backups/uploads/hermes_uploads_<TIMESTAMP>.hbk \
  --dest "public-uploads:/app/public/uploads,data-documents:/app/.data/documents" \
  --key-file "$HERMES_BACKUP_KEY_FILE"
```

Authenticates + decrypts before any write, then unpacks each root with
per-file digest verification and an aggregate manifest check. Never writes
outside the explicit destination directories. Use `--empty-check` in a
rehearsal to refuse restoring into a non-empty target by accident (do **not**
pass `--empty-check` for a genuine in-place production restore).

### One-time `documents_data` population (owner action required)

Phase 98 discovered that `/app/.data/documents` had **no backing volume**
before this change — documents, extracted text and compliance export packages
were living only on the `hermes-web` container's writable layer and were lost
on every rebuild. `docker-compose.prod.yml` now defines an **additive**
`documents_data` volume mounted at `/app/.data/documents`; existing volumes
(`postgres_data`, `redis_data`, `uploads_data`) are unchanged.

Because the volume is new, **a one-time owner step is required on the live
host** to copy any data currently sitting on the running container's
writable layer into the new volume before the next `hermes-web` recreation
(otherwise that data is left behind on the old writable layer and is lost):

**Phase 99.7 replaced the illustrative copy sequence that used to sit here with
a real, verifiable mechanism.** A hand-typed `docker cp` pair has no proof of
completeness, no collision refusal, and no way to distinguish "there was nothing
to copy" from "the copy silently did nothing" — not acceptable for customer
documents. Use `scripts/dr/adopt-documents.mjs`:

```bash
# On the Production host, BEFORE recreating hermes-web with the new compose file.
mkdir -p /tmp/hermes-doc-legacy /tmp/hermes-doc-volume
docker cp hermes-hermes-web-1:/app/.data/documents/. /tmp/hermes-doc-legacy/

# 1. Survey and decide — writes nothing.
node scripts/dr/adopt-documents.mjs \
  --source /tmp/hermes-doc-legacy \
  --dest   /tmp/hermes-doc-volume \
  --destination-classification EXPECTED_EMPTY \
  --plan-only

# 2. Adopt, emitting the evidence the deploy gate requires.
node scripts/dr/adopt-documents.mjs \
  --source /tmp/hermes-doc-legacy \
  --dest   /tmp/hermes-doc-volume \
  --destination-classification EXPECTED_EMPTY \
  --manifest-out /backups/postgres/documents-adoption.json

# 3. Bring up the new compose definition (creates the documents_data volume),
#    then place the adopted tree into it.
docker compose -p hermes -f docker-compose.prod.yml up -d --no-deps hermes-web
docker cp /tmp/hermes-doc-volume/. hermes-hermes-web-1:/app/.data/documents/
docker exec hermes-hermes-web-1 find /app/.data/documents -type f | wc -l
```

The tool proves the source and destination exist and are real directories before
any write, refuses an unclassified non-empty destination, never overwrites an
existing file, never deletes the source (so the legacy container stays a complete
fallback), refuses symlinks and path traversal, and verifies a count +
total-bytes + per-file SHA-256 manifest after the copy. An empty legacy tree is
reported as `ZERO_DOCUMENTS` rather than passing silently.

Keep `/tmp/hermes-doc-legacy` and the old container until after the release soak
window — they are part of the rollback path.

This step has **not** been run against Production by this change; it is
scheduled, owner-operated work. See
[the Phase 99.7 cutover contract](phase99.7-production-cutover-contract.md) §1.5.

---

## Redis

**Decision: `REBUILD_FROM_AUTHORITATIVE_STATE`.** Redis holds only TTL'd
rate-limit counters (`src/lib/auth/rate-limiter.ts`,
`src/lib/api/rate-limit.ts`) and stateless health-probe traffic. Sessions are
**not** in Redis — the authoritative session store is PostgreSQL
(`AuthSession`). Redis is therefore **not part of the system RPO**: on total
Redis loss, bring up a fresh instance with no data migration. AOF persistence
remains enabled in Compose only for ordinary node/container resilience
(surviving a container restart without losing in-flight counters), not as a
DR recovery source.

**Fail-mode on Redis loss:** rate limiting degrades to a per-instance,
in-process fallback — it never fails open. `refresh_replay`/session
invalidation and tenant authorization are unaffected because they are backed
by PostgreSQL, not Redis (`scripts/dr/redis-recovery-policy.mjs`).

```bash
docker compose -p hermes -f docker-compose.prod.yml up -d --no-deps redis
```

---

## Configuration recovery

The non-secret configuration surface (environment variable **names**, whether
each is a secret, its source class, and which role recovers it) is generated
and checked in `docs/release/phase98-configuration-inventory.json`
(`scripts/dr/generate-config-inventory.mjs`, checked in CI via `npm run
config:inventory:check`). Recovery per entry:

- `sourceClass: REPOSITORY_MANAGED` → recover from Git (this repository /
  `docker-compose.prod.yml` defaults).
- `sourceClass: SECRET_EXTERNAL` → recover from the external secret store /
  operator vault. **Never** from Git, logs, or this runbook.
- `sourceClass: OWNER_CONFIGURATION` → recover per the owner's documented
  runbook decision (e.g. `APP_URL`).
- `sourceClass: HOST_MANAGED` → recover from the deployment host / runtime
  environment.

Configuration recovery has **0 h RPO** because it is continuously tracked in
Git plus the secret store rather than snapshotted — there is no "last backup"
gap for repository-managed configuration.

---

## Full-node recovery

### Recovery set

A **recovery set** (`scripts/dr/recovery-set.mjs`) is a small, hashable,
metadata-only record of what a full recovery needs: the PostgreSQL artifact
reference + transport SHA-256 + snapshot time, the uploads artifact reference
+ transport SHA-256 + snapshot time + file count, the application Git SHA, the
release manifest hash, the configuration manifest hash, the schema
fingerprint, and the non-secret backup key ID. It **never** contains secret
values, `.env.production` contents, or key material — this is enforced by a
recursive secret scan (`scanForSecrets`) and a check that `backupKeyId` does
not look like 256-bit key material.

**Consistency model: `INDEPENDENT_SNAPSHOTS_NOT_TRANSACTIONAL`.** PostgreSQL
and uploads are backed up by two separate scripts on two separate schedules —
they are **not** one distributed transaction. The recovery set records
`postgresSnapshotAt`, `uploadsSnapshotAt` and `maxSnapshotSkewMs` explicitly so
the RPO implication is visible rather than falsely implying cross-store
consistency: **a recovered system may pair a PostgreSQL row referencing a
document with an uploads snapshot taken up to ~24 h apart**, so a very recently
uploaded document (or a very recently deleted one) can be inconsistent with
the restored database state immediately after a full-node recovery. Operators
should spot-check document/asset references after any full recovery.

### Scenario C — Full node loss

1. Provision a new host; install Docker + Compose.
2. Restore the repo checkout at the last good commit to
   `/opt/hermes-os-nexuz`.
3. Restore secrets/env out of band (never from Git), including
   `HERMES_BACKUP_KEY_FILE` (the backup decryption key — from the operator
   vault, never from a backup artifact itself).
4. Bring up data services:
   ```bash
   docker compose -p hermes -f docker-compose.prod.yml up -d postgres redis
   ```
5. Restore the newest verified PostgreSQL `.hbk` (Postgres §Scenario A, steps
   3–4 above).
6. Restore the newest verified uploads `.hbk` into both roots (Uploads
   §Restore above), then complete the one-time `documents_data` population
   step if this is the first deployment of the Phase 98 compose file on this
   host.
7. Bring up `hermes-web` + `nginx`; verify TLS and `/api/health/ready`.
8. Confirm configuration recovery (§Configuration recovery) and spot-check for
   `maxSnapshotSkewMs`-related inconsistencies (§Recovery set).

---

## Bad release (app regression, schema intact)

Roll back the **app only** — keep postgres/redis/nginx and all volumes
running. Phase 98 formalises this as the `BLUE_GREEN` rollout's rollback path
(`docs/release/adr-phase98-release-strategy.md`,
`docs/release/phase98-release-engineering-runbook.md`):

```bash
git checkout <previous-good-commit>
docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
```

If the previous good image is already available (owner-verified rollback
image), redeploy it instead of rebuilding. **Never auto-restore the Production
database on a deploy failure.** If the bad release shipped a migration
classified `BREAKING_OR_UNKNOWN` or `FORWARD_ONLY_REQUIRES_BACKUP` without a
proven app-rollback path, an app-only rollback is unsafe — this is
`APP_ROLLBACK_REQUIRES_DB_RESTORE` or `RELEASE_ROLLBACK_BLOCKED`; treat it as
an incident and restore from the pre-migration backup (Postgres §Scenario A)
rather than attempting a down-migration. Hermes migrations are forward-only —
there are no down-migrations.

---

## Off-host readiness

Backups leaving the node must **always** be encrypted before transit — the
`.hbk` envelope is produced locally before any off-host copy, never in
transit or at the remote end. **Off-host backup storage is
`OWNER_CONFIGURATION_REQUIRED`**: no off-host provider (S3-compatible bucket,
remote host, etc.) is configured by this repository. Until the owner
configures a destination, all backup artifacts reside only on the Production
host's local disk, which is itself a single point of failure for the "full
node loss" scenario beyond what a fresh host + off-host artifacts could
recover. This is a known, disclosed gap — see below.

---

## Known limitations

- **Temp plaintext is not cryptographically erased.** Both backup and restore
  write a transient plaintext file to a private temp directory and remove it
  with `rm -f`; on SSD/copy-on-write filesystems the underlying blocks may
  remain recoverable until overwritten. Mitigate with full-disk encryption on
  the host/volume.
- **CI cannot prove wall-clock cron execution.** CI rehearses and proves the
  backup/restore *mechanism* and the schedule↔RPO relationship on every PR; it
  cannot observe or assert that the owner-activated Production cron job is
  actually running on schedule on the live host. Confirming that is an
  operational responsibility (check `.meta.json` timestamps / recent artifact
  presence in `${BACKUP_DIR}` on the host).
- **Off-host backup storage is not configured** (`OWNER_CONFIGURATION_REQUIRED`,
  see above) — all current recovery points are local to the Production host.
- **RTO figures are rehearsal evidence**, not measured Production timing — see
  §1.

---

## Rehearsal & verification (no production impact)

- **Automated, every PR (`.github/workflows/phase98-dr-release-assurance.yml`):**
  - `phase98-offline` — offline evaluation, config-inventory freshness, unit
    tests, build, and the adversarial production-safety static review.
  - `phase98-encrypted-pg` — real Postgres 16 encrypted backup/restore
    rehearsal (`scripts/ci/phase98-encrypted-pg-rehearsal.mjs`) and the
    migration gate + rollback rehearsal.
  - `phase98-full-stack` — uploads/documents backup+restore rehearsal, release
    rollback rehearsal (blue/green mechanism) and a full-node recovery
    rehearsal against a disposable Compose project.
  - The Phase 93 rehearsal (`scripts/ci/phase93-dr-restore-rehearsal.mjs`)
    continues to run for the plaintext-era regression coverage.
- **Manual quarterly (staging/disposable only):** restore the latest
  production `.hbk` onto a throwaway database and uploads root, run `migrate
  deploy`, and confirm row counts / file counts. **Never** point this at the
  production database or production volumes.

## Escalation

Postgres down / restore needed / uploads loss / suspected data loss ⇒ page
the Operations owner immediately. See
`docs/release/incident-response-runbook.md`.

# Phase 98 — Full-Stack Disaster Recovery & Release Engineering

**Status:** Implementation complete (Draft PR, unmerged). No Production action taken.
**Base:** `agent/phase97-compliance-privacy-legal-readiness` @ `63a4b48`.
**Branch:** `agent/phase98-full-stack-dr-release-engineering`.

This document is the authoritative architecture + plan for Phase 98. It records the
design, the decisions taken (with rationale), what was proven and how, and the
owner configuration that remains. Companion documents:

- `disaster-recovery-runbook.md` — operator DR procedures.
- `incident-response-runbook.md` — per-incident response.
- `phase98-release-engineering-runbook.md` — release + rollback procedure.
- `phase98-release-checklist.md` — the go/no-go checklist.
- `phase98-assurance-report.md` — the assurance evidence.
- `adr-phase98-release-strategy.md` — blue/green decision record.
- `phase98-configuration-inventory.json` — secret-free configuration inventory.

## Scope

PostgreSQL encrypted backup + restore; uploads backup + restore; Redis persistence
decision; configuration inventory + recovery; full-node recovery; deployment
automation; migration gates; rollback automation; blue/green strategy; release
checklist; version tags; changelog; incident runbooks; RPO; RTO; recovery ownership.

## Safety posture (non-negotiable)

- Production identity preserved: canonical Compose project **`hermes`**, working
  directory `/opt/hermes-os-nexuz`, every Production command pins `-p hermes`.
- No Production rehearsal/backup/restore/migration/deploy executed; no Production
  secret rotated; no OpenBao change; no provider/customer/regulator contact.
- No destructive Production command is introduced: `down -v`, `docker volume rm`
  and `system prune` appear ONLY inside disposable rehearsals whose project/volume
  names begin with `hermes98`/`hermes98test_` and are guarded at runtime.
- Deployment stays manual-only (`workflow_dispatch`, protected `production`
  environment, pinned 40-hex SHA, pinned known_hosts, non-root operator).

## Encrypted backup format (`.hbk`, v1)

Authenticated encryption at rest via **AES-256-GCM** in a versioned envelope. No
custom cryptography beyond framing a standard AEAD.

```
MAGIC "HBK1" (4) | headerLen uint32-BE (4) | header canonical-JSON (N) | ciphertext | GCM tag (16)
```

- The AAD is exactly `MAGIC || headerLen || header`, so the whole header
  (formatVersion, cipher, keyId, nonce, plaintextSha256, plaintextSize, createdAt,
  artifactType) is authenticated. Any tampering, wrong key, corruption, modified
  tag, truncation or unknown version fails the GCM tag check **before any plaintext
  is released**. Header metadata is never trusted until the tag verifies.
- Key handling: the key is a **file** (`HERMES_BACKUP_KEY_FILE`, owner-only 0600),
  never a raw CLI/env value; `HERMES_BACKUP_KEY_ID` is a non-secret identifier.
  The key is never committed, logged, or placed in any manifest. The real
  Production key is NOT provisioned by this repository; CI uses disposable keys.
- Implementation: `scripts/dr/backup-envelope.mjs` (in-memory) and
  `scripts/dr/hbk.mjs` (streaming CLI) produce byte-identical artifacts (cross-check
  tested), so production-scale dumps never load fully into memory.

## PostgreSQL backup / restore

`scripts/backup-postgres.sh` (upgraded): lock → private temp (umask 077) → pg_dump
custom → verify plaintext (`verify-backup.sh`) → encrypt (`hbk.mjs`) → verify
encrypted → transport SHA-256 → atomic `.partial`→`.hbk` → safe `.meta.json`
sidecar → remove plaintext → retention. Fails closed if the key or the verifier is
unavailable (`BACKUP_VERIFIER_MISSING=FAIL`). Temp plaintext is removed, not
cryptographically erased (SSD/CoW caveat, documented).

`scripts/restore-postgres.sh` (upgraded): validate envelope + version → authenticated
decrypt to a private temp → `pg_restore --list` verify → fail-closed target-specific
confirmation (`RESTORE_CONFIRM="restore <db>"`) → drop/create/restore → remove
plaintext. Unauthenticated bytes never stream into `pg_restore`.

Retention (`scripts/dr/backup-retention.mjs` + `apply-retention.mjs`): prunes only
encrypted, verified, superseded, age-eligible artifacts; never drops the newest
verified copy; keeps ≥ `BACKUP_MIN_VERIFIED_COPIES` (default 3); never selects a
`.partial`/unverified artifact for restore.

## Uploads backup / restore

Discovery found TWO durable-intent surfaces: `/app/public/uploads` (avatars,
volume `uploads_data`) and `/app/.data/documents` (uploaded documents, extracted
text, **compliance export packages**) which had **no backing volume** and was lost
on container rebuild. Phase 98 adds an additive `documents_data` volume (existing
volumes unchanged) and backs up BOTH surfaces.

`scripts/dr/uploads-archive.mjs` packs a deterministic multi-root archive with
per-file and manifest SHA-256 and strict path safety (no absolute/`..`/UNC/NUL,
symlinks refused). `backup-uploads.mjs` / `restore-uploads.mjs` seal it with the
same `.hbk` envelope (artifactType `uploads`) and restore each root by label,
verifying every digest. Evidence PACKS are DB-only (covered by the PG backup).

## Redis persistence decision — `REBUILD_FROM_AUTHORITATIVE_STATE`

Authoritative inventory (`scripts/dr/redis-recovery-policy.mjs`): Redis holds only
TTL'd rate-limit counters (`rl:auth:*`, `rl:{orgId}:*`) with in-process fallbacks,
plus stateless PING probes and a shutdown `quit()`. Sessions are the Postgres
`AuthSession` row — NOT Redis. No authoritative-only state lives in Redis.
Therefore Redis is **not part of RPO**; recovery starts a fresh Redis. AOF stays
enabled for ordinary node resilience only. On Redis loss, rate limiting degrades to
per-instance in-process counters (fail-safe; never fail-open).

## Configuration inventory + recovery

`docs/release/phase98-configuration-inventory.json` (generated by
`scripts/dr/config-inventory.mjs`, `npm run config:inventory`) is a secret-free,
machine-readable inventory: every env key NAME with source class
(REPOSITORY_MANAGED / SECRET_EXTERNAL / HOST_MANAGED / REGENERATED /
OWNER_CONFIGURATION / DERIVED), required/optional, recovery source and owner role,
plus config surfaces and persistent volumes. The validator proves every
`.env.production.example` key is documented, no secret VALUE is present, every
non-repository item has a recovery source, and no item has UNKNOWN ownership.

## Recovery set

`scripts/dr/recovery-set.mjs` groups a PostgreSQL artifact + uploads artifact + git
SHA + release/config manifest hashes + snapshot times + max snapshot skew, by
reference only (no secrets, no key material). PostgreSQL and uploads are
**independent snapshots, not one transaction** (`consistencyModel`
`INDEPENDENT_SNAPSHOTS_NOT_TRANSACTIONAL`); the recorded skew is the RPO caveat.

## Full-node recovery

`scripts/ci/phase98-full-node-recovery.mjs` rehearses total node loss against a
DISPOSABLE Compose project (`hermes98test_*`, hard-guarded so `down -v` can never
touch `hermes`): build image → up postgres/redis → migrate → seed DB + both upload
surfaces → start app → verify `/api/health` → encrypted backups → destroy stack +
volumes → recreate → restore → restart → verify DB + uploads + app + Redis and
measure a rehearsal RTO.

## Migration + release engineering

- Migration gate (`scripts/dr/migration-gate.mjs` + `migration-sql-classify.mjs`):
  classifies new migrations (ADDITIVE_COMPATIBLE / FORWARD_ONLY_REQUIRES_BACKUP /
  BREAKING_OR_UNKNOWN), detects historical-migration mutation (fail-closed), and
  requires a verified encrypted pre-migration backup. Unknown/breaking → deploy
  blocked. No down-migrations are ever generated.
- Release manifest (`scripts/dr/release-manifest.mjs`): canonical, SHA-256-hashed,
  secret-free; requires a known previous-good SHA, health endpoints and a rollback
  classification.
- Blue/green (`scripts/dr/blue-green.mjs`): app-only, health gate before atomic
  cutover, previous-good retained, deterministic rollback; never auto-restores the
  Production DB. See the ADR.
- Version/changelog (`scripts/dr/version-changelog.mjs` + `CHANGELOG.md`): SemVer
  `vMAJOR.MINOR.PATCH`; deploy resolves an exact SHA, not a mutable tag; `v1.0.0`
  is reserved for a later phase and is NOT created here.

## RPO / RTO / ownership

See `scripts/dr/rpo-rto.mjs` and `recovery-ownership.mjs`. System RPO = worst
durable component = 24h (owner-activated backup cadence). RTO separates the
mechanism (measured in the disposable rehearsal — rehearsal evidence, not
Production timing) from the owner Production target (4h, historical from Phase 93).
The ownership matrix assigns a primary + backup role, authority, procedure and
escalation to every recovery-critical component (no UNKNOWN owner).

## Assurance

`npm run eval:phase98` (offline, deterministic, fail-closed) checks 17 invariant
groups. `.github/workflows/phase98-dr-release-assurance.yml` runs the offline
assurance + the real Docker rehearsals (encrypted PG, uploads, migration rollback,
release rollback, full-node) with NO secrets, NO SSH, NO Production contact.
`scripts/dr/production-safety-check.mjs` adversarially scans the changed surface.

## Owner configuration still required (not done here)

- Provision the real Production backup key file + `HERMES_BACKUP_KEY_ID`.
- Activate the host backup schedule (cron) for PostgreSQL + uploads.
- One-time populate the new `documents_data` volume from any data currently on the
  live container writable layer.
- Decide/configure an off-host encrypted-backup destination
  (`OFFHOST_BACKUP_DESTINATION=OWNER_CONFIGURATION_REQUIRED`).

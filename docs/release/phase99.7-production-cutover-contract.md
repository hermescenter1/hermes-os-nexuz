# Phase 99.7 — Production cutover & rollback contract

The binding, ordered contract for moving Production from the deployed Phase 94
baseline to the reconciled Phase 99.6 release.

**This document does not perform a deployment.** Nothing in Phase 99.7 contacted
Production, the OpenBao host, or any pentest host. Every step below is executed
by the owner, and the automated parts refuse to proceed on missing evidence.

| Fact | Value |
|---|---|
| Deployed baseline commit | `911a2d7d2c92e275deb39ad24f298f9b4ffaa60f` |
| Release target commit | `cbfa2923318827ee42614c07f2e3861a3db8ed99` |
| Migration count | 49 → 69 |
| New migrations | 20 (append-only) |
| Historical migration mutations | 0 |
| Migration classification | `FORWARD_ONLY_REQUIRES_BACKUP` |
| Pre-migration backup | **required** |
| Rollback strategy | Application-only (`hermes-web`); database recovery is a separate decision |

---

## 1. The contract

Each step must be **complete and evidenced** before the next begins. A step that
cannot be evidenced is a stop, not a warning.

### 1. Exact target SHA proof

The target must be an exact 40-character lowercase hex commit that is an
ancestor of `main`, and the currently-deployed commit must be an ancestor of the
target. `deploy.yml` verifies both on the runner **and** again on the host.

```bash
node scripts/ci/phase997-migration-integrity.mjs
```

Must report `phase997_migration_integrity=PASS`, including
`HISTORICAL_MIGRATION_MUTATION_ZERO` and `MIGRATION_DELTA_EXACTLY_20`.

### 2. Clean worktree on the production host

`/opt/hermes-os-nexuz` must have no local modifications; the deploy performs a
detached checkout of the pinned SHA and must not have to reconcile anything.

### 3. Previous-good image preserved

`deploy.yml` tags the currently-running image as `hermes-web:previous-good`
before the rebuild. Tagging is additive — no image is removed or pruned. If no
running image is found the deploy warns loudly; treat that as a stop and
establish a rollback target manually.

### 4. Encrypted, verified backup

```bash
HERMES_BACKUP_KEY_FILE=... HERMES_BACKUP_KEY_ID=... ./scripts/backup-postgres.sh
```

The release refuses unless **all** of the following hold, and they are checked
on the host itself before anything is rebuilt:

- the key file is configured, readable and owner-only (`chmod 600`);
- the key identifier is configured;
- a `.hbk` artifact exists with no `.partial` sibling;
- its verification record says `"verified":true`, `"partial":false`,
  `"encrypted":true`;
- `sha256sum` of the artifact equals the recorded `transportSha256`.

> **`OWNER_CONFIGURATION_BLOCKED` — off-host copy.** Whether the verified
> artifact has been replicated off the production host is an operator fact this
> repository cannot observe. It is never reported as PASS. Complete it before
> the cutover; a backup that lives only on the host it protects is not a backup.

### 5. `documents_data` adoption verified

Required because Phase 98 introduced the `documents_data` volume. Mounting it
does not move the legacy documents — it **hides** them, and they are lost when
the old container is removed.

```bash
# On the production host, BEFORE hermes-web is recreated with the new compose file.
mkdir -p /tmp/hermes-doc-legacy /tmp/hermes-doc-volume
docker cp hermes-hermes-web-1:/app/.data/documents/. /tmp/hermes-doc-legacy/

# Survey first — writes nothing.
node scripts/dr/adopt-documents.mjs \
  --source /tmp/hermes-doc-legacy \
  --dest   /tmp/hermes-doc-volume \
  --destination-classification EXPECTED_EMPTY \
  --plan-only

# Then adopt, emitting the evidence the deploy gate requires.
node scripts/dr/adopt-documents.mjs \
  --source /tmp/hermes-doc-legacy \
  --dest   /tmp/hermes-doc-volume \
  --destination-classification EXPECTED_EMPTY \
  --manifest-out /backups/postgres/documents-adoption.json
```

The command refuses to overwrite anything, refuses an unclassified non-empty
destination, never deletes the source, and reports `ZERO_DOCUMENTS` distinctly
from `ADOPTED`. `deploy.yml` requires
`/backups/postgres/documents-adoption.json` to exist with
`"integrityVerified": true`.

Keep `/tmp/hermes-doc-legacy` and the old container until after the soak gate —
they are part of the rollback path.

### 6. Migration rehearsal passed

```bash
npm run rehearse:phase997:migrations
```

Applies the 49 baseline migrations to a disposable `pgvector/pg16` database,
seeds SYNTHETIC rows, applies the 20 new migrations, and proves: the resulting
schema is identical to a fresh deploy, no rows were lost, the seeded rows are
byte-identical, a second deploy is idempotent, and the temporary databases are
dropped.

### 7. Candidate passed

```bash
docker build -t hermes997test-app:<sha> .
HERMES_APP_IMAGE=hermes997test-app:<sha> npm run gate:phase997:candidate -- --sha <40-hex>
```

Health, readiness, `/fa` `/en` `/de`, anonymous denial, error hygiene, the
`sharp` runtime gate **inside the container**, severe-log scan, zero restarts,
and `OT_SECRET_BACKEND` unset. The candidate is validated against a **disposable**
database and never dials the live production database.

### 8. Production migration

Migrations are applied by the application's own startup path against the live
database. Step 4 is what makes this reversible.

### 9. Replace ONLY `hermes-web`

```bash
docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
```

`--no-deps` and the explicit service name are load-bearing.

### 10. Preserve `nginx`, `postgres`, `redis` and Stalwart identities

No other service is stopped, recreated, restarted or pruned. No named volume is
removed. Every Compose command pins `-p hermes` (Gate 0D-A).

### 11. Health, readiness, locales

```bash
curl -fsS https://www.hermesnovin.com/api/health
curl -fsS https://www.hermesnovin.com/api/health/ready
for l in fa en de; do curl -fsS -o /dev/null -w "$l %{http_code}\n" "https://www.hermesnovin.com/$l"; done
```

### 12. Severe-log gate

```bash
docker compose -p hermes -f docker-compose.prod.yml logs --since 15m hermes-web \
  | grep -E 'UnhandledPromiseRejection|uncaughtException|ERR_DLOPEN_FAILED|Cannot find module|PrismaClientInitializationError|FATAL'
```

Any match is a stop.

### 13. Soak gate

Observe for the agreed soak window with no new severe log lines, no container
restarts (`docker inspect -f '{{.RestartCount}}'`), and healthy dependencies in
`/api/admin/observability`.

### 14. Rollback image preserved

`hermes-web:previous-good` must still exist for the whole soak window. Do not
prune images during a release.

---

## 2. Rollback — two separate classifications

**These are different operations and must never be conflated.** No automated
path in this repository restores a database. Ever.

### A. Application rollback (`APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA`)

Applicable when the failure is an application regression and the schema change
is compatible with the previous application code. The 20 migrations in this
release classify as `FORWARD_ONLY_REQUIRES_BACKUP`, which is additive-shaped:
the previous application does not read the new columns, so it runs forward
against the new schema.

```bash
docker compose -p hermes -f docker-compose.prod.yml stop hermes-web
docker tag hermes-web:previous-good <the image tag compose expects>
docker compose -p hermes -f docker-compose.prod.yml up -d --no-deps hermes-web
```

The database is left exactly as it is. Data written since the cutover is kept.

### B. Database recovery (`APP_ROLLBACK_REQUIRES_DB_RESTORE` / `RELEASE_ROLLBACK_BLOCKED`)

Applicable only when the database itself is damaged or the schema change proves
incompatible. This is **not** a rollback step — it is an incident, and it
destroys everything written since the backup.

- It is a deliberate human decision, taken with the recorded RPO in hand.
- It is executed via `scripts/restore-postgres.sh` with its target-specific
  confirmation, following `docs/release/disaster-recovery-runbook.md`.
- No workflow, script or gate in this repository triggers it automatically —
  `phase997-release-safety-check.mjs` enforces that as a hard gate.

---

## 3. What Phase 99.7 does **not** claim

- Production was **not** deployed, contacted or modified.
- OpenBao was **not** contacted or changed; `OT_SECRET_BACKEND` remains disabled
  by default and enabled-but-underconfigured still fails closed.
- Green CI proves the tooling and the rehearsals. It does not prove the
  production cutover, and it does not substitute for any external or owner gate
  listed in `docs/release/phase99.7-existing-state-matrix.md` §9.

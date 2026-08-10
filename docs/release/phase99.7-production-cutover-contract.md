# Phase 99.7 — Production cutover & rollback contract

The binding, ordered contract for moving Production from the deployed Phase 94
baseline to the reconciled Phase 99.6 release, and for every migration-bearing
release after it.

**This document does not perform a deployment.** Nothing in Phase 99.7 contacted
Production, the OpenBao host, or any pentest host. Every step below is executed
by the owner, and the automated parts refuse to proceed on missing evidence.

| Fact | Value |
|---|---|
| Rehearsal baseline commit (historical) | `911a2d7d2c92e275deb39ad24f298f9b4ffaa60f` |
| Release target commit | `cbfa2923318827ee42614c07f2e3861a3db8ed99` |
| Migration count rehearsed | 49 → 69 |
| New migrations rehearsed | 20 (append-only) |
| Historical migration mutations | 0 |
| Migration classification | `FORWARD_ONLY_REQUIRES_BACKUP` |
| Pre-migration backup | **required** |
| Rollback strategy | Application-only (`hermes-web`); database recovery is a separate decision |

> **Owner deployment evidence (recorded 2026-08-08, supplied outside CI):** the
> owner has since completed this cutover — Production is established at
> `cbfa2923318827ee42614c07f2e3861a3db8ed99` with **69 completed migrations**.
> The 49 → 69 figures above are retained unchanged as the historical record of
> what this phase rehearsed and proved; they are not rewritten to match the new
> deployed state. For the next release, `deployed_sha` is `cbfa2923…` and the
> migration delta is computed from there by the deploy workflow. See
> [§4 Post-authoring owner evidence](#4-post-authoring-owner-evidence).

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

### 3. Previous-good image preserved (hard gate)

`deploy.yml` resolves the running `hermes-web` container's exact image ID, tags
it `hermes-web:previous-good`, and verifies the tag resolves back to that exact
ID. Tagging is additive — no image is removed or pruned. **A missing running
image is a refusal, not a warning**: a deploy with no rollback target never
proceeds through the workflow. If Production genuinely has no running
`hermes-web` (first bring-up, disaster recovery), that is not a routine release
— follow the DR runbook instead.

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

### 8. Production migration (explicit, pinned migrator)

**Nothing migrates on boot.** The runner image's CMD is `node server.js` and it
deliberately ships only the Prisma runtime, not the CLI. Migrations are an
explicit step, executed by the profile-gated `hermes-migrate` service — the
Dockerfile `migrator` stage, built from the same pinned checkout as the release,
so both the migration set and the CLI version come from the target commit's own
lockfile (never a network-fetched `npx prisma@latest`):

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production build hermes-web
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production --profile migrate build hermes-migrate
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production --profile migrate run --rm -T hermes-migrate
```

Then verify, before anything is replaced:

```bash
# Exits non-zero while ANY migration is pending.
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production --profile migrate run --rm -T hermes-migrate \
  node node_modules/prisma/build/index.js migrate status
# Applied count must equal the target commit's migration count; zero failed rows.
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'psql -U "${POSTGRES_USER:-hermes}" -d "${POSTGRES_DB:-hermes_db}" -tAc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"'
```

`deploy.yml` performs exactly this sequence and refuses to replace `hermes-web`
on any mismatch. A migration failure here stops the deploy with the previous
release still serving traffic — it is **never** answered by an automatic
database restore (step 4 is what makes a human-decided recovery possible).

### 9. Replace ONLY `hermes-web`

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --no-deps hermes-web
```

`--no-deps`, the explicit service name, and `--env-file .env.production` are all
load-bearing — the last one because the `NEXT_PUBLIC_*` build args interpolate
from the canonical env file and silently bake empty values without it.

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
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production stop hermes-web
docker tag hermes-web:previous-good <the image tag compose expects>
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --no-deps hermes-web
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

- Phase 99.7 itself did **not** deploy, contact or modify Production. (The
  owner's own deployment, recorded in §4, is separately supplied evidence — not
  something this phase performed or can verify from CI.)
- OpenBao was **not** contacted or changed; `OT_SECRET_BACKEND` remains disabled
  by default and enabled-but-underconfigured still fails closed.
- Green CI proves the tooling and the rehearsals. It does not prove the
  production cutover, and it does not substitute for any external or owner gate
  listed in `docs/release/phase99.7-existing-state-matrix.md` §9.

---

## 4. Post-authoring owner evidence

Facts supplied by the owner after this contract was authored, recorded
2026-08-08. They are **owner-supplied operational evidence**, deliberately kept
distinct from anything this repository or its CI can observe or assert. Where a
gate below also carries the CI-side status `OWNER_CONFIGURATION_BLOCKED`, that
status describes what *CI can prove* and is not contradicted by the owner
evidence standing beside it.

| Item | Owner evidence | CI-side status |
|---|---|---|
| Production deployment | Established at `cbfa2923318827ee42614c07f2e3861a3db8ed99` with 69 completed migrations | Not observable from CI |
| Production CPU SSE4.2 / `sharp` runtime | Operational evidence supplied (consistent with Phase 99 `PRODUCTION_CPU_SSE4_2=PASS`); re-check on any host change | Candidate gate proves the *image*, not the production host |
| Off-host JIT backup copy | Owner evidence supplied | `OWNER_CONFIGURATION_BLOCKED` (CI cannot observe replication) |
| Host-to-OpenBao WireGuard/TLS transport | Prior owner evidence exists | Not observable from CI |
| Application-container-to-OpenBao connectivity / backend enablement | **No evidence — unproven.** `OT_SECRET_BACKEND` remains unset/disabled and enabled-but-invalid still fails closed | `DISABLED` (proven by tests) |

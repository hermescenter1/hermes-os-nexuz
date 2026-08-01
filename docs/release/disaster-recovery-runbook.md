# Hermes OS — Disaster-Recovery Runbook (Phase 93)

Status: **v1 acceptance** · Owner: Operations · Scope: PostgreSQL data loss /
corruption, bad release, and full-node recovery for the production deployment
(`https://www.hermesnovin.com`, Docker Compose project **`hermes`**).

> **Golden rule.** Never run a restore, destructive query, or chaos test against
> the production database as a rehearsal. The backup→restore pipeline is
> rehearsed automatically on every PR in CI (job **`Phase 93 disaster-recovery
> restore rehearsal`**, `scripts/ci/phase93-dr-restore-rehearsal.mjs`) against a
> disposable database. Use production restore ONLY for a genuine incident.

---

## 1. Recovery objectives (v1)

| Objective | Target | Basis |
|---|---|---|
| **RPO** (max data loss) | **≤ 24 h** | Daily `pg_dump` cron (`0 3 * * *`, `DEPLOYMENT.md §9`). No WAL archiving / PITR at v1 — the worst case is the time since the last nightly dump. |
| **RTO** (time to restore) | **≤ 1 h** | Restore = integrity check + drop/create + `pg_restore` + app restart + `migrate deploy`. The `pg_restore` mechanism itself is timed every CI run (`RESULT phase93_dr_rto_ms=…`); production RTO is dominated by dump size and node I/O. |

**To tighten RPO:** shorten the backup interval (e.g. `0 */6 * * *` ⇒ RPO ≤ 6 h)
or introduce WAL archiving / PITR (out of scope for v1; a v1.x follow-up).

---

## 2. What is backed up, and how

| Script | Action |
|---|---|
| `scripts/backup-postgres.sh` | `docker exec` → `pg_dump --format=custom --no-acl --no-owner` → `${BACKUP_DIR}/hermes_<TIMESTAMP>.dump`; prunes dumps older than `${BACKUP_RETENTION_DAYS:-30}`; then calls `verify-backup.sh`. |
| `scripts/verify-backup.sh` | Integrity: `pg_restore --list` (parses every byte of the TOC) **and** asserts the essential tables `Organization`, `User`, `IndustrialSite`, `IndustrialAsset` are present; writes `.last-verification.json` (consumed by `/api/admin/system`). |
| `scripts/restore-postgres.sh` | Validate arg/file → verify integrity → **fail-closed confirmation guard** → stop `hermes-web` → terminate connections → `DROP DATABASE` + `CREATE DATABASE` → `pg_restore --no-acl --no-owner` → restart `hermes-web` → reminder to run `migrate deploy`. |

**BACKUP_PERMISSIONS = ENFORCED:** `backup-postgres.sh` sets `umask 077`, hardens
`BACKUP_DIR` to `0700` and each dump to `0600`, so dumps (full tenant data) are
never world- or group-readable (`phase93-backup-restore-hardening.test.ts`).

**RESTORE_ENVIRONMENT_GUARD = FAIL_CLOSED:** `restore-postgres.sh` refuses by
default. It runs only on an explicit, **target-specific** confirmation —
interactively (type `restore <db>`) or non-interactively via
`RESTORE_CONFIRM="restore <db>"`. The phrase embeds the exact target database, so
a confirmation meant for staging cannot authorise a production restore; with no
confirmation and no TTY it exits non-zero without touching the database. (The old
10 s Ctrl+C countdown was fail-OPEN and has been removed.)

Artifacts are custom-format `.dump` files (NOT `.sql.gz`). Redis is a cache /
rate-limit store and is **not** part of the recovery point — it rebuilds itself;
the auth limiter fails safe to an in-process fallback while Redis is absent
(`phase93-redis-unavailable-failmode.test.ts`).

> **Remaining v1.x follow-up (accepted):** backups are still **not encrypted at
> rest**. Mitigate by placing `BACKUP_DIR` on an encrypted, restricted volume;
> at-rest encryption (e.g. gpg or an encrypted filesystem) is a v1.x follow-up.

---

## 3. Scenario A — Restore after data loss / corruption

1. **Confirm the incident.** Is PostgreSQL up? `docker compose -p hermes ps`. Is
   `/api/health/ready` returning 503 (SLI-2)? Is `dependency_up{postgres}==0` (SLI-7)?
2. **Pick the newest verified backup.** `ls -lt ${BACKUP_DIR}/hermes_*.dump`.
   Confirm `.last-verification.json` shows the latest as verified.
3. **Restore** (drops + recreates the DB — the app is briefly stopped; fail-closed
   confirmation required, interactively or via `RESTORE_CONFIRM`):
   ```bash
   POSTGRES_CONTAINER=hermes-postgres-1 RESTORE_CONFIRM="restore hermes_db" \
   bash /opt/hermes-os/scripts/restore-postgres.sh /opt/hermes-os/backups/hermes_<TIMESTAMP>.dump
   ```
4. **Apply migrations** if the backup predates the deployed schema:
   ```bash
   docker compose -p hermes -f docker-compose.prod.yml exec hermes-web npx prisma migrate deploy
   ```
5. **Verify recovery.** `/api/health/ready` == 200; log in; spot-check a case /
   knowledge article; `/api/admin/observability` shows healthy dependencies and no
   fresh error spike.
6. **Record** the incident (start, cause, backup used, RTO achieved) per the
   incident-response runbook.

## 4. Scenario B — Bad release (app regression, schema intact)

Roll back the **app only** — keep postgres/redis/nginx and all volumes running:
```bash
git checkout <previous-good-commit>
docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
```
If the previous good image is already available (owner-verified rollback image),
redeploy it instead of rebuilding. If the bad release ran a migration, treat as a
schema change: prefer restoring from the pre-migration backup (Scenario A) over
attempting a down-migration — Hermes migrations are additive and not designed for
automatic rollback.

## 5. Scenario C — Full node loss

1. Provision a new host; install Docker + Compose.
2. Restore the repo checkout at the last good commit to `/opt/hermes-os-nexuz`.
3. Restore secrets/env out of band (never from Git).
4. Bring up data services: `docker compose -p hermes -f docker-compose.prod.yml up -d postgres redis`.
5. Restore the newest verified `.dump` (Scenario A steps 3–4).
6. Bring up `hermes-web` + `nginx`; verify TLS and `/api/health/ready`.

---

## 6. Rehearsal & verification (no production impact)

- **Automated, every PR:** the CI job runs the real `pg_dump`→verify→drop→timed
  `pg_restore`→per-table row-count integrity→idempotent `migrate deploy`→fresh-DB
  restore cycle and prints `phase93_dr_rto_ms`. Any row mismatch fails the build.
- **Manual quarterly (staging/disposable only):** restore the latest production
  `.dump` onto a throwaway database, run `migrate deploy`, and confirm row counts.
  **Never** point this at the production database.

## 7. Escalation

Postgres down / restore needed / suspected data loss ⇒ page the Operations owner
immediately. See `docs/release/incident-response-runbook.md`.

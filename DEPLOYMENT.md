# Hermes OS — Production Deployment Guide

## Architecture

```
Internet
   │
   ▼
[Nginx :80/:443]  ←── Certbot (Let's Encrypt)
   │
   ▼ (internal Docker network)
[hermes-web :3000]  ←── Next.js standalone
   │         │
   ▼         ▼
[postgres]  [redis]  (no public ports)

[uptime-kuma :3001]  ←── optional monitoring profile
```

---

## VPS Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU      | 1 vCPU  | 2 vCPU      |
| RAM      | 1 GB    | 2 GB        |
| Disk     | 20 GB   | 40 GB       |
| OS       | Ubuntu 22.04 LTS or Debian 12 |

Open ports: **80** (HTTP / Certbot challenge), **443** (HTTPS), **22** (SSH). Port 3001 only if running Uptime Kuma on the same server.

---

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

---

## 2. Clone the Repository

```bash
git clone https://github.com/your-org/hermes-os.git /opt/hermes-os
cd /opt/hermes-os
```

---

## 3. Environment Setup

```bash
cp .env.production.example .env.production
nano .env.production   # fill in real secrets
```

Generate secrets:
```bash
openssl rand -hex 64   # use output for JWT_ACCESS_SECRET
openssl rand -hex 64   # use output for JWT_REFRESH_SECRET (must be different)
```

Key variables to set:
- `DATABASE_URL` — use `postgres` as host (Docker internal service name)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — 64-char hex strings
- `APP_URL` / `NEXT_PUBLIC_APP_URL` — your domain with https://
- `POSTGRES_PASSWORD` / `REDIS_PASSWORD` — strong random passwords

---

## 4. SSL Certificate (Certbot)

```bash
# Issue certificate before starting Nginx (standalone mode)
sudo apt install -y certbot
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com \
  --email admin@yourdomain.com --agree-tos --no-eff-email
```

After the certificate is issued, edit `deploy/nginx/default.conf`:
- Replace all `yourdomain.com` with your actual domain
- Uncomment the HTTPS server block

See `deploy/ssl/README.md` for Cloudflare and alternative SSL strategies.

---

## 5. First Deploy

```bash
# Build and start all services.
# --env-file .env.production is REQUIRED: it feeds ${VAR} interpolation such as
# ${REDIS_PASSWORD} in the compose file. Without it, redis is (re)created with
# the 'changeme' default while hermes-web uses the real password → Redis auth
# failures.
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --build

# Verify services are running
docker compose -p hermes -f docker-compose.prod.yml ps
```

---

## 6. Database Migration

Run migrations against the live PostgreSQL container:

```bash
docker compose -p hermes -f docker-compose.prod.yml exec hermes-web \
  node -e "const {execSync}=require('child_process'); execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', {stdio:'inherit', cwd:'/app'})"
```

**Warning:** never run migrations against an unidentified stack or database.
Before any migration, confirm you are attached to the canonical `hermes`
project (`docker compose -p hermes -f docker-compose.prod.yml ps`) and that the
target database is the canonical one (see §14).

The in-container command above is the canonical path: it runs inside the
identified `hermes` project against the internal `postgres` service, so there is
no ambiguity about which database is targeted.

> **Do not** run migrations from your host against `your-vps-ip:5432`. The
> `postgres` service publishes **no host port** (`docker-compose.prod.yml`:
> "No public port — internal network only"), so that address is never the
> canonical `hermes_db`; anything answering on it is an unidentified database —
> exactly what the warning above forbids. If a host-side run is unavoidable,
> open a deliberate SSH tunnel to the internal `postgres`, verify you are on
> `hermes_db`, and avoid putting the password on the command line (shell
> history). Prefer the in-container command.

---

## 7. Verify the Deployment

```bash
# Health check
curl https://yourdomain.com/api/health

# Expected response
# {"status":"ok","timestamp":"...","environment":"production","database":{"status":"ok","latencyMs":3}}

# Check logs
docker compose -p hermes -f docker-compose.prod.yml logs -f hermes-web
```

---

## 8. Optional: Start Monitoring

For single-server setups (see `deploy/monitoring/README.md` for the recommended separate-host approach):

```bash
docker compose -p hermes -f docker-compose.prod.yml --profile monitoring up -d uptime-kuma
```

Access Uptime Kuma at `http://your-server-ip:3001` and add a monitor for `https://yourdomain.com/api/health`.

---

## 9. Backup and Restore

> **Phase 98 supersedes the earlier plaintext `.dump` flow.** Backups are now
> AES-256-GCM ENCRYPTED artifacts (`.hbk`). The durable plaintext `hermes_<ts>.dump`
> is no longer produced; plaintext exists only transiently in a private temp dir
> during backup/restore and is removed afterwards. The encryption key is a FILE
> (`HERMES_BACKUP_KEY_FILE`, owner-only 0600) identified by a non-secret
> `HERMES_BACKUP_KEY_ID`; it is never committed, logged, or placed in a manifest.
> Generate a key: `umask 077 && openssl rand -hex 32 > /secure/hermes-backup.key`.

### Manual Backup (encrypted)

```bash
# On the VPS. Fails closed if the key or the verifier is unavailable.
POSTGRES_CONTAINER=hermes-postgres-1 \
BACKUP_DIR=/opt/hermes-os/backups \
HERMES_BACKUP_KEY_FILE=/secure/hermes-backup.key \
HERMES_BACKUP_KEY_ID=hermes-backup-2026-08 \
bash /opt/hermes-os/scripts/backup-postgres.sh
```

Also back up the durable upload surfaces (avatars + documents/exports):

```bash
node /opt/hermes-os/scripts/dr/backup-uploads.mjs \
  --roots "public-uploads:/opt/hermes-os/uploads,data-documents:/opt/hermes-os/documents" \
  --out /opt/hermes-os/backups/hermes_uploads_$(date +%Y%m%d_%H%M%S).hbk \
  --key-file /secure/hermes-backup.key --key-id hermes-backup-2026-08
```

### Automated Daily Backups (cron)

```bash
echo "0 3 * * * root POSTGRES_CONTAINER=hermes-postgres-1 BACKUP_DIR=/opt/hermes-os/backups HERMES_BACKUP_KEY_FILE=/secure/hermes-backup.key HERMES_BACKUP_KEY_ID=hermes-backup-2026-08 bash /opt/hermes-os/scripts/backup-postgres.sh >> /var/log/hermes-backup.log 2>&1" \
  | sudo tee /etc/cron.d/hermes-backup
```

### Restore from an encrypted backup

```bash
# Restore consumes the ENCRYPTED .hbk artifact. It validates the envelope,
# AUTHENTICATES + decrypts to a private temp file (GCM verified BEFORE the database
# is touched), verifies the dump, then requires the exact target confirmation.
# FAIL-CLOSED: refuses unless you confirm the target DB (interactively type
# "restore <db>", or set RESTORE_CONFIRM).
RESTORE_CONFIRM="restore hermes_db" \
HERMES_BACKUP_KEY_FILE=/secure/hermes-backup.key \
  bash /opt/hermes-os/scripts/restore-postgres.sh /opt/hermes-os/backups/hermes_postgres_20260101_030000.hbk
```

**Warning:** restore drops and recreates the database. The app is stopped briefly during restore.
Artifacts are owner-only (umask 077, 0600) and retention never prunes the last verified copy
(`BACKUP_MIN_VERIFIED_COPIES`). The removed temp plaintext is deleted, not cryptographically erased
(SSD/CoW caveat). If the backup predates a schema migration, run `npx prisma migrate deploy` after restore.

See `docs/release/disaster-recovery-runbook.md` for the full DR procedure, RPO/RTO, recovery ownership,
and the CI-proven encrypted backup→restore + full-node recovery rehearsals.

---

## 10. Rollback

> **Phase 98:** the release/rollback procedure is now documented in
> `docs/release/phase98-release-engineering-runbook.md` (blue/green, app-only,
> health-gated cutover, deterministic rollback). The app-only quick rollback below
> remains valid for a release with NO schema change.

```bash
# Roll back the app only (NO schema change): check out the previous-good commit and
# rebuild ONLY hermes-web. Do NOT use `docker compose down` — postgres, redis and
# nginx must keep running. Always pin the canonical project with -p hermes.
git checkout <previous-good-commit-sha>
docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
```

If the schema changed, follow the migration rollback classification: restore from a verified
encrypted pre-migration backup rather than attempting a down-migration. The Production database is
NEVER auto-restored by deployment automation — it is an explicit operator/incident decision.

---

## 11. SSL Certificate Renewal

Certbot auto-renews certificates. Verify the cron is active:

```bash
sudo certbot renew --dry-run

# Add reload hook so Nginx picks up renewed certs automatically.
# Under the canonical project the container is `hermes-nginx-1`
# (<project>-<service>-<index>, Compose v2), matching `hermes-postgres-1` in §9.
echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'docker exec hermes-nginx-1 nginx -s reload'" \
  | sudo tee /etc/cron.d/certbot-renew
```

---

## 12. Useful Commands

```bash
# View all logs
docker compose -p hermes -f docker-compose.prod.yml logs -f

# Restart app only
docker compose -p hermes -f docker-compose.prod.yml restart hermes-web

# Open a shell in the app container
docker compose -p hermes -f docker-compose.prod.yml exec hermes-web sh

# Connect to PostgreSQL
docker compose -p hermes -f docker-compose.prod.yml exec postgres psql -U hermes hermes_db

# Rebuild and redeploy without downtime
docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web
```

---

## 13. Production Release Workflow (manual only)

Production is released exclusively through the **Production Deploy** GitHub
Actions workflow (`.github/workflows/deploy.yml`), triggered by
`workflow_dispatch`. **Merging or pushing to `main` never deploys anything.**
Pull-request validation runs in the separate `CI` workflow
(`.github/workflows/ci.yml`), which has no secrets and no production access.

> **Availability:** GitHub only offers `workflow_dispatch` ("Run workflow") for
> workflows that exist on the repository's **default branch**. Since **Gate 0C**
> the default branch is `main`, so the Production Deploy workflow is manually
> runnable from the Actions tab.

To release:

1. Open Actions → Production Deploy → Run workflow.
2. Provide the **exact 40-character commit SHA** on `main` to deploy.
3. Type the confirmation phrase `deploy-to-production`.
4. Approve the run in the protected `production` environment.

The `production` environment protection is **configured** (Settings →
Environments → production): required reviewer `hermescenter1`; prevent
self-review is disabled because this is currently a single-reviewer setup;
administrator bypass is disabled; deployments are restricted to the `main`
branch.

The workflow operates in `/opt/hermes-os-nexuz` on the production host — the
canonical checkout of this repository. (Example paths such as `/opt/hermes-os`
in earlier sections are historical and refer to the same checkout.)

The workflow refuses to run unless the commit is part of `main` history
(verified on the runner and re-verified on the server), then checks out that
exact SHA on the server and rebuilds **only** the `hermes-web` service
(`docker compose -p hermes -f docker-compose.prod.yml up -d --build --no-deps hermes-web`).
It never touches `postgres`, `redis`, `nginx`, any named volume, and never
prunes images or restarts the host. Every Compose command it runs pins the
canonical project with `-p hermes` (see §14).

### Required production environment secrets

These must be scoped to the protected `production` **environment** (Settings →
Environments → production → Environment secrets), **not** as repository-wide
secrets. Scoping them to the environment means they are only exposed to a job
that declares `environment: production` — i.e. only to Production Deploy, after
the required reviewer approves the run — and are never available to the `CI`
workflow or to any other job. The deploy job reads them accordingly.

| Secret | Meaning |
|--------|---------|
| `SERVER_IP` | Production host address |
| `SERVER_USER` | The documented **non-root** deploy operator (docker group member, §1); the workflow refuses `root` |
| `SSH_KEY` | Private key for the deploy operator (CRLF endings are normalized and the key is validated with `ssh-keygen` before use) |
| `SSH_KNOWN_HOSTS` | Pinned `known_hosts` line(s) for the production host, collected **out of band** by the operator; runtime `ssh-keyscan` is not used |
| `SSH_PORT` | **Optional.** SSH port of the production host; defaults to `22` when unset. Validated as an integer in the range 1–65535 before use |

When `SSH_PORT` is set to a non-default port, the pinned `SSH_KNOWN_HOSTS`
entry must use the matching `[host]:port` form (e.g. `[203.0.113.10]:2222 ssh-ed25519 AAAA…`),
because OpenSSH looks up non-default ports under that key format.

Set actual values only in the GitHub UI. Never commit secret values to the
repository, and never place them in the `CI` workflow.

---

## 14. Canonical Production Compose Project (Gate 0D-A)

The Production stack has exactly one canonical identity:

| Resource | Canonical name |
|----------|----------------|
| Compose project | `hermes` |
| PostgreSQL volume | `hermes_postgres_data` |
| Internal network | `hermes_hermes_internal` |
| Working directory | `/opt/hermes-os-nexuz` |

Rules — these are mandatory, not stylistic:

- **Every** Production Compose command must contain `-p hermes`:

  ```bash
  docker compose -p hermes -f docker-compose.prod.yml <command>
  ```

- `docker-compose.prod.yml` also declares top-level `name: hermes`. That is
  **defense in depth only** — it does not replace the explicit `-p hermes`,
  which remains mandatory in every command, script and document.
- **Never infer the Production project name from the checkout directory.**
  Without pinning, Docker Compose derives the project name from the directory
  name, which silently creates a second isolated project.
- Before any maintenance, verify you are attached to the canonical stack:

  ```bash
  docker compose -p hermes -f docker-compose.prod.yml ps
  ```

Explicit warnings:

- ❌ Never run Production Compose without `-p hermes`.
- ❌ Never run `docker compose down -v` — it destroys the named data volumes.
- ❌ Never delete named volumes (`docker volume rm`, `docker system prune --volumes`).
- ❌ Never run migrations against an unidentified stack or database — identify
  the project (`-p hermes`) and the database (`hermes_db`) first.

**Incident note (2026-07):** an unpinned `docker compose` invocation from
`/opt/hermes-os-nexuz` derived the project name `hermes-os-nexuz` and created a
second, empty stack (new network and empty `hermes-os-nexuz_postgres_data`
volume). Login and password reset failed while Nginx pointed at the empty
stack. Production was restored to the canonical `hermes` project; the
accidental `hermes-os-nexuz` project and its volumes are intentionally left
untouched. Their cleanup is deferred to **Gate 0D-B** and must not be attempted
outside that gate.

**Enforcement scope.** CI runs `scripts/production-compose-project-static-check.mjs`
on every pull request. It enforces these invariants in two tiers:

- **Tier 1 — the deploy pipeline:** `docker-compose.prod.yml` (top-level
  `name: hermes`) and `.github/workflows/deploy.yml` (only the exact targeted
  `up`/`ps` commands, pinned, plus the full Gate 0A contract).
- **Tier 2 — the operator surface:** every runbook, checklist and shell script
  under `docs/`, `deploy/` and `scripts/` (plus this file). Any executable or
  copy-paste **production** Compose command (one referencing
  `docker-compose.prod.yml`) must be pinned with `-p hermes` and use the v2
  `docker compose` form. As executable operator commands the checker also
  forbids an obsolete master-branch pull and any volume-destroying cleanup (the
  ❌ items listed above). Explicit prohibition lines (marked ❌, or containing
  "Never", "Do not", "must not", "forbidden") are recognized as prose, so a
  runbook can still name a dangerous command in order to forbid it. The separate
  OpenBao staging Compose project is excluded by an `openbao` deny-list.

If you add a new runbook or script with an unpinned production Compose command,
CI fails until you pin it.

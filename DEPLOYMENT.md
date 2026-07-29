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
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d --build

# Verify services are running
docker-compose -f docker-compose.prod.yml ps
```

---

## 6. Database Migration

Run migrations against the live PostgreSQL container:

```bash
docker-compose -f docker-compose.prod.yml exec hermes-web \
  node -e "const {execSync}=require('child_process'); execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', {stdio:'inherit', cwd:'/app'})"
```

Or run the migration from your host with the production DATABASE_URL:

```bash
DATABASE_URL="postgresql://hermes:PASS@your-vps-ip:5432/hermes_db" \
  npx prisma migrate deploy
```

---

## 7. Verify the Deployment

```bash
# Health check
curl https://yourdomain.com/api/health

# Expected response
# {"status":"ok","timestamp":"...","environment":"production","database":{"status":"ok","latencyMs":3}}

# Check logs
docker-compose -f docker-compose.prod.yml logs -f hermes-web
```

---

## 8. Optional: Start Monitoring

For single-server setups (see `deploy/monitoring/README.md` for the recommended separate-host approach):

```bash
docker-compose -f docker-compose.prod.yml --profile monitoring up -d uptime-kuma
```

Access Uptime Kuma at `http://your-server-ip:3001` and add a monitor for `https://yourdomain.com/api/health`.

---

## 9. Backup and Restore

### Manual Backup

```bash
# On the VPS
POSTGRES_CONTAINER=hermes-postgres-1 \
BACKUP_DIR=/opt/hermes-os/backups \
bash /opt/hermes-os/scripts/backup-postgres.sh
```

### Automated Daily Backups (cron)

```bash
echo "0 3 * * * root POSTGRES_CONTAINER=hermes-postgres-1 BACKUP_DIR=/opt/hermes-os/backups bash /opt/hermes-os/scripts/backup-postgres.sh >> /var/log/hermes-backup.log 2>&1" \
  | sudo tee /etc/cron.d/hermes-backup
```

### Restore from Backup

```bash
bash /opt/hermes-os/scripts/restore-postgres.sh /opt/hermes-os/backups/hermes_20260101_030000.sql.gz
```

**Warning:** restore drops and recreates the database. The app is stopped briefly during restore.

---

## 10. Rollback

```bash
# Roll back to the previous image
docker-compose -f docker-compose.prod.yml down
git checkout <previous-commit-hash>
docker-compose -f docker-compose.prod.yml up -d --build
```

If the schema changed, restore from a pre-migration backup rather than attempting a schema rollback.

---

## 11. SSL Certificate Renewal

Certbot auto-renews certificates. Verify the cron is active:

```bash
sudo certbot renew --dry-run

# Add reload hook so Nginx picks up renewed certs automatically
echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'docker exec hermes-nginx nginx -s reload'" \
  | sudo tee /etc/cron.d/certbot-renew
```

---

## 12. Useful Commands

```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart app only
docker-compose -f docker-compose.prod.yml restart hermes-web

# Open a shell in the app container
docker-compose -f docker-compose.prod.yml exec hermes-web sh

# Connect to PostgreSQL
docker-compose -f docker-compose.prod.yml exec postgres psql -U hermes hermes_db

# Rebuild and redeploy without downtime
docker-compose -f docker-compose.prod.yml up -d --build --no-deps hermes-web
```

---

## 13. Production Release Workflow (manual only)

Production is released exclusively through the **Production Deploy** GitHub
Actions workflow (`.github/workflows/deploy.yml`), triggered by
`workflow_dispatch`. **Merging or pushing to `main` never deploys anything.**
Pull-request validation runs in the separate `CI` workflow
(`.github/workflows/ci.yml`), which has no secrets and no production access.

> **Availability:** GitHub only offers `workflow_dispatch` ("Run workflow") for
> workflows that exist on the repository's **default branch**. The default
> branch is still `master`, so the Production Deploy workflow is **not yet
> manually runnable**. It becomes available only after **Gate 0C** changes the
> GitHub default branch to `main`. Do not attempt a manual run before then.

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
(`up -d --build --no-deps hermes-web`). It never touches `postgres`, `redis`,
`nginx`, any named volume, and never prunes images or restarts the host.

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

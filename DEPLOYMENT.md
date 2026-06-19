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

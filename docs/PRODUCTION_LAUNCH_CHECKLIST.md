# Hermes OS — Production Launch Checklist

**Version:** Phase 46 (Final Production QA)  
**Last updated:** 2026-06-21

Use this checklist for every production deployment. Check off each item. Do not skip steps.

---

## Pre-Deployment (Infrastructure)

### DNS & Certificates

- [ ] DNS A/AAAA record for production domain points to VPS IP
- [ ] TTL propagated (check with `dig yourdomain.com`)
- [ ] Run Certbot: `certbot certonly --webroot -w /path/to/certbot/www -d yourdomain.com -d www.yourdomain.com`
- [ ] Certificates placed in `/etc/letsencrypt/live/yourdomain.com/`
- [ ] nginx HTTPS block uncommented in `deploy/nginx/default.conf`
- [ ] Replace `yourdomain.com` placeholder with real domain in `deploy/nginx/default.conf`
- [ ] HSTS header uncommented and configured in nginx config
- [ ] Test HTTPS: `curl -I https://yourdomain.com/api/health`

### Secrets

- [ ] Generate `JWT_SECRET`: `openssl rand -hex 64`
- [ ] Generate `AUTH_SECRET`: `openssl rand -hex 64`
- [ ] Generate `NEXTAUTH_SECRET`: `openssl rand -hex 64`
- [ ] Set `POSTGRES_PASSWORD` to a unique strong password (never reuse dev value)
- [ ] Set `REDIS_PASSWORD` in `.env.production` and in Redis `command:` in compose
- [ ] Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to production values (not dev defaults)
- [ ] Verify `.env.production` is NOT committed (must be in `.gitignore`)
- [ ] Set `APP_URL=https://yourdomain.com`
- [ ] Set `NEXT_PUBLIC_APP_URL=https://yourdomain.com`

### Email

- [ ] Choose EMAIL_PROVIDER: `smtp` | `sendgrid` | `resend`
- [ ] Configure email credentials in `.env.production`
- [ ] Test email delivery (send a test registration)
- [ ] **Never use `EMAIL_PROVIDER=console` in production**

### VPS / Server

- [ ] UFW/firewall: only ports 22, 80, 443 open publicly
- [ ] Docker installed and running
- [ ] Docker Compose installed
- [ ] No port 5432, 6379, or 3000 exposed publicly (verify with `ss -tlnp`)

---

## Database Setup (First Deploy Only)

- [ ] Create postgres volume: `docker volume create hermes_postgres_data`
- [ ] Start only postgres: `docker-compose -f docker-compose.prod.yml up -d postgres`
- [ ] Wait for postgres to be healthy: `docker-compose -f docker-compose.prod.yml ps`
- [ ] Run pgvector extension: `docker exec <postgres_container> psql -U hermes -d hermes_db -c "CREATE EXTENSION IF NOT EXISTS vector;"`
- [ ] Run migrations:
  ```bash
  docker-compose -f docker-compose.prod.yml run --rm hermes-web \
    npx prisma migrate deploy
  ```
- [ ] Confirm migrations applied: `npx prisma migrate status`

### Rollback Plan (Schema)

If a migration causes issues:
1. `docker-compose -f docker-compose.prod.yml down hermes-web`
2. Restore the postgres volume from last backup:
   ```bash
   docker exec <postgres> pg_restore -U hermes -d hermes_db /backups/postgres/latest.dump
   ```
3. Redeploy previous Docker image tag
4. Report the issue in the project repository

---

## Build & Deploy

- [ ] Pull latest code: `git pull origin master`
- [ ] Build production image: `docker-compose -f docker-compose.prod.yml build --no-cache`
- [ ] Start all services: `docker-compose -f docker-compose.prod.yml up -d`
- [ ] Watch logs: `docker-compose -f docker-compose.prod.yml logs -f hermes-web`
- [ ] Verify startup checks pass in logs:
  ```
  {"level":"INFO","msg":"[startup] Startup validation complete.","fatal":0,"warnings":0,"ok":9}
  ```
- [ ] Verify health check passes: `curl -s https://yourdomain.com/api/health`
  - Expected: `{"status":"ok"}`

---

## Post-Deploy Smoke Tests

Run these manually after every deploy. All must return expected status.

### Public endpoints (no auth required)

- [ ] `GET /api/health` → `{"status":"ok"}` (HTTP 200) — only key is `status`
- [ ] `GET /` → HTTP 200 (home/login page loads)

### Auth smoke tests

- [ ] Register a new account with a real email address
- [ ] Verify email is received (or check console log in dev)
- [ ] Verify email token via link
- [ ] Login with registered credentials → HTTP 200 with session cookie
- [ ] Wrong password → HTTP 401 `{"error":"invalid-credentials"}`

### Protected routes (unauthenticated — must return 401)

- [ ] `GET /api/industrial/sites` → HTTP 401
- [ ] `GET /api/industrial/assets` → HTTP 401
- [ ] `GET /api/predictive/risk` → HTTP 401
- [ ] `GET /api/admin/system` → HTTP 401
- [ ] `GET /api/multi-site/kpis` → HTTP 401

### Security header verification

Run: `curl -I https://yourdomain.com/` and verify:
- [ ] `content-security-policy` header present with `nonce`
- [ ] `x-frame-options: DENY`
- [ ] `x-content-type-options: nosniff`
- [ ] `referrer-policy: strict-origin-when-cross-origin`
- [ ] `strict-transport-security` header present (after HTTPS configured)

### Industrial data access

- [ ] Create a site via API with OWNER credentials → HTTP 201
- [ ] Create an asset on that site → HTTP 201
- [ ] List assets → HTTP 200, asset visible in list
- [ ] GET single asset by ID → HTTP 200

### Predictive engine

- [ ] `GET /api/predictive/risk?orgId=...` (OWNER) → HTTP 200, results array
- [ ] `GET /api/predictive/risk?orgId=...&assetId=<known-id>` (OWNER) → HTTP 200

---

## Site Isolation Verification (Mandatory for Multi-Tenant)

- [ ] Create User B with access to Site A only (via `UserSite` grant)
- [ ] Verify User B sees Site A assets in list
- [ ] Verify User B does NOT see Site B assets in list
- [ ] Verify User B GET on Site B asset by ID → HTTP 404 (not 403)
- [ ] Verify User B predictive batch only returns Site A assets
- [ ] Verify OWNER sees all sites without `UserSite` rows

---

## Monitoring (Optional but Recommended)

- [ ] Start monitoring profile: `docker-compose -f docker-compose.prod.yml --profile monitoring up -d uptime-kuma`
- [ ] Configure Uptime Kuma to monitor `https://yourdomain.com/api/health`
- [ ] **Note:** If using a single VPS, port 3001 is publicly exposed when monitoring is active. For production, run Uptime Kuma on a separate host.
- [ ] Set up Uptime Kuma alert notifications (email, Slack, etc.)

---

## Backup

- [ ] Verify backup script exists: `ls deploy/backup/`
- [ ] Run manual backup: `./deploy/backup/pg_backup.sh`
- [ ] Verify backup file created in `BACKUP_DIR`
- [ ] Set up cron for daily backups:
  ```bash
  0 2 * * * /path/to/deploy/backup/pg_backup.sh >> /var/log/hermes-backup.log 2>&1
  ```
- [ ] Verify backup can be restored (test restore on staging)

---

## Rollback Procedure

If deployment fails:
1. `docker-compose -f docker-compose.prod.yml down hermes-web nginx`
2. Restore previous image: `docker tag hermes-os:previous hermes-os:latest`
3. Restart: `docker-compose -f docker-compose.prod.yml up -d hermes-web nginx`
4. Restore DB from backup if migration was applied:
   ```bash
   docker exec <postgres_container> pg_restore -U hermes -d hermes_db /backups/postgres/<timestamp>.dump
   ```
5. Monitor logs: `docker-compose -f docker-compose.prod.yml logs -f hermes-web`

---

## Go/No-Go Decision

Before marking deployment complete, confirm:

- [ ] All smoke tests passed
- [ ] No FATAL entries in startup log
- [ ] Readiness score ≥ 80/100 (`GET /api/admin/system` shows score)
- [ ] HTTPS with valid certificate serving all traffic
- [ ] Backups running
- [ ] Monitoring active

---

*This checklist supersedes any previous launch procedures. Update this document after each production incident.*

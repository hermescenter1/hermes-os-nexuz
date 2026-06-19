# Hermes OS — Monitoring

## Architecture Note

**Uptime Kuma should ideally run on a separate VPS**, not alongside the app. If the app server goes down, monitoring should still be up to alert you. The `--profile monitoring` in `docker-compose.prod.yml` is provided for single-server convenience only.

---

## Uptime Kuma Setup

### Start (single-server, convenience mode)

```bash
docker-compose -f docker-compose.prod.yml --profile monitoring up -d
```

Access the dashboard at: `http://your-server-ip:3001`

On first launch, create an admin account. Then add monitors as described below.

### Recommended Monitors

#### 1. App Health Endpoint

| Field      | Value                                    |
|------------|------------------------------------------|
| Type       | HTTP(s)                                  |
| URL        | `https://yourdomain.com/api/health`      |
| Interval   | 60 seconds                               |
| Keyword    | `"status":"ok"`                          |

The health endpoint returns `status: "ok"` when the app and DB are reachable, or `status: "degraded"` if the DB check fails.

Example response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-19T12:00:00.000Z",
  "environment": "production",
  "database": { "status": "ok", "latencyMs": 3 }
}
```

#### 2. App Uptime (root page)

| Field    | Value                          |
|----------|--------------------------------|
| Type     | HTTP(s)                        |
| URL      | `https://yourdomain.com/`      |
| Interval | 60 seconds                     |

#### 3. PostgreSQL (TCP ping)

| Field    | Value              |
|----------|--------------------|
| Type     | TCP Port           |
| Host     | `postgres`         |
| Port     | `5432`             |
| Interval | 60 seconds         |

Note: PostgreSQL has no public port in production (internal Docker network only). For TCP monitoring from an external Kuma instance, set up a pg_isready check via SSH or a sidecar.

#### 4. Redis (TCP ping)

| Field    | Value     |
|----------|-----------|
| Type     | TCP Port  |
| Host     | `redis`   |
| Port     | `6379`    |

---

## Alerting

Uptime Kuma supports Telegram, Slack, email, PagerDuty, and many others. Configure notification channels in Settings → Notifications, then attach them to each monitor.

---

## Separate-Host Deployment (Recommended)

```bash
# On a second VPS
docker run -d \
  --restart unless-stopped \
  -p 3001:3001 \
  -v uptime-kuma-data:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1
```

Point its monitors at `https://yourdomain.com/api/health` from the outside — this verifies both app availability and SSL certificate validity from the user's perspective.

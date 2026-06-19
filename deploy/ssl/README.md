# Hermes OS — SSL Configuration

Three supported strategies. The `docker-compose.prod.yml` assumes **Option 1 (Certbot)** by default.

---

## Option 1: Nginx + Certbot (Let's Encrypt) — DEFAULT

Best for: VPS with a public domain and port 80/443 accessible.

### Initial certificate issuance

```bash
# On the VPS, install Certbot
sudo apt install certbot

# Stop Nginx temporarily (or use the webroot challenge if Nginx is running)
docker-compose -f docker-compose.prod.yml stop nginx

# Issue certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com \
  --email admin@yourdomain.com --agree-tos --no-eff-email

# Restart Nginx
docker-compose -f docker-compose.prod.yml start nginx
```

### Using the webroot challenge (Nginx stays running)

The Nginx config serves `/.well-known/acme-challenge/` from `/var/www/certbot` even over HTTP before redirecting. Certbot can use this:

```bash
sudo certbot certonly --webroot -w /path/to/deploy/certbot/www \
  -d yourdomain.com -d www.yourdomain.com
```

### Enable HTTPS in Nginx

After the certificate is issued, uncomment the HTTPS server block in `deploy/nginx/default.conf` and replace `yourdomain.com` with your domain.

### Auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Cron job (runs twice daily — standard Certbot recommendation)
echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'docker exec hermes-nginx nginx -s reload'" \
  | sudo tee /etc/cron.d/certbot-renew
```

Certificate paths (mounted read-only into the Nginx container):
- Certificate: `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- Private key: `/etc/letsencrypt/live/yourdomain.com/privkey.pem`
- Chain: `/etc/letsencrypt/live/yourdomain.com/chain.pem`

---

## Option 2: Cloudflare SSL Proxy

Best for: Domains using Cloudflare DNS. No certificate management needed on the server.

1. Set your domain's DNS to Cloudflare.
2. In Cloudflare dashboard → SSL/TLS → set mode to **Full (strict)**.
3. In `deploy/nginx/default.conf`, remove the HTTP→HTTPS redirect and the SSL cert blocks.
4. Nginx listens on port 80 only; Cloudflare handles TLS termination externally.
5. Optionally add a Cloudflare Origin Certificate for server-side validation.

No changes to `docker-compose.prod.yml` are needed — remove the letsencrypt volume mounts from the nginx service.

---

## Option 3: External Reverse Proxy (Traefik, Caddy, etc.)

Best for: Setups with an existing infrastructure-level proxy.

1. Remove the `nginx` service from `docker-compose.prod.yml`.
2. Expose `hermes-web` on an internal port (e.g., `127.0.0.1:3000:3000`).
3. Point your external proxy to `http://localhost:3000`.
4. Handle SSL termination in the external proxy.

For **Caddy**: Add a `Caddyfile` with `yourdomain.com { reverse_proxy localhost:3000 }` — Caddy auto-provisions Let's Encrypt certificates.

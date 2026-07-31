# Multilingual SEO & AI Discovery — Post-Deployment Checklist (PHASE 87L.6)

## Completed in code (this phase)

- robots.txt: search/retrieval crawlers (Googlebot, Bingbot, OAI-SearchBot,
  Claude-SearchBot, Claude-User, PerplexityBot, Applebot, DuckDuckBot,
  YandexBot) allowed on public locale roots; private/auth/API always
  disallowed; training crawlers (GPTBot, ClaudeBot, Google-Extended,
  Applebot-Extended) restricted to the owner-approved open-knowledge surfaces
  (library/services/academy).
- Sitemap, hreflang and locale routing all derive from `ACTIVE_LOCALES`
  (src/i18n/locales.ts) — activating German is a one-line flip once the
  catalog gate passes.
- IndexNow: inbound-authenticated trigger route (`/api/seo/indexnow`,
  `INDEXNOW_TRIGGER_SECRET`), outbound key (`INDEXNOW_KEY`), same-host URL
  allowlist, and the key verification file at `/indexnow-key.txt`.
- llms.txt at `/llms.txt` (supplemental; not a robots/sitemap replacement).
- German catalog: publicSite + authExperience genuinely translated;
  terminology in docs/i18n/german-glossary.md.

## Requires production environment variables (owner/DevOps)

- `INDEXNOW_KEY` — the outbound IndexNow key (also served at
  /indexnow-key.txt). Generate once; never commit.
- `INDEXNOW_TRIGGER_SECRET` — inbound auth for the trigger route (fail-closed
  503 when unset).
- `NEXT_PUBLIC_BASE_URL` — canonical host, **build-time only** (`NEXT_PUBLIC_*`
  are inlined by webpack at build, not read at runtime). The Docker build now
  defaults it to `https://www.hermesnovin.com` via a build arg in `Dockerfile`
  and `docker-compose.prod.yml`, so setting it here is only needed to OVERRIDE
  for a non-production host.
- Bing/Google verification tokens via their meta-tag env vars if DNS
  verification is not used (never commit real tokens).

## Requires the owner in an external portal

### Bing Webmaster Tools
1. Add and verify the property for the canonical host (DNS or meta tag).
2. Submit `https://www.hermesnovin.com/sitemap.xml`.
3. Confirm IndexNow key is recognised (submit one URL; check the IndexNow
   panel).
4. URL-inspect the homepage in fa and en (de after activation).
5. Review Site Explorer and Site Scan; triage crawl errors.
6. Robots tester: confirm public allow + /api/ and /dashboard/ disallow.

### Google Search Console
1. Add and verify the property (DNS preferred).
2. Submit the sitemap; monitor Page Indexing for the three locales.
3. URL-inspect representative pages; confirm canonical + hreflang detection.
4. Review Core Web Vitals and Enhancements (structured data).
5. Google-Extended remains a TRAINING control — no Search Console action
   needed; policy lives in robots.txt.

### AI discovery
1. After deploy, fetch `https://www.hermesnovin.com/robots.txt` and confirm
   the OAI-SearchBot / Claude-SearchBot / PerplexityBot groups are served.
2. Check Cloudflare/WAF bot rules: verified search crawlers must not receive
   challenges/CAPTCHA on public routes. Use the vendors' official IP/DNS
   verification lists — never allowlist by user-agent string alone.
3. Monitor server logs for 403/429/5xx to these user agents on public routes.
4. Referral analytics: chatgpt.com / perplexity.ai / claude.ai referrers are
   distinguishable in the existing analytics — no new tracker was added.

### Domain policy
- Primary canonical host: `www.hermesnovin.com` — baked by default at build
  time via the `NEXT_PUBLIC_BASE_URL` build arg in `Dockerfile` and
  `docker-compose.prod.yml` (default `https://www.hermesnovin.com`). The
  `src/lib/seo/config.ts` code fallback is the apex host and is reached only in
  non-Docker/dev builds; the production Docker build always inlines www unless
  explicitly overridden with `--build-arg NEXT_PUBLIC_BASE_URL=…`. (Phase 89
  found the build arg was missing, so production was inlining apex canonicals.)
- `www.hermesos.uk`: do NOT activate metadata for it until it is live; when
  live, choose either a 301 redirect to the primary host (recommended) or a
  distinct-content strategy — never duplicate canonicals across both hosts.

## German activation gate (owner decision)

Flip `ACTIVE_LOCALES` to `["fa","en","de"]` in src/i18n/locales.ts ONLY after:
1. Remaining public namespaces are genuinely German (platform, modules,
   services, architecture, library — ≈184 leaves).
2. A German-speaking reviewer signs off the glossary and the publicSite copy.
3. The 17 test pins asserting `["fa","en"]` are updated in the same change.
Routing, sitemap, hreflang, robots and the language switcher all extend
automatically from the registry — no further code is required.

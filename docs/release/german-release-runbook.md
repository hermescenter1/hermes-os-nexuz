# German Release Runbook (PHASE 87L.6H)

**PREPARED, NOT EXECUTED.** Every command below is written out so a human can
run it deliberately. Nothing in this phase was committed, pushed, merged,
tagged or deployed.

Service names, health checks and volume names are taken from the real
`docker-compose.prod.yml` in this repository — not assumed.

---

## 0. Preconditions — ALL must hold before step 1

| # | Gate | Current status |
|---|---|---|
| 1 | All automated gates green | ✅ (see the 87L.6H report) |
| 2 | Authenticated role matrix executed in a browser | ❌ **NOT EXECUTED** |
| 3 | Native German public review approved (area A) | ❌ **NOT REVIEWED** |
| 4 | Industrial safety review by a qualified engineer (area B) | ❌ **NOT REVIEWED** |
| 5 | Commercial review (area C) | ❌ **NOT REVIEWED** |
| 6 | Owner decision on org-level `view_api_keys` | ❌ **OPEN** |

> **Do not begin the merge while any row above is ❌.** Gates 2–6 are human
> gates; no automated result can satisfy them.

---

## 1. Final checkpoint commit (German branch)

```bash
cd /path/to/hermes-os-nexuz
git status --porcelain                 # expect: only intended files
git diff --check                       # expect: clean
git add -A
git commit -m "Phase 87L.6H — Consolidate German release evidence and review package"
```

## 2. Push the German branch

```bash
git push origin phase-87l6-german-localization
```

## 3. Compare against main

`origin/main` is **not** an ancestor of the German branch — they have diverged
(main carries the two Enamad hotfixes; the German branch carries a cherry-pick
of the footer seal). Inspect before merging:

```bash
git fetch origin
git log --oneline origin/main..phase-87l6-german-localization   # what we add
git log --oneline phase-87l6-german-localization..origin/main   # what main has that we lack
git diff --stat origin/main...phase-87l6-german-localization
```

Expect the Enamad footer seal to appear on **both** sides (commit `427640a` on
main, cherry-pick `1ea7ab3` on the German branch, identical file content). Git
should resolve this cleanly; if it reports a conflict in
`src/components/public-site/PublicFooter.tsx`, `src/middleware.ts` or
`src/components/public-site/__tests__/enamad-trust-seal.test.tsx`, take **either**
side — they are byte-identical — and re-run the Enamad tests.

## 4. Merge strategy

Merge commit (not squash, not rebase): the branch is a long audited chain of
phase commits and that history is the audit trail.

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff phase-87l6-german-localization \
  -m "Merge Phase 87L.6 — German localization, access hardening and release gate"
```

## 5. Test the merged candidate (before any deploy)

```bash
npm ci
npx prisma generate            # required after npm ci
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

All five must pass on the merged result, not just on the branch.

## 6. Back up production state

```bash
# on the VPS
./scripts/backup-postgres.sh
./scripts/verify-backup.sh
docker compose -f docker-compose.prod.yml ps          # record current state
docker compose -f docker-compose.prod.yml images      # record current image IDs
git -C /srv/hermes rev-parse HEAD                     # record rollback commit
```

Record the current `hermes-web` image ID and the current commit SHA — both are
needed for step 16.

## 7. Fast-forward the deployment checkout

```bash
cd /srv/hermes
git pull --ff-only origin main
```

If this is not a fast-forward, stop and investigate. Do not force.

## 8. Validate Docker configuration

```bash
docker compose -f docker-compose.prod.yml config    # parse + interpolate check
```

## 9. Build only the web service

```bash
docker compose -f docker-compose.prod.yml build hermes-web
```

Postgres, Redis, Nginx and uptime-kuma are untouched.

## 10. Recreate only the web service

```bash
docker compose -f docker-compose.prod.yml up -d --no-deps hermes-web
```

`--no-deps` keeps the database and cache running.

## 11. Wait for healthy

The real health check is
`wget -qO- http://127.0.0.1:3000/api/health`.

```bash
for i in $(seq 1 30); do
  s=$(docker inspect --format '{{.State.Health.Status}}' hermes-web 2>/dev/null)
  echo "$i: $s"; [ "$s" = "healthy" ] && break; sleep 5
done
docker compose -f docker-compose.prod.yml logs --tail=80 hermes-web
```

**Do not proceed until the status is `healthy`.**

## 12. Restart Nginx — only after healthy

```bash
docker compose -f docker-compose.prod.yml restart nginx
docker inspect --format '{{.State.Health.Status}}' hermes-nginx
```

## 13. Public smoke tests — FA / EN / DE

```bash
for L in fa en de; do
  echo "== /$L =="
  curl -s -o /dev/null -w "  status %{http_code}\n" https://www.hermesnovin.com/$L
  curl -s https://www.hermesnovin.com/$L | grep -o '<html[^>]*lang="[^"]*"[^>]*dir="[^"]*"' | head -1
done
curl -s https://www.hermesnovin.com/de/library/vfd | grep -o '<h1[^>]*>[^<]*' | head -1
curl -s https://www.hermesnovin.com/sitemap.xml | grep -c "<loc>"
curl -s https://www.hermesnovin.com/robots.txt | grep -c "Disallow: /de/dashboard/"
```

Expect: `/fa` rtl, `/en` ltr, `/de` ltr, a German H1 on the article, `/de` URLs
present in the sitemap, and the private prefixes disallowed.

## 14. Authenticated role smoke tests

Sign in as each role in a real browser and confirm against the accepted
contract. **This is the same matrix as
[`german-release-gate.md`](./german-release-gate.md) §4** — do not substitute
`curl` for it, because navigation visibility and hydration cannot be checked
that way.

| Role | Must reach | Must be denied |
|---|---|---|
| Engineer | Dashboard, Brain, Copilot, Predictive, Assets, CMMS, Automation, Documents | CRM, ERP, Billing, Organization, API Platform, Admin |
| Admin | all of the above | — (existing contract) |
| Superadmin | all of the above | — (existing contract) |

## 15. Enamad verification

```bash
# exactly one verification tag per public locale
for L in fa en de; do
  echo -n "/$L meta: "
  curl -s https://www.hermesnovin.com/$L | grep -c '<meta name="enamad" content="43315120"'
done
# exactly one footer trust seal, exact official host
curl -s https://www.hermesnovin.com/fa | grep -c 'trustseal.enamad.ir/?id=760552'
curl -s https://www.hermesnovin.com/fa | grep -o 'rel="noopener external"' | head -1
```

Then **in a browser** (the server never fetches this image — the client does):
confirm the seal renders, is not a broken image, has a visible focus ring, and
that clicking it opens the official eNAMAD verification page. Record this
separately from the source-level validation.

## 16. Rollback

Two independent routes — prefer the image rollback (faster, no rebuild):

```bash
# A) roll back to the previously recorded image
docker compose -f docker-compose.prod.yml up -d --no-deps <PREVIOUS_HERMES_WEB_IMAGE_ID>

# B) roll back the code and rebuild
cd /srv/hermes
git reset --hard <PREVIOUS_COMMIT_SHA_FROM_STEP_6>
docker compose -f docker-compose.prod.yml build hermes-web
docker compose -f docker-compose.prod.yml up -d --no-deps hermes-web
```

Then repeat steps 11–13.

---

## Hard restrictions

- ❌ **Never** `docker compose down -v` — destroys `postgres_data`, `redis_data`, `uploads_data`, `uptime_kuma_data`
- ❌ Never delete or prune volumes
- ❌ Never reboot the host as part of a deploy
- ❌ Never force-push
- ❌ Never merge with an unresolved human-review blocker (§0 gates 2–6)
- ❌ Never deploy while the authenticated matrix is incomplete
- ❌ Never change ports, TLS, DNS or firewall rules as part of this release

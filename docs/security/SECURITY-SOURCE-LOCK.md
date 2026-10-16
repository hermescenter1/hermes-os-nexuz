# Hermes OS — Security Source Lock (Phase S0)

**Program:** Hermes Security Dragon
**Phase:** S0 — Source Lock (re-executed from zero)
**Produced:** 2026-10-10
**Scope of this file:** it states *what was examined*. It asserts no security property whatsoever.

---

## 1. Why this file exists

Every later claim in this program ("control X is implemented", "attack Y is defended") is only meaningful against a
named source state. This file is that name. If the state below does not match the tree being reviewed, no finding,
scan result, or gate verdict in this program applies.

This is a **full re-execution**, not a revision. An earlier S0 attempt was carried out against a working tree that
turned out to be a stale local copy of already-shipped work; every number in this document was re-derived from the
commit named below, and nothing was carried over from that attempt.

---

## 2. The lock

| Field | Value |
|---|---|
| Repository | `hermes-os-nexuz` |
| Remote (origin) | `https://github.com/hermescenter1/hermes-os-nexuz.git` |
| Worktree examined | `E:\hermes-security-dragon` (dedicated, created for this program) |
| Branch | `feature/hermes-security-dragon` |
| **`HEAD`** | **`bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2`** |
| Relationship to `origin/main` | **identical** — `HEAD == origin/main` at fetch time |
| Worktree state | **CLEAN** — `git status --porcelain --untracked-files=all` returns 0 lines |
| Merge / rebase in progress | none |

Reproduce:

```
git fetch origin main
git rev-parse origin/main                 # bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2
git -C E:/hermes-security-dragon rev-parse HEAD
git -C E:/hermes-security-dragon status --porcelain --untracked-files=all | wc -l   # 0
git -C E:/hermes-security-dragon merge-base --is-ancestor origin/main HEAD          # true
```

### 2.1 This is a real lock, and the previous attempt was not

The first S0 attempt examined `153b8617` plus 89 uncommitted paths. Those paths were a stale copy of HRIS-0.5, a
feature that had **already** been committed to `main` as `357c5a3c` on 2026-10-07 and deployed. The practical
consequences recorded here so no later reader repeats them:

- `main` already contained the identical `prisma/migrations/20261004120000_hris05_erp_tenant_isolation/migration.sql`
  (same blob), the identical `src/lib/org/rbac.ts`, and the identical `hris05-erp-tenant-rehearsal.yml`
  (blob `c7e6caec`);
- of 95 files in that change set, **63 were byte-identical to `main`**, 31 were older, and 1 was a deletion both
  sides had already made;
- `main` carried three files the stale copy lacked, so merging it would have been a **regression**.

The diagnostic that exposed it: `git merge --no-commit --no-ff origin/main` produced seven **`add/add`** conflicts
on files believed to be new. *`add/add` on a file you think you just created means the other side already has it.*

No part of that attempt is a baseline for this one.

---

## 3. Runtime and toolchain actually present

| Component | Version | Source |
|---|---|---|
| Node.js (local) | `v24.18.0` | `node -v` |
| npm (local) | `11.16.0` | `npm -v` |
| Node.js (container) | `node:20-alpine` — tag-pinned, **not digest-pinned** | `Dockerfile` |
| Package manager | npm + `package-lock.json`; no `packageManager`, no `engines` field | `package.json` |
| Next.js | `15.5.25` (exact) | `package.json` |
| React / React DOM | `19.0.7` (exact) | `package.json` |
| next-intl | `4.13.2` (exact) | `package.json` |
| Prisma / client / `@prisma/adapter-pg` | `^7.8.0` | `package.json` |
| PostgreSQL | `pgvector/pgvector:pg16` | `docker-compose.prod.yml` |
| Redis | `redis:7-alpine` | `docker-compose.prod.yml` |
| Nginx | `nginx:alpine` — **floating tag** | `docker-compose.prod.yml` |
| Zod | `^4.4.3` | `package.json` |
| TanStack Query | `^5.101.0` | `package.json` |
| Auth crypto | `argon2 ^0.44.0` **and** `bcryptjs ^3.0.3` (both present), `jose ^6.2.3` | `package.json` |
| Redis client | `ioredis ^5.11.1` | `package.json` |
| Payments | `stripe ^22.2.3` | `package.json` |
| Mail | `nodemailer ^10.0.13`, `resend ^6.14.0` | `package.json` |
| External AI | `openai ^6.43.0` | `package.json` |
| **Industrial protocol clients** | **NONE** | §5 |

### 3.1 Validation scripts that actually exist

`lint` = `next lint`; `test` = `vitest run`; plus 8 PostgreSQL rehearsal configs and ~40 phase gates.

> **There is no `typecheck` script.** `CLAUDE.md` names `npm run typecheck`; it does not exist. Type checking
> happens only inside `npm run build`.

---

## 4. Scale of the examined surface

| Measure | Value | Command |
|---|---|---|
| API route files | **410** | `git ls-files -- src/app/api \| grep -c route.ts$` |
| API route files (per the generated inventory) | 412 | `phase99-route-security-inventory.json` |
| HTTP handlers (route × method) | **572** | same |
| Page files (`page.tsx`) | **288** | `git ls-files -- src/app \| grep -c page.tsx$` |
| **Server actions (`"use server"`)** | **0** | `git grep -l '"use server"' -- src` |
| Prisma models | **275** | `grep -c '^model ' prisma/schema.prisma` |
| Prisma enums | **118** | `grep -c '^enum '` |
| Prisma schema lines | 8 687 | `wc -l` |
| Migration directories | **82** | `ls -1d prisma/migrations/*/` |
| Test files | **644** | `git ls-files \| grep -cE 'test.(ts\|tsx\|mts\|mjs)$'` |
| `organizationId` occurrences in schema | **580** | `grep -c organizationId` |
| `siteId` occurrences in schema | **54** | `grep -c siteId` |
| GitHub Actions workflows | 13 | `ls .github/workflows` |

The **580 : 54** ratio is recorded as a structural observation: site-level scoping is an order of magnitude thinner
in the data model than organization-level scoping. Whether that is correct by design is an S1/S4 question.

### 4.1 The generated route-security inventory, on this commit

`npm run security:phase99:inventory:check` → `committed inventory matches the source tree` (exit 0). Because the
worktree is clean and `HEAD == origin/main`, that result is attributable to `bcf3be9a` — which is exactly what the
previous attempt could not say.

| Classification | Handlers |
|---|---|
| `PUBLIC_READ` | 36 |
| `PUBLIC_WRITE` | 14 |
| `AUTHENTICATED_USER` | 188 |
| `TENANT_MEMBER` | 195 |
| `TENANT_ADMIN` | **0** |
| `OWNER_ONLY` | **0** |
| `PLATFORM_ADMIN` | 135 |
| `WEBHOOK` | 2 |
| `INTERNAL_HEALTH` | 2 |
| `UNKNOWN` | 0 |
| `stateChangingGetHandlers` | 0 |
| `unauthenticatedWebhooks` | 0 |

`tenantCoverage` reports `TENANT_IDENTITY_COVERAGE_PERCENT: 100` and `OBJECT_SCOPE_COVERAGE_PERCENT: 100` over 330
tenant-bound handlers, with `CLIENT_SUPPLIED_IDENTITY_HANDLERS: 0`.

> **THOSE 100 % FIGURES ARE NOT PROOF OF ISOLATION.** The generator
> (`scripts/security/phase99/route-inventory.mjs`) is a **lexical, single-file** classifier: it reads each route
> file's own text. It cannot follow a call into a shared data layer, cannot see a predicate built two modules away,
> and cannot distinguish a guard that is imported from one that is imported *and reached on every branch*.
>
> The repository contradicts the figure itself. `src/lib/tenant/contract.ts:8` states, as established fact, that
> **"six module data layers query Prisma with no `organizationId` predicate"** even though every root model declares
> the column. Both statements are true at once precisely because the classifier never looks inside the data layer.
>
> Treat the inventory as an **index of the surface** and a regression guard on route-local evidence. Never cite it
> as a tenant-isolation proof.

`TENANT_ADMIN: 0` and `OWNER_ONLY: 0` are also notable: both classifications exist in the schema's
`classificationSet` and no handler is assigned to either. S1 must establish whether that is correct or a classifier
limitation.

---

## 5. Evidence that no cloud-to-PLC code path exists

```
node -e "const p=require('./package.json');const a={...p.dependencies,...p.devDependencies};
console.log(Object.keys(a).filter(k=>/opcua|mqtt|modbus|s7|snap7|bacnet|profinet|ethernet-ip/i.test(k)).join(',')||'(NONE)')"
# (NONE)
```

No library in the dependency tree can speak OPC UA, MQTT, Modbus, S7, BACnet, PROFINET or EtherNet/IP. Those names
appear under `src/` only as domain vocabulary — connector *type* labels, enum values, knowledge-base text, UI
strings. **Hermes OS cannot currently open a connection to a PLC, HMI, historian or OT network from its own
process.** Industrial data enters only through the HTTP gateway-envelope surface (see
`DATA-FLOW-AND-TRUST-BOUNDARIES.md`, TB-10).

This is an absence-of-capability observation verified by the absence of a dependency. It is **not** a claim that a
future connector would be safe, and it stops being true the moment such a package is added.

---

## 6. Findings carried into this lock, each re-proven on `bcf3be9a`

Nothing here was inherited. Each row was re-measured on this commit; the command is given so a third party can
repeat it.

| ID | Finding | Status on `bcf3be9a` | Re-proof |
|---|---|---|---|
| **DB-F1** | Silent database→session fallback in the six core repositories plus one document path. **68** `return fallback.` points (case 12, knowledge 14, memory 14, project 10, unknown 10, analysis 8), of which **34 sit inside bare `catch {}`**, so any transient Prisma exception reroutes to in-process memory — not only a null client. Writes (`create`/`update`/`delete`) are included. **Zero logging** inside those catch blocks. | **CONFIRMED** | `for f in case knowledge memory project unknown analysis; do grep -c "return fallback\." src/lib/storage/$f-repository.ts; done` → 12 14 14 10 10 8; `grep -c "catch {"` → 7 7 7 5 5 3; logging grep → 0 |
| **DB-F2** | Industrial and twin read paths answer a database outage with an empty success. 12 `if (!db) return []` points across `industrial/{alerts×2,assets,sites,gateways,connectors,telemetry}`, `digital-twin/{graph,nodes}`, `predictive/maintenance`, `time-series/alarms`, `multi-site/kpis`. An operator sees "zero alarms" when the truth is "no connection". | **CONFIRMED** | per-file `grep -cE "if \(!db\) return \[\]"` |
| **U-1** | The avatar upload route performs **no magic-byte validation** — `grep -c sniffImageMime` = **0** — while the article-cover route does (`cover/route.ts:84`). The asymmetry is in the source, and `src/lib/articles/media.ts` names it as "the one deliberate hardening over the avatar route". | **CONFIRMED** | `grep -c sniffImageMime src/app/api/articles/author-profile/avatar/route.ts` → 0 |
| **U-2** | The avatar route enforces its 2 MB ceiling **after** buffering: `await file.arrayBuffer()` on line 57, `byteLength > MAX_BYTES` on line 58. The cover route checks `file.size` first (line 65) and re-checks the real length after (line 73). nginx allows 50 MB. | **CONFIRMED** | `grep -nE "arrayBuffer|byteLength" .../avatar/route.ts` |
| **U-3** | The avatar POST gate is `getCurrentUser()` alone — no role, no permission. | **CONFIRMED as described; severity is a POLICY QUESTION**, not a vulnerability, absent a requirement restricting upload to a role. | `sed -n '28,34p' .../avatar/route.ts` |
| **HSTS** | `deploy/nginx/default.conf` contains **0** `add_header` directives and no `Strict-Transport-Security`; `deploy/nginx/mail.conf` likewise. A read-only `HEAD https://hermesnovin.com/fa` returning **HTTP 200** carried `x-content-type-options`, `x-frame-options` and a nonce CSP but **no `strict-transport-security`**. `next.config.ts` states HSTS is "set exclusively by Nginx". | **CONFIRMED — the control is documented in one place and implemented in none** | `grep -c add_header deploy/nginx/default.conf` → 0; `curl -sS -I https://hermesnovin.com/fa` |
| **Edge identity** | `src/lib/security/request-guards.ts:19` still asserts "This deployment is nginx (Let's Encrypt, **no Cloudflare**)" and keys rate limits on `X-Real-IP` only. Production returns `Server: cloudflare`, `CF-RAY`, `cf-cache-status`. nginx sets `X-Real-IP $remote_addr`, so the app sees a **Cloudflare PoP address** and every visitor behind one PoP shares a single rate-limit bucket. | **CONFIRMED** | source line + the same read-only `HEAD` |
| **Legacy no-`sid` token** | `SESSION_COOKIE = "hermes_session"` (HMAC, Phase 12A) is still defined beside `hermes_at`/`hermes_rt`, and `session-store.ts:17` documents that tokens **without** a `sid` "never reach here; the caller's legacy path handles them". Such a token is therefore not checked against the server-authoritative revocation record. | **CONFIRMED present in source.** Whether that mint path is still *reachable* is **not** established. | `grep -n SESSION_COOKIE src/lib/auth/config.ts`; `grep -n "legacy path" src/lib/auth/session-store.ts` |
| **`requireActor`** | `CLAUDE.md` names a guard called `requireActor`. It has **0 definitions and 0 uses**. The real resolvers are `requireOrgActor` (78 route files), `requireSiteActor` (9), `requireSitePermission` (9), `requirePermission` (120), `getCurrentUser` (137). | **CONFIRMED — documentation drift** | per-name `git grep -l … -- 'src/app/api/**/route.ts' \| wc -l` |
| **Audit tamper-evidence** | The `AuditLog` model contains **no** `previousHash`, hash chain or signature field. | **CONFIRMED absent** | `awk '/^model AuditLog /,/^}/' prisma/schema.prisma \| grep -ciE "previousHash\|hashChain\|signature"` → 0 |
| **CI security tooling** | semgrep, codeql, trivy, gitleaks, syft, sbom, zap, checkov, hadolint, osv-scanner, cosign — **all 0 occurrences** across all 13 workflows. The only dependency control is `gate:dependency-audit`. | **CONFIRMED absent** | per-tool `git grep -il … -- '.github/workflows/*.yml' \| wc -l` |
| **Container hardening** | `docker-compose.prod.yml` has **0** of `read_only`, `cap_drop`, `security_opt`, `no-new-privileges`, `tmpfs`, `mem_limit`, and `hermes_internal` is **not** `internal: true`. The Dockerfile *is* fully non-root (6 `USER` directives). The **development** `docker-compose.yml` still publishes `5432:5432` and `6379:6379`. | **CONFIRMED** | per-key `grep -c` |

Severity is deliberately **not** assigned here. S1 owns the risk register.

---

## 7. Open S0 items — these still block Gate A

| ID | Item | Why it blocks | Needed to resolve |
|---|---|---|---|
| **S0-B-01** | The **50** `PUBLIC_READ`/`PUBLIC_WRITE` handlers have not been verified one by one on this commit. Grouped: articles 6, auth 6, customers 6, eng-graph 5, operations 5, careers 3, compliance 3, media 3, vendors 3, copilot 2, academy/billing/candidate/industrial-brain/sales/seo 1 each, plus `/indexnow-key.txt` and `/llms.txt`. Three mutate: `POST /api/auth/access-request`, `POST /api/candidate/register`, `POST /api/sales/leads`. | Whether any public handler reaches tenant data is precisely the S4 question; an unverified public surface cannot be signed off. | S1 enumerates all 50 with per-handler evidence. |
| **S0-B-02** | Whether the legacy no-`sid` mint path is reachable in production. | A reachable path means a token that cannot be revoked. | S3, by tracing every issuer. |
| **S0-B-03** | Whether the production origin (`185.80.196.163`, named in `server_name`) is firewalled to Cloudflare ranges. Not determinable from the repository; `set_real_ip_from` appears nowhere. | If the origin is directly reachable, the edge's protections can be skipped entirely. | Owner confirmation of the host firewall. |
| **S0-B-04** | `TENANT_ADMIN: 0` and `OWNER_ONLY: 0` in the inventory — correct, or a classifier limitation? | If a limitation, the inventory under-reports privilege concentration. | S1, by reading the classifier against a known owner-only route. |
| **S0-B-05** | The 110 `NULL_OR_UNDEF` and 105 UNCLASSIFIED `getPrisma()` call sites found in the earlier pass were **deliberately deferred** and have **not** been re-measured on this commit. | Their failure semantics are unknown, so the DB-failure picture is incomplete. | A versioned, deterministic classifier (see §8), then manual adjudication. |

Resolved since the first attempt: the dirty-source blocker (the lock is now clean and attributable) and the
production storage-mode question (`HERMES_STORAGE_MODE=database`, service `hermes-web`, config
`/opt/hermes-os-nexuz/docker-compose.prod.yml`, supplied by the owner from read-only commands).

---

## 8. What Phase S0 did NOT do

- No scanner was run — no SAST, SCA, secret scan, container scan, DAST or SBOM. S2 owns that.
- `npm run test`, `npm run lint` and `npm run build` were **not** run in this worktree. Not executed ⇒ not reported
  as passing.
- No offensive test of any kind.
- Production was touched **read-only, once**: `HEAD https://hermesnovin.com/fa`, no payload, no authentication, no
  parameters. Used only for the HSTS and edge-identity rows in §6.
- No database connection, no migration, no fault injection, no container restart, no deploy.
- No environment file was read; no secret, token or connection string was read, printed or recorded.
- The `getPrisma()` classification used in the earlier pass was a throwaway 7-line-window heuristic. It is **not**
  part of this lock. Before S1 relies on it, it must become a **versioned, deterministic tool** committed to the
  repository, and its 215 deferred sites adjudicated.

---

## 9. Reproducible command manifest

```
git fetch origin main && git rev-parse origin/main
git rev-parse HEAD && git status --porcelain --untracked-files=all | wc -l
node -v; npm -v
git ls-files -- src/app/api | grep -c 'route.ts$'
git ls-files -- src/app     | grep -c 'page.tsx$'
git grep -l '"use server"' -- 'src/**/*.ts' 'src/**/*.tsx'
grep -c '^model ' prisma/schema.prisma; grep -c '^enum ' prisma/schema.prisma
ls -1d prisma/migrations/*/ | wc -l
npm run security:phase99:inventory:check
grep -n matcher src/middleware.ts
grep -c add_header deploy/nginx/default.conf
curl -sS -I https://hermesnovin.com/fa      # read-only, no payload
```

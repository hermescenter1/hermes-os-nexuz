# Hermes OS — Data Flow and Trust Boundaries (Phase S0)

**Program:** Hermes Security Dragon
**Phase:** S0 — Source Lock (re-executed from zero)
**Source state:** `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` — clean worktree, `HEAD == origin/main`
**Produced:** 2026-10-10

Each boundary is described from what exists in this commit. Where the Dragon target architecture asks for a control
that is not present, the row says so plainly. Nothing here is a pass/fail verdict.

---

## 1. The real topology

```
                          ┌──────────────────────────────────────┐
                          │  TB-0  Internet / untrusted clients  │
                          └──────────────────┬───────────────────┘
                                             │ HTTPS
                          ┌──────────────────▼───────────────────┐
                          │  TB-1  Cloudflare edge               │  OBSERVED in production
                          │        Server: cloudflare, CF-RAY    │  NOT modelled in the source
                          └──────────────────┬───────────────────┘
                                             │ HTTPS · origin 185.80.196.163
                          ┌──────────────────▼───────────────────┐
                          │  TB-2  nginx:alpine  (80/443)        │
                          │        TLS 1.2/1.3 · 50M body cap    │
                          │        0 add_header · 0 limit_req    │
                          │        0 set_real_ip_from            │
                          └──────────────────┬───────────────────┘
                                             │ plain HTTP · docker bridge hermes_internal
                 ┌───────────────────────────▼────────────────────────────┐
                 │  TB-3  hermes-web  (Next.js standalone, uid 1001)      │
                 │                                                        │
                 │   PAGE requests ──► middleware                         │
                 │        · isProtectedPath → JWT role → path authz        │
                 │        · next-intl locale                              │
                 │        · per-request CSP nonce                         │
                 │                                                        │
                 │   /api/* AND any dotted path ──► NO MIDDLEWARE  ◄─ TB-4 │
                 │        572 handlers, each its own gate                 │
                 └───┬──────────────┬───────────────┬─────────────────┬────┘
                     │              │               │                 │
         ┌───────────▼──┐   ┌───────▼──────┐  ┌─────▼──────┐  ┌───────▼────────┐
         │ TB-5         │   │ TB-6         │  │ TB-7       │  │ TB-8           │
         │ PostgreSQL   │   │ Redis        │  │ Local disk │  │ Third parties  │
         │ pgvector:16  │   │ 7-alpine     │  │ uploads_   │  │ Stripe/OpenAI  │
         │ no pub port  │   │ no pub port  │  │ data (IN   │  │ SMTP/Resend    │
         │ no sslmode   │   │ requirepass  │  │ public/!)  │  │ GA/Clarity     │
         │ no RLS       │   │ NO keyPrefix │  │ documents_ │  │ ProvenExpert   │
         │              │   │              │  │ data       │  │ eNAMAD/SaaSHub │
         └──────┬───────┘   └──────────────┘  └────────────┘  └────────────────┘
                │ ▲
     TB-5b ◄────┘ │  authenticated HTTP only — workers hold NO DB credential
  silent fallback │
                  │
         ┌────────┴────────────────────────────────────────────┐
         │ TB-9  Workers (uid 1001, one .mjs each, no ORM)     │
         │   document-cleanup · ats-review · metering-outbox   │
         └─────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────────────────┐
         │ TB-10  Gateway envelope ingress                     │
         │   POST /api/ot/gateways/[id]/envelopes              │
         │   HMAC-SHA256 + nonce + timestamp + idempotencyKey  │
         │   NO mTLS · NO certificate lifecycle                │
         └─────────────────────────────────────────────────────┘
                                   ▲  outbound-initiated by the gateway
         ┌─────────────────────────┴───────────────────────────┐
         │ TB-11  Industrial DMZ / Hermes Gateway (OUT OF REPO)│
         └─────────────────────────┬───────────────────────────┘
                                   │
         ┌─────────────────────────▼───────────────────────────┐
         │ TB-12  Historian / OPC-UA source / OT network       │
         │        NO CODE PATH FROM HERMES REACHES HERE        │
         │        (zero opcua/mqtt/modbus/s7 client packages)  │
         └─────────────────────────────────────────────────────┘
```

---

## 2. Boundary register

Each boundary answers the seven required questions: what data crosses, what identity is used, who is allowed, how
it is encrypted, how replay is stopped, where it is audited, and what the failure mode is.

### TB-1 — Internet → Cloudflare

| Question | Answer |
|---|---|
| Data crossing | all public HTTP traffic |
| Identity | none |
| Who is allowed | everyone |
| Encryption | TLS terminated at Cloudflare |
| Replay prevention | none at this layer |
| Audit | Cloudflare-side only; **not** in Hermes' audit trail |
| Failure mode | unknown to the repository |
| **Status** | **NOT MODELLED IN SOURCE.** `src/lib/security/request-guards.ts:19` asserts "no Cloudflare"; production says otherwise. |

### TB-2 — Cloudflare → nginx

| Question | Answer |
|---|---|
| Data crossing | all HTTP traffic for `hermesnovin.com`, `www.hermesnovin.com`, `185.80.196.163` |
| Identity | none; nginx trusts its peer implicitly |
| Who is allowed | anyone who can reach the origin — **no `set_real_ip_from`, no Cloudflare IP restriction in the repository** |
| Encryption | TLS 1.2 + 1.3, Let's Encrypt |
| Replay prevention | none |
| Audit | nginx access log, `off` for `/api/health` |
| Failure mode | 80 → 308 to HTTPS; `www` → 308 to apex |
| Headers injected | `X-Real-IP $remote_addr`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto https`, `X-Forwarded-Host`, `Host` |
| Absent | `Strict-Transport-Security`, `server_tokens off`, `limit_req`, `limit_conn`, any `add_header` |

Two mechanical consequences, recorded rather than rated:

1. `resolveClientIp()` reads `X-Real-IP`, which nginx sets to `$remote_addr`. With Cloudflare as the peer that is a
   **Cloudflare PoP address**, so every visitor behind one PoP shares one rate-limit bucket. Spoofing is still
   prevented (nginx overwrites the header), so this is an over-aggregation and accuracy problem, not a bypass.
2. If the origin IP is reachable directly, a client can skip the edge entirely. Whether it is firewalled to
   Cloudflare ranges is **not determinable from the repository** — `SECURITY-SOURCE-LOCK.md` §7 S0-B-03.

### TB-3 — nginx → hermes-web

| Question | Answer |
|---|---|
| Data crossing | every request, plain HTTP, inside `hermes_internal` |
| Identity | none between proxy and app |
| Who is allowed | anything on the docker network |
| Encryption | **none** (plain HTTP on a bridge network) |
| Replay prevention | none at this hop |
| Audit | application logger + `AuditLog` |
| Failure mode | app down ⇒ nginx 502 |
| Note | `hermes_internal` is a plain `bridge`, not `internal: true`, so every container also has outbound egress |

### TB-4 — THE PRIMARY APPLICATION BOUNDARY

The single most important structural fact in the architecture:

```
matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
                 ^^^ api excluded      ^^^^^^^ any dotted path excluded
```

| | HTML page requests | `/api/*` and any dotted path |
|---|---|---|
| Middleware runs | **yes** | **no** |
| Auth gate | `isProtectedPath` → `getRoleFromRequest` (JWT verify, edge, no DB) → `isAuthorizedForPath` | **per-handler only** |
| DB session revocation checked | **no** (edge cannot reach `session-store.ts`) | only if the handler calls it |
| CSP applied | yes, nonce-based | **no** |
| Failure mode | 307/308 redirect to `/{locale}/auth/login?from=…` | whatever the handler returns |

**There is no central authorization choke point for the API.** 572 handlers are 572 independent enforcement
decisions. The repository's answer to that risk is the Phase 99 lexical inventory — which indexes the surface but,
being lexical and single-file, cannot prove any handler's enforcement is reached on every branch.

Identity resolution available to a handler (none of it automatic), counted on this commit:

| Helper | Route files |
|---|---|
| `getCurrentUser` | 137 |
| `requirePermission` | 120 |
| `requireOrgActor` | 78 |
| `requireAuthoring` | 19 |
| `requireSiteActor` / `requireSitePermission` | **9 / 9** |
| `requireWritableOwner` | 7 |
| `requireActor` | **does not exist** |

The ERP surface added by `357c5a3c` is the one place where the four-gate chain is applied uniformly across a whole
module (26 route files, every write origin-checked). It is the shape the rest of the API does not yet have.

### TB-5 — Application → PostgreSQL

| Question | Answer |
|---|---|
| Data crossing | all persistent state across 275 models |
| Identity | one `DATABASE_URL` connection string from the environment |
| Who is allowed | whoever holds the credential — **migration role and runtime role are not separated** |
| Encryption | not configured in the repository (no `sslmode` in either example file) |
| Replay prevention | n/a |
| Audit | `AuditLog`, plain append, nullable `organizationId` / `outcome` / `correlationId`, **no hash chain** |
| Failure mode | `getPrisma()` returns `null`, cached for the process lifetime, logged once via `logInfraFailure` — then see TB-5b |
| Tenant filtering | caller-side predicates. **No PostgreSQL Row-Level Security policy was found.** `src/lib/tenant/contract.ts:8` records that six module data layers query Prisma with no `organizationId` predicate. |

### TB-5b — THE SILENT DATABASE→SESSION FALLBACK (an internal boundary, easy to miss)

Production runs `HERMES_STORAGE_MODE=database`. That does **not** stop the fallback, because the six core
repositories decide per operation, not per environment:

```
if (!m) return fallback.<op>()            // null Prisma client
try { … } catch { return fallback.<op>() } // ANY Prisma exception
```

**68 fallback points across six files, 34 of them inside bare `catch {}`, writes included, zero logging.** Plus one
independent path in `src/lib/documents/storage-cleanup.ts`. Full table in `ARCHITECTURE-INVENTORY.md` §5.2.

| Question | Answer |
|---|---|
| Identity | unchanged — the same owner is passed through |
| Tenant isolation | **preserved** — the session store applies the same `ownerCanRead` predicate, and `ownerWhere(null)` is an impossible sentinel ("Null sees NOTHING") |
| RBAC | preserved — enforced upstream in the route layer |
| Audit | **lost** — `recordAuditEvent` is itself Prisma-backed, so a mutation accepted into memory leaves no audit row |
| Durability | **lost** — the store is `globalThis`; the write dies with the container and is invisible to any other replica |
| Identity of records | diverges — session-created rows get ids like `case-<timestamp>-<random>`, not cuids |
| Observability | **none** — the caller and the operator both see success |
| Failure mode | this **is** the failure mode of TB-5 |

**This is not a confidentiality leak and must not be reported as one.** It is an integrity, durability,
auditability and truthfulness defect. Affected surfaces: `/api/cases`, `/api/knowledge`, `/api/analysis`,
`/api/brain`, `/api/unknown`, `/api/industrial-brain/save-case`, `src/lib/memory/*`, and `eng-graph/builder.ts`
which feeds the public graph endpoints (published content only).

### TB-5c — The industrial empty-success boundary

Twelve read paths return `[]` with a success status when the database is unavailable
(`industrial/{alerts×2,assets,sites,gateways,connectors,telemetry}`, `digital-twin/{graph,nodes}`,
`predictive/maintenance`, `time-series/alarms`, `multi-site/kpis`).

| Question | Answer |
|---|---|
| Tenant isolation | **preserved** — fail-closed in the confidentiality sense: no database, no rows |
| Truthfulness | **lost** — an outage renders as "zero alarms / zero assets / zero telemetry" |
| Audit | none for a read |
| Failure mode | empty success |

For an authorization-scope function such as `getAllowedSiteIds` the same `[]` is correct and fail-closed. The
difference is whether `[]` means "you may see nothing" or "I could not ask".

### TB-6 — Application → Redis

| Question | Answer |
|---|---|
| Data crossing | rate-limit counters, metering, derived-graph bounds, voice grants, operator console state, caches |
| Identity | `REDIS_URL` + `REDIS_PASSWORD` (production compose sets `--requirepass`, default `changeme`) |
| Who is allowed | whoever holds the URL/password |
| Encryption | none (no TLS configured); in-network only |
| Replay prevention | n/a |
| Audit | none for cache operations |
| Failure mode | documented and tested — `phase93-redis-unavailable-failmode.test.ts`; the limiter has an in-process fallback |
| **Key namespacing** | **no global prefix** in `src/lib/redis/client.ts` (`grep -cE "keyPrefix\|prefix"` = 0). Keys are built entirely caller-side. Whether every tenant-scoped key embeds an `organizationId` is **unverified** — S4 obligation. |

### TB-7 — Application → local disk volumes

| Volume | Mount | Posture |
|---|---|---|
| `uploads_data` | `/app/public/uploads` | **inside `public/`** — served as a static asset with **no authorization check and no CSP** (dotted paths are excluded from middleware) |
| `documents_data` | `/app/.data/documents` | **outside `public/`** — reached only through `object-storage.ts`, `page-access.ts` and a signed-token route |

| Question | Answer |
|---|---|
| Identity | filesystem user `nextjs` (uid 1001) |
| Who is allowed | for `uploads_data`: **anyone holding the URL**, by construction. For `documents_data`: the authorization in `page-access.ts` |
| Encryption at rest | none configured; backup envelopes are encrypted (`hbk.mjs`) |
| Replay prevention | signed export tokens have a TTL (route exists; the value was not verified in S0) |
| Audit | `COMPLIANCE_AUDIT` actions exist |
| Failure mode | not established |

What can actually land under `public/uploads`: **only two writers exist in all of `src/`** — author avatars
(`avatar/route.ts:23`) and article covers (`media.ts:50`). Both store images intended for public publication.
Filenames are 128-bit CSPRNG hex and the uploader's filename is never used, so the URL is unguessable while the
capability is published deliberately on public author and article pages. **No writer exists for tenant-scoped,
site-scoped or industrial data.**

The two hardening gaps are asymmetries against the cover route, which does it correctly: the avatar route performs
**no magic-byte sniffing** (0 `sniffImageMime`) and enforces its 2 MB limit **after** `await file.arrayBuffer()`
while nginx permits 50 MB. Its gate is `getCurrentUser()` alone.

### TB-8 — Application → third parties

| Party | Direction | Gate |
|---|---|---|
| Stripe | inbound webhook + outbound API | classified `WEBHOOK`; inventory reports `unauthenticatedWebhooks: 0` — S5 must read and confirm |
| Automation webhooks | inbound | second `WEBHOOK` handler |
| OpenAI | outbound | **off by default**; one `isExternalAiEnabled()` gates routes, governance, UI and the CSP `connect-src` together |
| SMTP / Resend | outbound | `EMAIL_PROVIDER` |
| GA4 / GTM | browser-side | env-gated; absent vars ⇒ strict CSP |
| Microsoft Clarity | browser-side | consent-gated |
| eNAMAD / SaaSHub / ProvenExpert | browser-side | exact hosts, HTTPS, `img-src`-only where possible |

### TB-9 — Workers → application

| Question | Answer |
|---|---|
| Data crossing | one authenticated HTTP call each (`POST /api/documents/storage-cleanup`, `POST /api/ats/review/deliver`, the metering outbox delivery) |
| Identity | a worker token, e.g. `DOCUMENT_CLEANUP_WORKER_TOKEN` |
| Who is allowed | whoever holds the token |
| Encryption | plain HTTP inside `hermes_internal` |
| Replay prevention | the work itself is leased / idempotent at the web tier |
| Audit | the web tier's audit, because the worker has no other path |
| Failure mode | worker retries; it cannot corrupt state it cannot reach |
| **Blast radius** | **deliberately minimal, and a genuine strength.** Each worker image contains exactly one dependency-free `.mjs`: no `node_modules`, no Prisma, no application code, **no database credential**. A packaging test asserts the runner and migrator stages copy no scripts at all. |

### TB-10 — Gateway → Hermes (envelope ingress)

| Question | Answer |
|---|---|
| Data crossing | signed telemetry / finding envelopes |
| Identity | `gatewayId` + `signingKeyRef` + **HMAC-SHA-256 proof of possession** |
| Who is allowed | a gateway whose `signingKeyRef` resolves through the injected `SecretProvider` (default: `process.env`) |
| Encryption | HTTPS to the edge; the envelope itself is **signed, not encrypted** |
| Replay prevention | `timestamp` + `nonce` + `idempotencyKey`, all inside the signed field set; `timingSafeEqual`; canonical length-prefixed bytes in fixed order, never `JSON.stringify` of caller input |
| Audit | `INDUSTRIAL_AUDIT`; enrollment, rotate and revoke routes exist |
| Failure mode | unresolvable `signingKeyRef` ⇒ `null` ⇒ rejection |
| Key storage | **no Prisma model stores key material**; no secret or signature is logged or returned |
| **Absent vs. target** | **no mTLS, no per-device X.509 certificate, no certificate lifecycle, no expiry monitoring, no dual-key validation window.** Rotate and revoke *routes* exist; the certificate machinery does not. |

Per-tenant blast radius: `organizationId` is one of the signed fields, so a forged envelope cannot claim another
organization without a valid HMAC for it. Whether one gateway's secret can be used against another gateway's
`gatewayId` depends on `SecretProvider` key separation — **not verified in S0.**

### TB-11 — Industrial DMZ / Hermes Gateway

Out of repository. No gateway source code is in `hermes-os-nexuz`. Outbound-only initiation, offline buffering
bounds, signed/rollback-safe updates and per-site certificate separation are **asserted by design documents, not by
code here.** Gate H must not be scored on gateway properties this repository cannot show.

### TB-12 — Historian / OPC-UA / OT network

| Question | Answer |
|---|---|
| Data crossing | **nothing, from Hermes' side** |
| **Status** | **No code path exists.** Zero industrial-protocol client packages; no library in the tree can speak OPC UA, MQTT, Modbus, S7, BACnet, PROFINET or EtherNet/IP. The strings exist as domain vocabulary only. |
| Remote command / write | no command-dispatch surface found; no mechanism to write a tag or issue a process command |
| Safety | E-Stop, interlocks and safety PLCs are physically and logically outside this repository |

**The "cloud → PLC" attack path does not exist because the capability does not exist.** That stops being true the
moment a protocol client enters `package.json`, which is exactly why S10 must define the preconditions *before* any
such dependency is added.

---

## 3. Crown jewels mapped to the boundary that last protects them

Pre-work for S1.

| Asset | Location | Last protecting boundary | Known weakness carried to S1 |
|---|---|---|---|
| Tenant business data (ERP, CMMS, CRM, assets, cases) | PostgreSQL, 275 models, 580 `organizationId` references | TB-4 per-handler authz + TB-5 caller-side predicates | six data layers documented with no `organizationId` predicate; no RLS |
| Site-level data | 54 `siteId` references | TB-4, with only **9** route files using a site guard | site isolation structurally thin |
| Industrial telemetry / findings | PostgreSQL via TB-10 | HMAC envelope | no mTLS; cross-gateway key separation unverified |
| Industrial Brain / reasoning runs | PostgreSQL + Phase 112 ledger | TB-4 | reachable through TB-5b, so a run can land in memory |
| Engineering documents | `documents_data`, outside `public/` | `page-access.ts` + signed token | token TTL and re-authorization on download unverified |
| Uploaded media / avatars | `uploads_data`, **inside `public/`** | **none — static serving** | unauthenticated by construction; U-1/U-2 hardening gaps |
| Credentials / sessions | `RefreshToken` rows; `hermes_at`, `hermes_rt`, legacy `hermes_session` | `session-store.ts`, documented fail-closed | tokens without `sid` bypass it; **no account MFA exists** |
| Signing / backup keys | `process.env` via `SecretProvider`; `HERMES_BACKUP_KEY_FILE` | environment isolation | four aliases accepted for the JWT secret; no KMS in the production path |
| Gateway identity | `signingKeyRef` → env secret | HMAC + nonce + timestamp | no certificate lifecycle |
| Audit evidence | `AuditLog` | database access control only | **plain append table, no hash chain, nullable tenancy** |
| Deployment pipeline | GitHub Actions | `workflow_dispatch` + protected `production` + SHA-pinned actions | no SBOM, no artifact signing, no provenance |
| Backups | `BACKUP_DIR`, envelope-encrypted | `hbk.mjs` + `verify-backup.sh` | restore not executed in S0 |
| Source code / IP | this repository | GitHub access control | **no secret scanning of tree or history anywhere in CI** |

---

## 4. Failure-mode summary

| Boundary / control | Failure behaviour | Evidence |
|---|---|---|
| Session revocation (`session-store.ts`) | **fail CLOSED** — missing row, revoked, expired **or DB unreachable** ⇒ revoked | in-file contract, lines 13-14 |
| JWT secret missing in production | **fail CLOSED** — `jwtSecret()` throws | `src/lib/auth/config.ts` |
| Tenant context ambiguous | **fail CLOSED by type** — only `SINGLE_ACTIVE_ORGANIZATION` carries an id | `src/lib/tenant/contract.ts` |
| ERP data layer, DB unavailable | **fail CLOSED** — `ErpError(503, "SERVICE_UNAVAILABLE")`, stable code, no raw Prisma error | `src/lib/erp/db.ts`, `tenant.ts` |
| Redis unavailable | **degrades** to in-process rate limiting | `phase93-redis-unavailable-failmode.test.ts` |
| Prisma init failure | **degrades to session mode**, cached for the process, logged once | `src/lib/db/prisma.ts` |
| Six core repositories, DB unavailable **or any Prisma exception** | **SILENT fallback to in-process memory, reads and writes, no log** | TB-5b |
| Industrial read paths, DB unavailable | **empty success** | TB-5c |
| Token without `sid` | **bypasses the revocation check** (legacy path) | `session-store.ts:17` |
| HSTS | **absent** — no downgrade protection beyond the 308 and Cloudflare | verified on production `HEAD /fa` |
| API-layer middleware | **absent by design** — every handler is its own gate | `src/middleware.ts:168` |
| Rate-limit key behind Cloudflare | **over-aggregates** to one bucket per PoP | TB-2 |

---

## 5. What S1 must do with this document

1. Turn §3 into `RISK-REGISTER.md` with STRIDE and abuse cases per asset, reconciling the existing
   `phase99-findings.json` and `phase99-attack-surface-inventory.md` and **re-verifying each prior finding's
   status** rather than inheriting it.
2. Enumerate all **50** `PUBLIC_READ` / `PUBLIC_WRITE` handlers individually. None were verified one by one on this
   commit; three of them mutate (`POST /api/auth/access-request`, `POST /api/candidate/register`,
   `POST /api/sales/leads`).
3. Re-measure the `getPrisma()` failure semantics with a **versioned, deterministic classifier committed to the
   repository**, and adjudicate the 215 sites deferred in the earlier pass. The throwaway heuristic used before is
   not part of this lock.
4. Treat the Phase 99 lexical inventory as an **index of the surface**, never as isolation evidence.
5. Decide whether `TENANT_ADMIN: 0` and `OWNER_ONLY: 0` are correct or a classifier limitation.

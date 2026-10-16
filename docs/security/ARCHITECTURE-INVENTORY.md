# Hermes OS — Architecture Inventory (Phase S0)

**Program:** Hermes Security Dragon
**Phase:** S0 — Source Lock (re-executed from zero)
**Source state:** `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` — clean worktree, `HEAD == origin/main`
**Produced:** 2026-10-10

A factual inventory of what exists. Where a control is present, the file is named. Where it is absent, the absence
is stated as an absence — never as a risk rating. Ratings belong to S1 (`RISK-REGISTER.md`).

Every figure was derived from this commit. Nothing was carried over from the earlier S0 attempt, which examined a
stale tree (see `SECURITY-SOURCE-LOCK.md` §2.1).

---

## 1. Application shape

| Property | Fact |
|---|---|
| Framework | Next.js 15.5.25, App Router, `output: "standalone"` |
| Rendering | React 19 server + client components |
| Locales | `fa` (default, RTL), `en`, `de` — locale-prefixed routes via next-intl 4.13.2 |
| Pages | 288 `page.tsx` |
| API handlers | 572 (route × method) across 412 route files |
| **Server actions** | **0** — no `"use server"` anywhere in `src/` |
| GraphQL | none — no schema, no dependency |
| WebSocket server | none in app code; nginx forwards `Upgrade` to the app |
| Background workers | 4 — document-cleanup, ATS AI review, metering outbox, journal import (one-shot) |

### 1.1 Consequence of zero server actions

Because there are no server actions, **every state change must pass through an API route handler.** There is no
second mutation transport that could bypass route-level authorization. This narrows the S4/S5 mutation surface to
exactly the 572 inventoried handlers plus the four workers' authenticated HTTP calls.

---

## 2. Request entry

### 2.1 Middleware — and what it deliberately does not cover

`src/middleware.ts`, matcher at line 168:

```
matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
```

> **Two exclusions matter.** `api` is excluded, so **none of the 572 API handlers receives middleware
> authentication or CSP** — each route is solely responsible for its own enforcement. And `.*\..*` excludes any path
> containing a dot, so static asset paths such as `/uploads/<hex>.png` also get no middleware.

What the middleware does, in order:

1. **Page auth gate** — if `isProtectedPath(pathname)`, it calls `getRoleFromRequest(request)` (cryptographic JWT
   verification, edge-safe, **no database round-trip**), then `isAuthorizedForPath(role, pathname)`. On failure it
   redirects to `/{locale}/auth/login?from=…`. Helpers in `src/lib/auth/rbac.ts`.
2. **next-intl middleware** — locale detection, redirects, `NEXT_LOCALE` cookie.
3. **Per-request CSP nonce** — `btoa(crypto.randomUUID())`, set on the *request* headers (`x-nonce` and
   `content-security-policy`) so Next.js applies the nonce to its own RSC inline scripts, and again on the response.

Because step 1 is edge-only and does no database lookup, the page gate trusts the JWT's role claim. Server-
authoritative revocation lives in `src/lib/auth/session-store.ts`, documented Node-only and "NEVER import from
middleware or Edge Runtime code". Whether a revoked-but-unexpired token can still render a protected **page** is an
S3 question, not answered here.

### 2.2 Security headers — where each one is actually set

| Header | Set by | Verified in production (`HEAD /fa`, HTTP 200) |
|---|---|---|
| `content-security-policy` | `src/middleware.ts` → `buildCSP(nonce)` | present, nonce-based |
| `x-content-type-options: nosniff` | `next.config.ts` `headers()` | present |
| `x-frame-options: DENY` | `next.config.ts` | present |
| `referrer-policy: strict-origin-when-cross-origin` | `next.config.ts` | present |
| `permissions-policy` | `next.config.ts` | present |
| `x-dns-prefetch-control: off` | `next.config.ts` | present |
| **`strict-transport-security`** | **nowhere** | **absent** |

CSP directives emitted:

```
default-src 'self'
script-src  'self' 'nonce-<per-request>' + googletagmanager + google-analytics + clarity + s.provenexpert.net
            (+ 'unsafe-eval' ONLY when NODE_ENV !== "production")
style-src   'self' 'unsafe-inline'        <- documented: runtime-injected styles cannot be hashed
img-src     'self' data: + analytics + clarity + trustseal.enamad.ir + cdn-b.saashub.com + provenexpert
font-src    'self' data:
connect-src 'self' + analytics + clarity + provenexpert (+ api.openai.com ONLY when HERMES_EXTERNAL_AI_ENABLED)
frame-src   'self' + provenexpert
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
object-src 'none'
worker-src 'none'
```

The OpenAI `connect-src` entry is gated on the same `isExternalAiEnabled()` switch as the feature itself, read
through one shared helper rather than a second inline parse of the variable.

Because CSP comes from middleware and middleware excludes `/api` and dotted paths, **API responses and static
uploads carry no CSP.** For JSON endpoints that is largely inconsequential; it is recorded as a fact of the
configuration, not as a decision documented anywhere.

### 2.3 Reverse proxy — `deploy/nginx/default.conf`

| Property | Value |
|---|---|
| Port 80 | `308` to `https://hermesnovin.com$request_uri`, except `/api/health` (proxied, `access_log off`) and `/.well-known/acme-challenge/` |
| Port 443 | `ssl`, `http2 on` |
| `server_name` | `hermesnovin.com www.hermesnovin.com 185.80.196.163` |
| `www` → apex | `308` |
| TLS | `ssl_protocols TLSv1.2 TLSv1.3`, Let's Encrypt |
| Body limit | `client_max_body_size 50M` |
| Timeouts | read/send 300 s, connect 75 s |
| Headers toward app | `Host`, `X-Real-IP $remote_addr`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto https`, `X-Forwarded-Host`, `Upgrade`, `Connection "upgrade"` |
| `add_header` directives | **0** (also 0 in `mail.conf`) |
| `Strict-Transport-Security` | **absent** |
| `server_tokens off` | **absent** |
| `limit_req` / `limit_conn` | **absent** |
| `set_real_ip_from` | **absent** |

The canonical host in `CLAUDE.md` is `https://www.hermesnovin.com`, but nginx redirects `www` → apex and
`next.config.ts` defaults `NEXT_PUBLIC_BASE_URL` to `https://hermesnovin.com`. **The apex is canonical in code.**

### 2.4 The actual production edge

A read-only `HEAD https://hermesnovin.com/fa` returns `Server: cloudflare`, `CF-RAY`, `cf-cache-status: DYNAMIC`.
**Cloudflare sits in front of nginx.** `src/lib/security/request-guards.ts:19` documents the opposite ("no
Cloudflare") and keys rate limits on `X-Real-IP` only, deliberately distrusting `CF-Connecting-IP` and the
left-most `X-Forwarded-For`. The rate-limit consequence belongs to S5; the origin-exposure question is
`SECURITY-SOURCE-LOCK.md` §7 S0-B-03.

---

## 3. Identity, authentication and session

27 modules under `src/lib/auth/` plus `sso/`.

| Concern | Module | Facts established on this commit |
|---|---|---|
| Access token | `jwt.ts`, `jwt-server.ts`, `token-session.ts` | JWT via `jose`. Cookie `hermes_at`. `ACCESS_TOKEN_TTL` = 8 h. |
| Refresh token | `config.ts` | Cookie `hermes_rt`. `REFRESH_TOKEN_TTL` = 7 d. |
| Legacy session | `config.ts`, `session.ts` | HMAC cookie `hermes_session` **still defined**. |
| Server-authoritative session | `session-store.ts` | The `RefreshToken` row **is** the session; its `id` is the `sid` in the access token. Single place that decides active/revoked. Explicitly **fail-closed**: missing row, revoked, expired **or DB unreachable** ⇒ treated as revoked (lines 13-14). Node-only. |
| Revocation gap | `session-store.ts:17` | Tokens **without** a `sid` "never reach here; the caller's legacy path handles them" — so they are not revocation-checked. |
| Signing secret | `config.ts` `jwtSecret()` | Order `JWT_SECRET` → `JWT_ACCESS_SECRET` → `AUTH_SECRET` → `NEXTAUTH_SECRET`. **Throws in production** when none is set. A fixed dev/test fallback exists, reachable only when `NODE_ENV !== "production"`. |
| Password hashing | `argon2-wrapper.ts`, `password-policy.ts` | `argon2 ^0.44.0` **and** `bcryptjs ^3.0.3` both in the dependency set. Which is authoritative for new passwords, and whether a bcrypt verification path remains reachable, is **not** established in S0. |
| Password reset / verification | `password-reset.ts`, `verification.ts` | present |
| Registration / invitations | `registration.ts`, `access-invite.ts` | present |
| Re-authentication / step-up | `reauth.ts` | present — scope and coverage not established in S0 |
| Rate limiting | `rate-limiter.ts` | Redis fixed-window with in-process fallback. Tests: `__tests__/phase102-rate-limit-registry.test.ts`, `__tests__/phase93-redis-unavailable-failmode.test.ts` |
| Refusal mapping | `refusal-vocabulary.ts`, `context-result.ts` (`REFUSAL_STATUS`) | centralised refusal → HTTP |
| Safe redirect | `safe-return-path.ts` | present |
| SSO | `sso/` | present — not inspected in S0 |
| Seed admin | `config.ts` `adminSeed()` | `isAuthConfigured()` = `ADMIN_EMAIL && ADMIN_PASSWORD`. A standing env-driven privileged account. |

### 3.1 Account MFA does not exist

A search for `webauthn`, `passkey`, `totp` and "authenticator app" across `src/lib` and `src/app` returns only
three ATS files — `src/lib/ats/withdrawal-otp.ts` and its two tests — which implement a one-time code for a
*candidate withdrawing an application*, not account authentication.

**There is no account-level MFA, TOTP or WebAuthn implementation on this commit.** Stated as a measured absence; S3
owns the design.

---

## 4. Authorization — two independent axes

Hermes OS has **two unrelated RBAC systems**. Confusing them is the most likely source of a wrong security claim.

### 4.1 Axis A — application Role (platform-wide)

`src/lib/auth/roles.ts`

```
Role = superadmin | admin | engineer | customer | viewer | candidate | vendor
Capability = authoring | admin | superadmin | dashboard | billing_admin | org_admin | api_admin
```

| Role | Capabilities |
|---|---|
| `superadmin` | authoring, admin, superadmin, dashboard, billing_admin, org_admin, api_admin |
| `admin` | authoring, admin, dashboard, billing_admin, org_admin, api_admin |
| `engineer` | authoring, dashboard |
| `customer` | dashboard |
| `viewer` | — |
| `candidate` | — |
| `vendor` | dashboard |

This axis drives the **middleware page gate** and `canAccessEngineering`.

### 4.2 Axis B — organization role + permission (per tenant)

`src/lib/org/rbac.ts` — `OrgPermission` is a large union. Entry points `can(role, permission)`,
`requirePermission(...)`, `assignableRoles(actorRole)`. The set shows deliberate privilege splitting documented
in-file: `view_billing` separated from `manage_billing`; the API platform split into `manage_api_keys` /
`view_api_keys` / `view_api_usage`; `run_industrial_automation_org_wide` separated from `manage_industrial`; and the
ERP trio `view_erp` / `manage_erp` (OWNER, ADMIN) and `view_erp_compensation` (OWNER only).

### 4.3 The guards that actually exist — counted on this commit

| Guard | Definition | API route files using it |
|---|---|---|
| `getCurrentUser` | `src/lib/auth/current-user.ts` | **137** |
| `requirePermission` | `src/lib/org/rbac.ts` | **120** |
| `requireOrgActor` | `src/lib/org/context.ts` | **78** |
| `requireAuthoring` | `src/lib/auth/api-guards.ts` | 19 |
| `requireSiteActor` | `src/lib/site/context.ts` | **9** |
| `requireSitePermission` | — | **9** |
| `requireWritableOwner` | `src/lib/auth/api-guards.ts` | 7 |
| **`requireActor`** | **does not exist** | **0** |

> **Only 9 of 410 API route files reference a site-level guard**, against 78 using `requireOrgActor` and 120 using
> `requirePermission`. With 580 `organizationId` occurrences against 54 `siteId` in the schema, site isolation is
> structurally far thinner than organization isolation. S4 must treat site-level authorization as an open question,
> not an established control.
>
> `CLAUDE.md` names a guard called `requireActor` that has no definition and no use. Guidance naming a non-existent
> guard invites a future change to invent one, or to assume a boundary is enforced where it is not.

### 4.4 The tenant-context contract

`src/lib/tenant/contract.ts` resolves to exactly one of five states:

```
UNAUTHENTICATED | NO_ACTIVE_ORGANIZATION | SINGLE_ACTIVE_ORGANIZATION
MULTIPLE_ACTIVE_ORGANIZATIONS | MEMBERSHIP_UNAVAILABLE
```

There is deliberately **no** `organizationId: string | null`. Only `SINGLE_ACTIVE_ORGANIZATION` carries an
`organizationId`, and the file states it "is the only state from which a tenant-scoped query may be issued… The
union makes 'query anyway' unwritable rather than merely discouraged."

The same file records two repository-established facts that S1 must carry forward and re-verify:

- **line 8** — "six module data layers query Prisma with no `organizationId` predicate" though every root model
  declares the column;
- `resolveOrgContext` in `src/lib/billing/context.ts` resolves an unnamed organization with `findFirst` +
  `orderBy: { createdAt: "asc" }`, which "for a user in two organizations… silently picks one".

### 4.5 The ERP surface is the reference implementation of the target failure policy

HRIS-0.5 (`357c5a3c`) is on this commit. Its 26 ERP route files each apply four gates in order —
`getCurrentUser()` → `can(user.role, "admin")` → `getActiveOrganizationContext()` → `requirePermission(scope.role,
…)` — with `originRefusal(req)` on every write. `src/lib/erp/db.ts` raises `ErpError(503,
"SERVICE_UNAVAILABLE")` when Prisma is unavailable and `erpFailure()` maps anything unrecognised to the same
controlled 503, so no raw Prisma error reaches a caller and **no ERP path degrades to in-process storage.**

This matters beyond ERP: it is the shape the rest of the platform does not yet have (§5.2, DB-F1).

---

## 5. Data layer

### 5.1 Prisma / PostgreSQL

| Property | Value |
|---|---|
| Provider | `postgresql`, Prisma 7, `previewFeatures = ["driverAdapters"]` (now deprecated — `prisma validate` warns) |
| Connection string | **not in the schema** — `prisma.config.ts` supplies it from `env("DATABASE_URL")` |
| Client access | `src/lib/db/prisma.ts` → `getPrisma()` |
| Adapter | `@prisma/adapter-pg` (`PrismaPg`), client cached on `globalThis.__hermesPrisma` |
| Import style | `@prisma/client` and the adapter imported **dynamically**, only in database mode |
| Models / enums | 275 / 118 across 8 687 schema lines |
| Migrations | 82 directories |
| Migration execution | dedicated non-root `migrator` stage, `node node_modules/prisma/build/index.js migrate deploy` — never `npx` |
| Runtime image | Prisma **runtime only**, no CLI; `CMD` is `node server.js`; **nothing applies migrations on boot** |
| Role separation | migration role and runtime role are **not** separated in anything found in S0 |
| Connection encryption | not configured in the repository (`sslmode` absent from both example files) |
| Row-Level Security | **no policy found** |

### 5.2 The dual storage mode — and the silent fallback (DB-F1)

`src/lib/storage/storage-mode.ts`:

```
1. HERMES_STORAGE_MODE  ("database" | "session")   explicit override
2. DATABASE_URL present                            implies "database"
3. otherwise                                       "session"
```

Production runs `HERMES_STORAGE_MODE=database` (owner-supplied, read-only commands, service `hermes-web`, config
`/opt/hermes-os-nexuz/docker-compose.prod.yml`).

`getPrisma()` returns `null` when not in database mode, when `DATABASE_URL` is absent, or when the dynamic import /
adapter construction throws — and the failure is **cached for the process lifetime**, recorded once via
`logInfraFailure("database", "prisma.init", err)`.

**The factories select by environment, but the database implementations fall back by themselves.** Each of six
repository files constructs a session repository up front and returns to it on *every* operation:

```ts
function createDatabaseCaseRepo(owner) {
  const fallback = createSessionCaseRepo(owner);
  async function model() { const db = await getPrisma(); return db ? … : null; }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();                 // null client
      try { … } catch { return fallback.list(); }     // ANY Prisma exception
    },
    …
```

| File | `return fallback.` points | inside bare `catch {}` |
|---|---|---|
| `src/lib/storage/case-repository.ts` | 12 | 7 |
| `src/lib/storage/knowledge-repository.ts` | 14 | 7 |
| `src/lib/storage/memory-repository.ts` (two factories: memory + feedback) | 14 | 7 |
| `src/lib/storage/project-repository.ts` | 10 | 5 |
| `src/lib/storage/unknown-repository.ts` | 10 | 5 |
| `src/lib/storage/analysis-repository.ts` | 8 | 3 |
| **six files** | **68** | **34** |

Plus one independent path: `src/lib/documents/storage-cleanup.ts`, whose `store()` returns `sessionStore` both when
the mode is not database **and** when `getPrisma()` yields null.

Four aggravating facts:

1. **Writes are included** — `create`, `update` and `delete` all have fallback points. A mutation is accepted into
   `globalThis` and reported as success.
2. **The `catch` is not limited to a null client** — any transient Prisma exception (timeout, pool exhaustion,
   constraint error) reroutes to memory.
3. **Nothing is logged.** A grep for `logger`, `logInfraFailure` or `console` inside those catch blocks returns
   **0**. `logInfraFailure` fires once, at init, in `prisma.ts`.
4. `analysis-repository.ts` sends `update` and `delete` to the session store **unconditionally**, with the comment
   "Analysis records are append-only history; update/delete degrade to session."

**This is not a confidentiality leak, and the report must say so.** The session repositories apply the same owner
predicate (`ownerCanRead`, and `ownerWhere(null)` is an impossible sentinel — "Null sees NOTHING"), and the public
graph reads only published content. The defect class is **integrity, durability, auditability and truthfulness**: a
write survives only until the container restarts, gets a non-cuid id, is invisible to any other replica, and leaves
no audit row because `recordAuditEvent` is itself Prisma-backed.

Consumers of these repositories: `/api/cases`, `/api/knowledge`, `/api/analysis`, `/api/brain`, `/api/unknown`,
`/api/industrial-brain/save-case`, `src/lib/memory/*`, and `src/lib/eng-graph/builder.ts` (which feeds the public
graph endpoints).

### 5.3 The industrial empty-success pattern (DB-F2)

Twelve read paths answer an unavailable database with `return []` and a success status:

```
src/lib/industrial/alerts.ts (×2)   src/lib/industrial/assets.ts
src/lib/industrial/sites.ts         src/lib/industrial/gateways.ts
src/lib/industrial/connectors.ts    src/lib/industrial/telemetry.ts
src/lib/digital-twin/graph.ts       src/lib/digital-twin/nodes.ts
src/lib/predictive/maintenance.ts   src/lib/time-series/alarms.ts
src/lib/multi-site/kpis.ts
```

For an authorization-scope function such as `getAllowedSiteIds` (`src/lib/site/context.ts`), returning `[]` is
**fail-closed** and correct — no accessible site, no rows. For a data-listing function it is confidentiality-safe
but presents an outage as an empty success. On an industrial surface that is a safety-relevant misrepresentation:
the operator reads "zero alarms" when the truth is "no connection". S1 owns the rating.

### 5.4 Audit trail

`src/lib/audit/audit-service.ts` defines ~20 namespaced action catalogues. The `AuditLog` model:

```
id, userId?, action, entityType, entityId?, metadata Json, createdAt,
organizationId?, outcome?, correlationId?
indexes: action, userId, organizationId, createdAt, correlationId
```

> **The audit table is a plain append table.** No `previousHash`, no hash chain, no signature, no append-only
> enforcement, no WORM retention — verified: `awk '/^model AuditLog /,/^}/' | grep -ci "previousHash|hashChain|signature"`
> = **0**. `organizationId`, `outcome` and `correlationId` are all **nullable** ("additive, nullable", Phase 90B).
> A tamper-evident audit trail does not currently exist. Phase 112's separate immutable reasoning-run ledger does
> not make `AuditLog` tamper-evident.

### 5.5 Redis

`src/lib/redis/client.ts` — `ioredis ^5.11.1`, client cached on `globalThis.__hermesRedis`.

**No global key prefix or namespace** — `grep -cE "keyPrefix|prefix"` = 0. Key construction is entirely
caller-side, flat and colon-delimited. Whether every tenant-scoped cache key embeds an `organizationId` is
**unverified** and is an S4 obligation (cache bleed, namespace collision).

Known consumers: `src/lib/auth/rate-limiter.ts`, `src/lib/api/meter.ts`, `src/lib/api/rate-limit.ts`,
`src/lib/eng-graph/public-guard.ts`, `src/lib/copilot/voice/*`, `src/lib/observability/operator-console.ts`.

### 5.6 Object / file storage

| Surface | Fact |
|---|---|
| Uploads | volume `uploads_data` → `/app/public/uploads` — **inside `public/`**, therefore served statically with no authorization check |
| Documents | volume `documents_data` → `/app/.data/documents` — **outside `public/`**, reached through `src/lib/documents/object-storage.ts`, `page-access.ts` and a signed-token route |
| Writers under `public/` | **exactly two**, verified by `git grep 'process.cwd(), "public"'`: `src/app/api/articles/author-profile/avatar/route.ts:23` and `src/lib/articles/media.ts:50` |
| Filenames | `randomBytes(16).toString("hex")` = 128-bit CSPRNG + an extension from a three-item allowlist; the uploader's filename is never used |
| Validation asymmetry | the cover route sniffs magic bytes (`cover/route.ts:84`) and checks `file.size` before buffering (line 65); the avatar route does **neither** — 0 `sniffImageMime`, and its 2 MB check happens after `await file.arrayBuffer()` (lines 57-58) |
| Avatar authorization | `getCurrentUser()` only — no role, no permission |

The asymmetry between the two volumes is deliberate on the documents side and is the finding to carry forward on
the uploads side.

---

## 6. OT / industrial edge

| Property | Fact |
|---|---|
| Protocol clients | **none** (see `SECURITY-SOURCE-LOCK.md` §5) |
| Gateway API | 8 routes under `src/app/api/ot/` — gateways, gateway detail, enrollment, enrollment rotate, enrollment revoke, envelopes, devices, device detail |
| Gateway identity | **HMAC-SHA-256**, `src/lib/ot-edge/envelope-signature.ts` |
| **mTLS** | **not implemented** — `SIGNATURE_ALGORITHMS = ["HMAC-SHA256"]`, and line 88 rejects anything else |
| Signed fields (fixed canonical order) | `envelopeVersion, organizationId, gatewayId, timestamp, nonce, idempotencyKey, payloadType, payloadChecksum, signingKeyRef, signatureAlgorithm` |
| Canonicalisation | length-prefixed, fixed order, explicitly **not** `JSON.stringify` of caller-supplied objects |
| Comparison | `timingSafeEqual` |
| Key storage | `signingKeyRef` is an opaque pointer resolved by an injected `SecretProvider`; the default reads `process.env`. **No Prisma model stores key material.** |
| Replay controls | `timestamp`, `nonce`, `idempotencyKey` — all inside the signed field set |
| Secret backends | `secret-manager.ts`, `secret-backend.ts`, `openbao-secret-manager.ts`, `openbao-approle-token-provider.ts`, `openbao-runtime-composition.ts` |

The in-file history is explicit: Phase 94A compared `signingKeyRef` for equality, which "proves only that the caller
KNOWS a reference string"; Phase 94B replaced that with proof of possession.

**Honest statement of the gap:** the Dragon target architecture requires mTLS with per-device certificates between
Gateway and Hermes. What exists is per-gateway HMAC with env-resolved secrets plus application-layer replay fields.
That is a real control and a real improvement over 94A, and it is **not** mTLS. No certificate lifecycle, no expiry
monitoring and no dual-key validation window were found. S6 and S10 own closing or formally accepting this.

---

## 7. External integrations

| Integration | Entry point | Notes |
|---|---|---|
| Stripe | `src/app/api/billing/webhooks/stripe/route.ts` | one of 2 `WEBHOOK` handlers; inventory reports `unauthenticatedWebhooks: 0` — S5 must read and confirm the signature check |
| Automation webhooks | `src/app/api/automation/webhooks/route.ts` | second `WEBHOOK` handler |
| OpenAI | `openai ^6.43.0` | **off by default**; `HERMES_EXTERNAL_AI_ENABLED` gates routes, governance, UI boundary **and** CSP through one helper |
| Email | `nodemailer` (SMTP) + `resend` | `EMAIL_PROVIDER`, `SMTP_*` |
| GA4 / GTM | browser-side | env-gated; absent vars ⇒ CSP stays strict |
| Microsoft Clarity | browser-side | consent-gated, fixed CSP entries |
| eNAMAD / SaaSHub / ProvenExpert | browser-side | narrow per-host CSP entries, `img-src`-only where possible |
| OpenBao | `ops/openbao/`, `docker-compose.openbao-staging.yml` | staging compose only |
| Uptime Kuma | `docker-compose.prod.yml`, `profiles: ["monitoring"]` | publishes `3001:3001` only when the profile is activated |

---

## 8. Containers, network and host

### 8.1 What is hardened

| Control | Status |
|---|---|
| Non-root containers | **yes, every stage** — 6 `USER` directives in the Dockerfile |
| PostgreSQL port published | **no** — comment `# No public port — internal network only` |
| Redis port published | **no** |
| Redis authentication | `--requirepass "${REDIS_PASSWORD:-changeme}"` — present, with a `changeme` default fallback |
| Internal network | `hermes_internal` for all app/data services |
| Health checks | 4 |
| Log rotation | `json-file`, `max-size 10m`, `max-file 3` |
| Migrations on boot | **no** — profile-gated explicit step |
| Runner image contents | Next.js standalone + Prisma runtime only; **no scripts, no Prisma CLI** (asserted by `scripts/__tests__/phase106a-journal-import-path.test.ts`) |
| Worker images | one `.mjs` each, no `node_modules`, no ORM, **no database credential** |
| Docker socket mounted | **no** |

### 8.2 What is absent

| Control | Occurrences in `docker-compose.prod.yml` |
|---|---|
| `read_only` | **0** |
| `cap_drop` | **0** |
| `security_opt` / `no-new-privileges` | **0** |
| `tmpfs` | **0** |
| `mem_limit` / resource limits | **0** |
| `internal: true` on `hermes_internal` | **0** — a plain bridge, so containers retain outbound egress |
| seccomp / AppArmor profile | **0** |
| Image digest pinning | **none** — all four images are tags |

### 8.3 The development compose is a different posture

`docker-compose.yml` still publishes `5432:5432` and `6379:6379`, with a `changeme` PostgreSQL default and **no
Redis `requirepass` at all**.

This is a development file, and the owner has confirmed production runs
`/opt/hermes-os-nexuz/docker-compose.prod.yml`. It is recorded because if this file were ever used on a reachable
host the result is an unauthenticated Redis and a `changeme` database on a public port.

---

## 9. Supply chain and CI/CD

13 workflows. `ci.yml` triggers on `pull_request` with `permissions: contents: read`, concurrency per PR, and
third-party actions **SHA-pinned** (e.g. `actions/checkout@11d5960a…  # v4.4.0`). Its `validate` job runs
`gate:dependency-audit`, `db:validate`, `lint`, `test`, `build`. `deploy.yml` is `workflow_dispatch` **only**, with
`permissions: contents: read` and a protected `environment: production`.

### 9.1 Security tooling in CI — a measured absence

```
for t in semgrep codeql trivy gitleaks syft sbom zap checkov hadolint osv-scanner cosign; do
  echo "$t $(git grep -il "$t" -- '.github/workflows/*.yml' | wc -l)"
done
# every one: 0
```

**No SAST, no secret scanning, no container/image scanning, no IaC scanning, no DAST, no SBOM generation and no
artifact signing anywhere in CI.** The only dependency control is `npm run gate:dependency-audit`
(`scripts/ci/dependency-audit-gate.mjs`), governed by `docs/security/dependency-audit-exceptions.json` and
`dependency-audit-governance.md`.

`scripts/dr/secret-scan.mjs` **is not a repository secret scanner** — it walks generated JSON manifests so they
cannot carry a secret *value*; key *names* are explicitly allowed. It never examines the source tree or git history.

### 9.2 Release and DR tooling that does exist

`scripts/dr/` is substantial (release manifest/journal/state/prerequisites, blue-green, migration gates and SQL
classification, production safety check, recovery set and ownership, RPO/RTO, backup envelope and retention,
uploads archive/backup/restore, `hbk.mjs`, Redis recovery policy, config inventory, canonical JSON). Shell:
`backup-postgres.sh`, `restore-postgres.sh`, `verify-backup.sh`, OpenBao snapshot backup/restore. A `phase93-dr` CI
job runs a restore rehearsal. Backup envelope encryption is env-configured (`HERMES_BACKUP_KEY_FILE`,
`HERMES_BACKUP_KEY_ID`, `BACKUP_MIN_VERIFIED_COPIES`, `BACKUP_RETENTION_DAYS`).

Gate I therefore has real machinery behind it. S0 does **not** assert that it passes — no backup or restore was
executed.

---

## 10. Observability

`src/lib/logger/{index,correlation,safe-error,security-events}.ts` —
structured logging, correlation IDs (also on `AuditLog.correlationId`), `describeErrorSafely` (error class and
message, never credentials), and `logInfraFailure`. Plus `src/lib/observability/operator-console.ts` and two
`INTERNAL_HEALTH` handlers; nginx proxies `/api/health` on port 80 with `access_log off`.

**`docs/security/runbooks/` does not exist.** No incident runbook is present; the Dragon programme requires seven.

---

## 11. Existing security documentation on this commit

`SECURITY.md` at the root, and in `docs/security/`: `phase99-architecture-and-plan.md`,
`phase99-assurance-report.md`, `phase99-attack-surface-inventory.md`, `phase99-rules-of-engagement.md`,
`phase99-test-matrix.md`, `phase99-findings.json`, `phase99-finding-handling.md`, `phase99-evidence-index.md`,
`phase99-external-review-scope.md`, `phase99-external-review-intake.md`,
`phase99-route-security-inventory.json`, `phase99-dependency-review.json`,
`phase99-dependency-governed-retest.json`, `phase99-dependency-remediation.md`,
`dependency-audit-exceptions.json`, `dependency-audit-governance.md`.

**Phase 99 already built a security programme for this repository.** The Dragon programme should extend and
re-verify it, not duplicate it. `phase99-findings.json` and `phase99-attack-surface-inventory.md` must be
reconciled into `RISK-REGISTER.md` in S1 with each finding's status **re-verified** — this repository has a
recorded history of findings going stale in both directions.

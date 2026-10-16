# Hermes OS — Public Route Inventory (S0-B-01)

**Program:** Hermes Security Dragon
**Closes:** `S0-B-01` — the 50 `PUBLIC_READ` / `PUBLIC_WRITE` handlers, reviewed one by one
**Source state:** `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2`
**Produced:** 2026-10-10
**Method:** every one of the 48 route files was opened and read. The lexical classifier was used only to
enumerate the set; no verdict below rests on it. Where a route delegates its gate to a data function, that function's
`where` clause was read too.

**Presentation note.** The mandate lists 19 fields per handler. A 50 × 19 grid is unreadable, so the fields are
carried in grouped detail sections where every member of the group shares the same answer, and any member that
diverges is called out by name. Nothing is omitted; §2 is the verdict index and §3–§10 carry the fields.

---

## 1. Totals

| | |
|---|---|
| Route files | 48 |
| Handlers | **50** |
| `PUBLIC_READ` | 36 |
| `PUBLIC_WRITE` | 14 |
| Reviewed manually | **50 / 50** |

### 1.1 A classifier observation worth recording

The inventory flags only **3** of the 14 `PUBLIC_WRITE` handlers as `mutates: true`
(`/api/auth/access-request`, `/api/candidate/register`, `/api/sales/leads`). But `POST /api/careers/apply`,
`POST /api/vendors/apply`, `POST /api/compliance/cookie-consent` and `POST /api/media/public/videos/[slug]/view`
all write rows too. So `mutates` under-reports the public write surface by at least four handlers, and the
deep-dive list derived from it was correspondingly short. The four extra writers were reviewed here at the same
depth.

---

## 2. Verdict index

| # | Route | Methods | Verdict |
|---|---|---|---|
| 1 | `/api/articles` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 2 | `/api/articles/authors` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 3 | `/api/articles/feed` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 4 | `/api/articles/trending` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 5 | `/api/articles/[id]/comments` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 6 | `/api/articles/[id]/reaction` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 7 | `/api/careers/jobs` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 8 | `/api/careers/jobs/[jobId]` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 9 | `/api/billing/plans` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 10 | `/api/vendors` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 11 | `/api/vendors/[id]` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 12 | `/api/compliance/legal-documents/[type]` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 13 | `/api/auth/register` | POST | `PUBLIC_INTENTIONAL_SAFE` (returns 403 unconditionally) |
| 14 | `/api/auth/accept-invite` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 15 | `/api/auth/forgot-password` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 16 | `/api/auth/reset-password` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 17 | `/api/auth/verify-email` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 18–22 | `/api/eng-graph`, `/edges`, `/nodes`, `/stats`, `/node/[id]` | GET ×5 | `PUBLIC_INTENTIONAL_SAFE` |
| 23–27 | `/api/operations/{alerts,intelligence,overview,sites,war-room}` | GET ×5 | `PUBLIC_INTENTIONAL_SAFE` |
| 28 | `/api/copilot/demo` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 29 | `/api/copilot/demo` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 30 | `/api/industrial-brain/analyze` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 31 | `/api/vendors/apply` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 32 | `/api/careers/apply` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 33 | `/api/compliance/cookie-consent` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 34 | `/api/compliance/cookie-consent` | POST | `PUBLIC_INTENTIONAL_SAFE` |
| 35 | `/api/seo/indexnow` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 36 | `/indexnow-key.txt` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 37 | `/llms.txt` | GET | `PUBLIC_INTENTIONAL_SAFE` |
| 38 | `/api/auth/access-request` | POST | **`PUBLIC_INTENTIONAL_HARDENING_REQUIRED`** |
| 39 | `/api/sales/leads` | POST | **`PUBLIC_INTENTIONAL_HARDENING_REQUIRED`** |
| 40 | `/api/candidate/register` | POST | **`PUBLIC_INTENTIONAL_HARDENING_REQUIRED`** |
| 41 | `/api/media/public/videos` | GET | **`PUBLIC_INTENTIONAL_HARDENING_REQUIRED`** |
| 42 | `/api/media/public/videos/[slug]` | GET | **`PUBLIC_INTENTIONAL_HARDENING_REQUIRED`** |
| 43 | `/api/media/public/videos/[slug]/view` | POST | **`PUBLIC_INTENTIONAL_HARDENING_REQUIRED`** |
| 44–49 | `/api/customers/{accounts,health,overview,risks,success-plans,usage}` | GET ×6 | **`MISCLASSIFIED_PROTECTED`** |
| 50 | `/api/academy/certificates/[id]` | GET | **`BLOCKED_BY_POLICY_AMBIGUITY`** |

**`PUBLIC_UNSAFE`: zero.** No public handler was found returning another tenant's data, accepting a
client-supplied tenant identifier, or writing outside its intended table.

Counts: 37 `SAFE`, 6 `HARDENING_REQUIRED`, 6 `MISCLASSIFIED_PROTECTED`, 1 `BLOCKED`, 0 `UNSAFE`.

---

## 3. The three mandated deep dives

### 3.1 `POST /api/auth/access-request` — `PUBLIC_INTENTIONAL_HARDENING_REQUIRED`

| Field | Finding |
|---|---|
| Purpose | A visitor requests access; a `SalesLead` row tagged `source="AUTH_ACCESS_REQUEST"` is created for admin review. **No `User` is ever created here** (Phase 81A). |
| Public-by-design | **Yes.** Self-service registration is closed (`/api/auth/register` answers 403); this is its replacement intake. |
| Read/Write | Write — one `salesLead.create`. |
| Input validation | **Full Zod**: `fullName` 2–100, `email` RFC-validated + max 200 + lowercased, `company` ≤150, `roleTitle` ≤100, `message` ≤1000, `locale` ≤5, all trimmed. |
| Authentication | None (by design). |
| Authorization | None needed — the row is inert until an admin acts on it. |
| Tenant identifier accepted | **None.** |
| Tenant identifier trusted | n/a. `source`, `status` and `interest` are **hardcoded**; no client value reaches a privileged column. |
| Rate limiting | Shared Redis limiter, action `access-request`, keyed on `resolveClientIp` (X-Real-IP only, deliberately not XFF). Registered in the limiter registry. |
| CSRF relevance | Not applicable — anonymous, no ambient credential. No origin check, so a cross-site form post can create a lead; bounded by the limiter and the honeypot. |
| Bot/abuse resistance | Honeypot `_gotcha` with a **fake-success** response, so a bot learns nothing. Bounded body (`SMALL_JSON_BODY_BYTES`) before parsing. |
| PII accepted | Name, email, company, role, free-text message. |
| Sensitive output | None. The response is a fixed generic string that "never confirms or denies whether this email already has an account". |
| Audit event | **None.** The row is the only trace; no `recordAuditEvent`. |
| Failure behaviour | DB unavailable → controlled 503. Write error → 500, message to the server log only. No raw Prisma error reaches the caller. |
| **Finding H-1** | **`ipHash` has a silently-missing salt.** Line 36 is `createHash("sha256").update(ip + process.env.JWT_ACCESS_SECRET)` with **no check**. `jwtSecret()` accepts `JWT_SECRET`, `JWT_ACCESS_SECRET`, `AUTH_SECRET` or `NEXTAUTH_SECRET`, so a production deployment that sets only `JWT_SECRET` authenticates perfectly while `process.env.JWT_ACCESS_SECRET` is `undefined` — JS then salts with the literal string `"undefined"`. The stored `SalesLead.ipHash` becomes an unsalted hash over a 32-bit address space. **The repository already knows this threat**: `media/public/videos/[slug]/view/route.ts:117-122` guards exactly it and says so — "an unsalted hash of a 32-bit address space is reversible by brute force in seconds, so storing one would be storing the IP." Two of three call sites lack that guard. |
| **Finding H-2** | No idempotency or duplicate suppression; repeated submissions create repeated rows. The limiter is the only bound. |
| **H-1 production status** | **LATENT — not active in production.** Owner-supplied read-only evidence: `JWT_ACCESS_SECRET=SET`. Provisional severity **MEDIUM**; remediation required; **no emergency stop**. That check establishes only that the variable has a non-empty value in the current container. It does **not** establish the secret's strength, its independence from the JWT signing key, correct rotation, value stability across replicas and deploys, that the construction is an HMAC, or that the IP is extracted correctly behind Cloudflare. The defect is the missing guard, which survives any particular deployment's configuration. |
| Remediation shape (not executed) | A dedicated key for IP pseudonymisation, independent of the signing key; `HMAC-SHA-256` rather than `SHA-256(ip + secret)`; a key version; a rotation and migration policy; bounded retention; IP extraction only from a trusted proxy chain; and **fail-closed when the key is absent in production** — the posture the media view beacon already takes. |
| Evidence | `src/app/api/auth/access-request/route.ts:18-113`; salt contrast at `src/app/api/media/public/videos/[slug]/view/route.ts:117-122`; resolution order at `src/lib/auth/config.ts` `jwtSecret()`. Production evidence class: read-only container environment presence check; secret value exposed: NO; production mutated: NO. |
| Enumeration | **Not possible** — the response is invariant. |
| Consent/privacy | A privacy contract for lead data is **not referenced here**. S1 item. |

### 3.2 `POST /api/sales/leads` — `PUBLIC_INTENTIONAL_HARDENING_REQUIRED`

Same shape as 3.1 (full Zod over 14 fields, honeypot with fake success, bounded body, hardcoded
`source="WEBSITE"` / `status="NEW"`, no tenant identifier accepted, generic response, controlled 503/500, no audit,
no idempotency), and it carries **the same unguarded `ipHash` salt** at line 58 — Finding **H-1** applies
identically.

One additional, distinct finding:

| **Finding H-3** | **Its rate limiter is a module-local in-memory `Map`**, not the shared Redis limiter, and the file says so: *"Not suitable for multi-instance; acceptable for early sales traffic."* 5 requests / 10 minutes per hashed IP. Consequences: the counter resets on every container restart or redeploy, and each replica enforces its own independent cap, so the effective limit is 5 × (number of replicas). Every sibling public writer uses the shared Redis limiter. |
|---|---|
| Evidence | `src/app/api/sales/leads/route.ts:8-23` (the limiter), `:58` (the salt) |

### 3.3 `POST /api/candidate/register` — `PUBLIC_INTENTIONAL_HARDENING_REQUIRED`

This is the only public handler that **creates a `User`**, so it was read line by line.

| Field | Finding |
|---|---|
| Purpose | Public candidate self-registration: creates a `User` with `role: "candidate"`, an ATS candidate record, and signs the caller in. |
| Public-by-design | **Yes** — candidates must be able to register to apply. |
| Read/Write | Write — `user.create` + `createCandidate` + auth cookies. |
| Authentication | None inbound; issues a session outbound. |
| Tenant identifier accepted | **None.** |
| Tenant identifier trusted | n/a. **`role` is hardcoded `"candidate"`** and `emailVerified: false` — neither is client-settable. This is the critical control and it is correct. |
| Rate limiting | Shared Redis limiter, action `candidate-register`, registered. Applied **first**, before any parse or write. |
| CSRF relevance | Not applicable inbound. No origin check. |
| Bot/abuse resistance | Rate limit + `Content-Type` enforcement (415) + 16 KB bounded body. **No honeypot** (unlike the two lead forms) and no CAPTCHA. |
| PII accepted | Name, email, password, phone, location, skills, work authorisation. |
| Sensitive output | `userId` and `candidateId` of the row just created — the caller's own. |
| Audit event | **None** for user creation. |
| Failure behaviour | DB unavailable → 503. Session not persistable → **503 `SESSION_PERSISTENCE_UNAVAILABLE`, failing closed** (Phase 91): no partial, non-revocable session is established. Good. |
| **Finding H-4** | **No schema validation.** Unlike both lead forms, this route uses a hand-written `interface` + raw `JSON.parse`, and validates only `!name \|\| !email \|\| !password` and `password.length < 8`. So **`email` is never validated as an email** — any non-empty string is lowercased, trimmed and stored as a `User.email`; `name` has **no length bound** (anything up to the 16 KB body limit); and `skills`, `phone`, `location`, `workAuthorization` are unvalidated and unbounded despite their declared types. `src/lib/auth/password-policy.ts` exists and is **not** used here. |
| **Finding H-5** | **Account enumeration.** Lines 84-87 answer `409 "Email already registered"` — a direct existence oracle, bounded only by the per-IP limiter. The repository's stated posture is the opposite: `access-request` documents that it "never confirms or denies whether this email already has an account, matching the same posture as the login/forgot-password flows." This route contradicts that posture. |
| **Finding H-6** | `user.create` and `createCandidate` are **not in a transaction**. A failure between them leaves a `candidate`-role `User` with no candidate record; the response shape (`candidateId: candidate?.id ?? null`) shows the code anticipates it. |
| Idempotency | None, but the unique email constraint plus the 409 provides duplicate suppression. |
| Evidence | `src/app/api/candidate/register/route.ts:17-133` |

---

## 4. `MISCLASSIFIED_PROTECTED` — the six `/api/customers/*` handlers

`accounts`, `health`, `overview`, `risks`, `success-plans`, `usage`.

| Field | Finding |
|---|---|
| Purpose | A Customer-Success book of business: accounts with company name, industry, country, plan, status, ARR, health score, CSM owner, usage and renewal risk. |
| Data source | `src/lib/customers/mock-data.ts` — **17 static records**, with names such as "Siemens Engineering GmbH". |
| Database access | **None.** `grep -rln "getPrisma\|prisma" src/lib/customers/` returns nothing. |
| Tenant identifier | Neither accepted nor needed — there is no tenant data behind these routes. |
| Authentication / Authorization / Rate limiting / Audit | **None of them.** |
| Sensitive output | No real customer data, and therefore **no tenant leakage**. But the shape is an internal commercial dashboard, and it is served to the anonymous internet. |
| Why `MISCLASSIFIED_PROTECTED` | Two independent reasons. (a) **Intent**: a CS book of business is not public-by-design; whatever replaces the fixtures will be tenant data, and the route would then be an unauthenticated tenant-data endpoint. The authorization gap exists *now*, before the data arrives. (b) **Truthfulness**: `CLAUDE.md` forbids fake data on production paths, and these endpoints publish invented commercial relationships with named real companies — a misrepresentation risk independent of any security question. |
| Required remediation | Put the six behind the same gate as every other tenant surface **before** they are wired to real data, or remove them. Not an S0 action. |
| Evidence | `src/app/api/customers/*/route.ts`; `src/lib/customers/mock-data.ts` |

---

## 5. `BLOCKED_BY_POLICY_AMBIGUITY` — `GET /api/academy/certificates/[id]`

| Field | Finding |
|---|---|
| Purpose | Public certificate verification by `verificationToken`. |
| Output | Certificate number, issue/expiry dates, metadata, course title/category/level/instructor, and **the holder's real name** resolved from the `User` table. |
| Authentication | None — the token is the capability. Reasonable for a verification endpoint. |
| Rate limiting | **None.** |
| Positive control | Phase 99 fixed the verdict itself: `valid` now compares `expiresAt` instead of being hardcoded `true`, so an expired certificate no longer verifies as good with the holder's name attached. |
| **Why blocked** | The token's entropy **cannot be established from this repository**. `verificationToken` is `@unique` and indexed in the schema and is read by `getCertificateByToken`, but **nothing in `src/` writes it** — there is no mint site. Without knowing how it is generated, the enumeration risk of a public endpoint that returns a named individual cannot be rated: a 128-bit random token makes this safe, a sequential or short value makes it a PII enumeration surface. Compounding it, there is no rate limit to slow guessing either way. |
| Needed to resolve | Locate or define the issuance path and its token generator. If issuance happens outside this repository, that is itself the answer and must be recorded. |
| Evidence | `src/app/api/academy/certificates/[id]/route.ts`; `src/lib/academy/db.ts:647-652`; `prisma/schema.prisma:3387`; `git grep -n verificationToken -- src` shows reads and UI links only |

---

## 6. The three public media handlers — `PUBLIC_INTENTIONAL_HARDENING_REQUIRED`

`GET /api/media/public/videos`, `GET /api/media/public/videos/[slug]`,
`POST /api/media/public/videos/[slug]/view`.

These are, on the disclosure axis, the **best-documented public routes in the repository**. Their headers state
that the published-only gate lives in `src/lib/media/db.ts` behind a shared `mediaVisibilityWhere` predicate which
no route may restate, that queries are `organizationId`-scoped from the path, and that the response is a **field
allowlist** which never carries `organizationId`, `siteId`, `categoryId`, `instructorId`, `storageKey`,
`posterStorageKey`, `checksumSha256`, `processingState`, `status`, `visibility`, `rejectionReason` or
`processingFailureCode`. The view beacon hashes the client IP only when a salt exists, and stores `null` otherwise.

The single finding is about availability, not disclosure:

| **Finding H-7** | **They borrow another feature's rate-limit bucket.** `media/public/videos/route.ts:66` and `[slug]/route.ts:41` both set `PUBLIC_READ_LIMIT_ACTION = "copilot-demo-get"`, and `[slug]/view/route.ts:57` sets `BEACON_LIMIT_ACTION = "copilot-demo-post"`. The consequence is bucket collision: browsing the public video hub consumes the Copilot demo's budget for that IP and vice versa, so one public feature can exhaust another's allowance and neither limit can be tuned independently. The files' own stated *reason* for borrowing is **incorrect** — see §6.1 — but the collision itself is real and this finding stands on that alone. |
|---|---|
| Required remediation | Register `media-public-read` and `media-view-beacon` actions and point these three at them. |

### 6.1 CORRECTED — the limiter fails CLOSED on an unknown action

> **This section replaces an incorrect claim made in the first version of this document.** It previously stated
> that `checkRateLimit` "returns `true` — i.e. UNLIMITED — for an unregistered action" and therefore "fails open
> on an unknown action". **That is wrong, and inverted.** The claim was taken from a comment in the media route
> files instead of from the limiter itself.

Verified in `src/lib/auth/rate-limiter.ts` at this commit, the behaviour on an **undeclared** action is
comprehensively **`FAIL_CLOSED`**:

```ts
export async function checkRateLimit(action, identifier) {
  const limit = LIMITS[action];
  if (!limit) {
    refuseUndeclaredAction(action, "checkRateLimit");
    return false;                  // ← refused, not permitted
  }
  …
}
```

| Function | Behaviour on an undeclared action |
|---|---|
| `checkRateLimit` | returns **`false`** → the caller answers 429 |
| `memCheck` (the in-process fallback) | returns **`false`** |
| `retryAfter` | returns `DEFAULT_WINDOW_SECONDS`, explicitly so a refusal does not advertise `Retry-After: 0` |
| `refuseUndeclaredAction` | logs `"Undeclared rate-limit bucket — failing closed."` at error level **and** writes an audit event, `INFRA_AUDIT.RATE_LIMITER_DEGRADED`, with the bucket name and the calling site |

So inventing a new action name would **not** have removed the limit — it would have blocked the route outright
and raised an audited error. The registry (`LIMITS`, 34 actions, kept honest by
`src/lib/auth/__tests__/phase102-rate-limit-registry.test.ts`) enforces that an action **exists**; it does not
enforce that an action is **semantically distinct**, and that second gap is the one H-7 actually sits in.

Verified for this inventory, and unaffected by the correction: **every action string used by all 48 public route
files is registered** — `accept-invite`, `access-request`, `candidate-register`, `careers-apply`,
`cookie-consent`, `copilot-demo-get`, `copilot-demo-post`, `derived-graph`, `forgot-password`, `indexnow`,
`industrial-brain-analyze`, `journal-comment-create`, `journal-reaction-set`, `reset-password`, `vendor-apply`,
`verify-email`. No public handler is silently unlimited — and, given the corrected behaviour, none could have been.

The stale comments that caused this error remain in the product source and are recorded as finding **EDGE-04** in
`EDGE-ORIGIN-AND-CLIENT-IP.md`: `media/public/videos/route.ts:58-60` and `[slug]/route.ts:38-39` both assert the
fail-open behaviour the limiter does not have, misstating a safety property in the dangerous direction. **No
product file or comment was changed** — S0 is audit-only.

---

## 7. The ten derived-graph handlers — `PUBLIC_INTENTIONAL_SAFE`

`/api/eng-graph` + `/edges` + `/nodes` + `/stats` + `/node/[id]`, and
`/api/operations/{alerts,intelligence,overview,sites,war-room}`.

| Field | Finding |
|---|---|
| Purpose | Views derived from the engineering knowledge graph. |
| Read/Write | Read only. |
| Input validation | Query parameters are enum-ish filters (`type`) applied in JavaScript after the build; no value reaches a raw query. |
| Authentication / Authorization | None, by design. |
| Tenant identifier | Neither accepted nor used. The graph is built from **published** records only. |
| Rate limiting | **All ten** call `guardDerivedGraphRequest` as the first statement of the handler (verified per file). The guard **fails SAFE**: when Redis is unavailable the limiter degrades to an in-process window, "never to no limit at all". Shared bucket `derived-graph`, which is correct here because the ten views are variations on one computation. |
| Sensitive output | None. Phase 99 (P99-INT-011) pushed the published predicate **into the query**, so drafts never leave the database; the finding it closed was compute amplification, not disclosure. |
| Audit | None (reads). |
| Failure behaviour | Builder throws → 500 with an empty collection; no internal detail. |
| **Cross-reference** | `src/lib/eng-graph/builder.ts:414-440` consumes `knowledgeRepository()` and `listPublishedCases()`, both of which are **DB-F1 affected**. During a database outage these ten public endpoints are served from the in-process session ring. Published-only, so not a disclosure — but the public graph can silently misrepresent the estate. This is where DB-F1 reaches the public surface. |
| Evidence | `src/lib/eng-graph/public-guard.ts`; per-route `guardDerivedGraphRequest` call sites |

---

## 8. The public read surface — `PUBLIC_INTENTIONAL_SAFE`

### 8.1 Journal and directory reads

| Route | Predicate actually enforced in the data layer | Bounds |
|---|---|---|
| `/api/articles` | `{ status: "PUBLISHED", visibility: "PUBLIC" }` (`articles/db.ts:220`) | `limit` clamped to 100, `page` to 1000, non-integer/negative falls back — a Phase 99 fix for `?limit=500000` reaching Prisma `take` |
| `/api/articles/feed` | same, `take: LIST_MAX` (`:174-177`) | fixed |
| `/api/articles/trending` | same, `take: Math.min(limit, LIST_MAX)` (`:364-367`) | clamped 50 |
| `/api/articles/authors` | authors with `articles: { some: { status: "PUBLISHED", visibility: "PUBLIC" } }` (`:464-466`) | fixed |
| `/api/articles/[id]/comments` GET | gated on a PUBLISHED + PUBLIC article; `unavailable` → 503, `not-found` → 404 | — |
| `/api/articles/[id]/reaction` GET | same gate | — |
| `/api/careers/jobs` | `publicJobWhere` — OPEN + isPublic + published + unexpired + not deleted, **and** a complete translation for the locale | no fixture fallback; 503 when the store is unreachable |
| `/api/careers/jobs/[jobId]` | same | **unknown id, DRAFT, private, CLOSED, expired and incomplete-translation all answer the identical 404** — deliberately not an oracle |
| `/api/vendors` | `{ status: "APPROVED" }` | `take` clamped to 100; **`skip` is not clamped** (`Number(q.get("skip") ?? 0)`), so a non-numeric or negative value reaches the query — a minor hardening item, not a disclosure |
| `/api/vendors/[id]` | `getVendorBySlug`, 404 when absent | — |
| `/api/billing/plans` | `{ isActive: true }` | fixed |
| `/api/compliance/legal-documents/[type]` | **`organizationId: null`** — platform-global scope, so a tenant-owned document can never be served | 404 when absent |

Across all of these: no authentication (by design), no tenant identifier accepted, no PII in, nothing sensitive
out, no audit (reads), and no CSRF relevance. Journal content is a public publication and is deliberately not
tenant-scoped, so the absence of an `organizationId` predicate there is correct rather than a gap.

### 8.2 Static and SEO

`/indexnow-key.txt` serves the IndexNow verification key — public by protocol definition. `/llms.txt` serves a
static capability description. `/api/seo/indexnow` is rate-limited (`indexnow`) and read-only.

---

## 9. The public write surface — `PUBLIC_INTENTIONAL_SAFE` members

All five auth writers share one pattern, verified per file: **rate limit first** (registered action, keyed on
`resolveClientIp`) → bounded body (413 when over) → Zod `safeParse` (400/422 on failure) → generic response.

| Route | Specifics |
|---|---|
| `POST /api/auth/register` | Returns **403 unconditionally** — public self-registration is disabled (Phase 81A). The response "does not confirm or deny anything about the request itself". |
| `POST /api/auth/accept-invite` | **"One generic message for missing / expired / used / revoked / email-taken"** — a single refusal code covers all five states, so neither invites nor accounts can be enumerated. 503 when the store is unavailable. |
| `POST /api/auth/forgot-password` | Rate-limited, Zod email, 422 on invalid. Response is invariant (no account oracle). |
| `POST /api/auth/reset-password` | Rate-limited, Zod, 422 on invalid. |
| `POST /api/auth/verify-email` | Rate-limited, Zod `{ token: min(1) }`, 422 on invalid. |
| `POST /api/careers/apply` | The **only public writer with an origin check** — `isAllowedOrigin(origin)` is enforced when an `Origin` header is present, in addition to the rate limit, 16 KB bounded body and `stage1ApplicationSchema`. 503 when the store is unavailable, `no-store` on every response. |
| `POST /api/vendors/apply` | Rate limit `vendor-apply`, bounded body, Zod `Schema`, 422 on invalid, 500 on write failure with a bare `server_error`, 201 + the new id on success. |
| `POST /api/copilot/demo` / `GET` | Separate registered buckets per method (`copilot-demo-post` / `copilot-demo-get`), bounded body, minimum question length. The external-AI path is gated on `HERMES_EXTERNAL_AI_ENABLED`, off by default. |
| `POST /api/industrial-brain/analyze` | Rate limit `industrial-brain-analyze`, bounded body, `AnalyzeRequestSchema`, 400 on invalid, 500 with a generic message. Deterministic analysis; no tenant data read. |
| `GET`/`POST /api/compliance/cookie-consent` | POST rate-limited `cookie-consent`. Consent is recorded for the caller's own browser; no tenant identifier accepted. |

None of these accepts an `organizationId`, `siteId`, `userId` or `role` from the client.

---

## 10. What S0-B-01 establishes, and what it does not

**Establishes:**

- No public handler returns another tenant's data. `PUBLIC_UNSAFE` is zero.
- No public handler accepts a tenant, user or role identifier from the client. Every privileged column written by
  a public writer (`source`, `status`, `role`, `emailVerified`) is **hardcoded**.
- Every public route file's rate-limit action is registered, and the limiter **fails closed** on an undeclared
  one (§6.1, corrected), so no public handler is silently unlimited by either route.
- The repository's anti-enumeration posture is real and mostly consistent (`accept-invite`, `careers/jobs/[jobId]`,
  `access-request`, `forgot-password`), with **one documented contradiction** (`candidate/register`, H-5).

**Does not establish:**

- The entropy of `AcademyCertificate.verificationToken` (§5) — no mint site exists in this repository.
- Whether the `/api/customers/*` surface is intended to be public at all (§4) — an intent question for the owner.
- Any runtime behaviour. Nothing in this document was executed: no request was sent to any public endpoint on any
  environment, and the two production reads in the S0 lock were `HEAD /` and `HEAD /fa` only.

**Seven findings opened** (H-1 … H-7). None was remediated: S0 is audit-only, and `S1_AUTHORIZED: NO`. H-1 is the
one to look at first — it is a privacy control that the repository elsewhere proves it understands.

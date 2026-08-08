# Phase 99 — Security Test Matrix

For each area: the invariant this repository claims, how that claim is
currently proven **internally** (a named script or test file an engineer or
reviewer can actually run), and what an **external reviewer** should attempt
independently rather than take on faith. Internal proof is necessary but not
sufficient — static analysis and unit tests cannot see everything a human
adversary with an authorised target can, which is the entire reason Phase 99
exists as a review package rather than a self-certification.

Every finding produced against these areas is filed in
`docs/security/phase99-findings.json` under the matching `category`, and
every internal finding's `sourceReference` points back to the relevant
section below.

## Tenant isolation

**Invariant:** the acting organization is always derived server-side from the
authenticated actor and is never accepted from the request body, query
string, or headers; every object lookup by a path or query identifier is
additionally scoped to that server-derived tenant.

**Internal proof:** `analyzeTenantPredicates` in
`scripts/security/phase99/tenant-predicates.mjs`, run by the `TENANT_ISOLATION`
group of `npm run eval:phase99:readiness` and published in the
`tenantCoverage` block of `docs/security/phase99-route-security-inventory.json`
(`TENANT_IDENTITY_COVERAGE_PERCENT`, `OBJECT_SCOPE_COVERAGE_PERCENT`). The
analyser flags any tenant-bound handler that reads `organizationId`, `orgId`,
`userId`, `tenantId` or `ownerId` out of the request, and any handler that
resolves a path parameter without referencing a server-derived scope
anywhere in its body. Coverage figures are regenerated on every run of the
generator, not hand-maintained; treat the committed JSON, not this prose, as
current.

**External reviewer should attempt:** using two independent `hermes99test_*`
synthetic tenants, substitute tenant A's object identifiers into tenant B's
authenticated session across every `TENANT_MEMBER` and `PLATFORM_ADMIN`
endpoint that accepts a path or query identifier; attempt to supply an
`organizationId`/`tenantId` directly in a request body or query string on any
write endpoint; verify that site-scoped list/filter parameters (`siteId`) are
authorised against the caller's actual accessible sites rather than merely
present in the response filter.

## IDOR

**Invariant:** a handler that looks a record up by a client-supplied
identifier must reference a server-derived tenant or ownership scope before
returning or mutating it. A lookup with no such reference is an unscoped
direct object reference until a specific, written review says otherwise.

**Internal proof:** the same `analyzeTenantPredicates` pass computes
`OBJECT_SCOPED_HANDLERS` / `UNSCOPED_OBJECT_REFERENCE_HANDLERS`, checked by
the `IDOR` group of `npm run eval:phase99:readiness`. Any handler an engineer
believes is genuinely safe despite the pattern must be added to
`TENANT_REVIEW_ALLOWLIST` in `tenant-predicates.mjs` with a concrete named
mechanism — never a blanket suppression.

**External reviewer should attempt:** sequential and foreign-tenant
identifier substitution (UUIDs are not guessable, but *possessed* identifiers
from one tenant must still be rejected when presented in another tenant's
session) against every endpoint that accepts an object identifier, with
particular attention to any handler the committed inventory does not yet
show as scope-reviewed.

## Authentication and session

**Invariant:** the authentication cookie is written only by the
authentication layer (`src/app/api/auth/**`), never by an unrelated route;
all three authentication cookies are `httpOnly`, `Secure` in production, and
`SameSite=Lax` or stricter; sessions are revocable and bound to a specific
session id (Phase 91).

**Internal proof:** `cookieSecurityReview` in
`scripts/security/phase99/static-invariants.mjs` plus an explicit scan for
any non-auth route writing `hermes_session`/`SESSION_COOKIE`, both run by the
`AUTH_SESSION` group; `src/lib/security/__tests__/phase99-remediation.test.ts`
(`P99-INT-001`/`P99-INT-002`) reproduces and closes a real session-fixation
defect found in the pre-authentication cookie-consent endpoint.

**External reviewer should attempt:** session fixation via any
pre-authentication endpoint, cookie tampering and replay, session behaviour
across logout and explicit revocation, refresh-token reuse after rotation,
and privilege-boundary testing between an authenticated user, a tenant
member and a platform administrator.

## Business logic abuse

**Invariant:** a request body is never cast with a type assertion and
forwarded whole into a persistence write; self-service update endpoints
accept only an explicit, named field allow-list.

**Internal proof:** the `BUSINESS_LOGIC` group of
`npm run eval:phase99:readiness` scans for the exact shape — `req.json() as
Partial<...>` forwarded into `update`/`create`/`upsert` — across every route
file. `phase99-remediation.test.ts` (`P99-INT-003`) proves the candidate
self-service profile endpoint drops identity and relation fields a client
attempts to set, and (`P99-INT-013`) proves certificate verification derives
validity from the actual expiry date rather than a hard-coded value.

**External reviewer should attempt:** submit additional, unexpected JSON
fields to every self-service update endpoint (profile, application, course
progress) and check whether any of them changed an owner, a relation, or a
computed status field; attempt to skip workflow steps directly (e.g. mark a
course complete or a certificate valid without satisfying its precondition);
attempt to exceed academy attempt/time limits or claim another candidate's
application.

## API security

**Invariant:** every unauthenticated write bounds its request body, checks
its media type, and applies a rate limit; internal error detail (stack
traces, raw database errors) never reaches a client response; client-
controlled pagination parameters are clamped.

**Internal proof:** the `API_SECURITY` group of
`npm run eval:phase99:readiness` checks every `PUBLIC_WRITE` handler for
`readBoundedTextBody`/`readBoundedJson` and a rate-limit call; the
`APPLICATION_SECURITY` group runs `errorHygieneReview` in
`static-invariants.mjs` against every route for stack-trace or raw-error
leakage. `phase99-remediation.test.ts` (`P99-INT-010`) proves
`GET /api/articles` clamps an oversized `limit` and rejects non-integer
input; `phase99-static-invariants.test.ts` (`P99-INT-009`/`P99-INT-012`)
locks the bounded-body/media-type/rate-limit shape into the anonymous write
routes.

**External reviewer should attempt:** oversized and malformed request
bodies against every anonymous write; pagination/limit parameter abuse
(negative, non-numeric, extreme values) against every listing endpoint;
deliberately malformed input intended to trigger an unhandled exception, to
check whether the resulting response ever contains internal detail.

## File upload

**Invariant:** every multipart upload route bounds file size, checks content
type against an allowlist, controls the stored filename (never the client-
supplied name), and is authorization-gated.

**Internal proof:** `uploadSurfaceInventory` in `static-invariants.mjs`,
checked by the `FILE_UPLOAD` group and by
`phase99-static-invariants.test.ts` ("PHASE 99 — file upload"), against both
named upload routes (`POST /api/documents`, admin-only;
`POST /api/articles/author-profile/avatar`, authenticated, 2 MB, image MIME
allowlist, randomised filename).

**External reviewer should attempt:** content-type / magic-byte mismatch
(claim an image, send something else — using only the safe payload
constraints in `phase99-rules-of-engagement.md`); filenames containing path-
traversal sequences or control characters; uploads at and just over the
documented size ceiling; attempting either upload route without the required
authorization level.

## SSRF

**Invariant:** no API route lets a request decide an outbound HTTP
destination; every server-side outbound sink is either a literal, an
environment-configured value, a same-origin relative path, or a reviewed
helper parameter with a written justification.

**Internal proof:** `userControlledSinkScan` and `outboundSinkInventory` in
`static-invariants.mjs`, checked by the `SSRF` group
(`SSRF_USER_CONTROLLED_SINKS=0` at the time of writing) and by
`phase99-static-invariants.test.ts` ("PHASE 99 — SSRF"), against
`SSRF_SINK_ALLOWLIST` in the same module.

**External reviewer should attempt:** identify every parameter that
influences an outbound request (webhook configuration, import/fetch-style
features) and attempt to redirect it to a reviewer-controlled listener under
the reviewer's own infrastructure — never against a real third party or an
internal address, per `phase99-rules-of-engagement.md`.

## XSS

**Invariant:** no raw-HTML sink (`dangerouslySetInnerHTML`, `.innerHTML`,
`.outerHTML`, `document.write`) receives anything but `JSON.stringify`
output or a static literal; a nonce-based Content-Security-Policy is set on
every response.

**Internal proof:** `htmlSinkInventory` in `static-invariants.mjs`, checked
by the `XSS` group and `phase99-static-invariants.test.ts` ("PHASE 99 —
XSS"); the `XSS` group additionally asserts `src/middleware.ts` sets a
`Content-Security-Policy` with a nonce.

**External reviewer should attempt:** stored and reflected injection into
every authoring surface that renders user-supplied content (articles,
knowledge base, case notes, profile fields) and verify the response CSP
actually blocks inline-script execution where a control gap is found.

## CSRF

**Invariant:** authentication cookies are `SameSite=Lax` or stricter (so a
cross-site request never carries them); no `GET` handler mutates state,
which is the precondition for the SameSite contract to hold; the anonymous
Brain write additionally applies an exact-origin check
(`isAllowedOrigin` in `src/lib/security/request-guards.ts`).

**Internal proof:** `cookieSecurityReview` plus a scan for any `GET` handler
that performs a mutation, checked by the `CSRF` group and
`phase99-static-invariants.test.ts` ("PHASE 99 — CSRF contract"). At the
time of writing, `stateChangingGetHandlers` in the committed route inventory
is `0`.

**External reviewer should attempt:** cross-site form submission (or a
bare `<img>`/navigation-triggered `GET`) against every state-changing
endpoint from an unrelated origin, confirming the cookie is not attached and
that any origin-checked route rejects a forged or absent `Origin` header.

## SQL injection

**Invariant:** every raw-SQL call site (`$queryRaw`/`$executeRaw` and their
`Unsafe` variants) is a string literal, a Prisma tagged-template with bound
parameters, or a template whose only dynamic interpolations resolve to
module-level constant identifiers — never a value that can carry request
data into the SQL text.

**Internal proof:** `rawSqlInventory` in `static-invariants.mjs` against
`RAW_SQL_ALLOWLIST`, checked by the `SQL_INJECTION` group
(7 raw-SQL sites at the time of writing, 0 unsafe) and by
`phase99-static-invariants.test.ts` ("PHASE 99 — SQL injection").
`phase99-remediation.test.ts` (`P99-INT-007`) proves
`isSafeMetadataFilterKey` in `src/lib/rag/vector-store-pgvector.ts` rejects
any metadata filter key that does not match a strict SQL-identifier pattern,
closing an interpolation that was previously guarded only by a source
comment.

**External reviewer should attempt:** parameter fuzzing against every
filterable, searchable or sortable endpoint, with particular attention to
any endpoint that accepts a metadata-filter object rather than a fixed set of
named fields, using non-destructive detection techniques only (see "No
destructive database operations" in `phase99-rules-of-engagement.md`).

## Rate limiting

**Invariant:** rate-limit keys are derived only from a header the reverse
proxy controls and overwrites (`X-Real-IP`), never from a client-controlled
forwarding header; the limiter is Redis-backed with an in-process fallback
that is fail-safe, never fail-open, and the degradation state is observable.

**Internal proof:** the `RATE_LIMITING` group of
`npm run eval:phase99:readiness` scans every route that calls
`checkRateLimit`/`checkAndIncrRateLimit` for any reference to
`X-Forwarded-For`, and asserts `src/lib/auth/rate-limiter.ts` exposes
`isAuthLimiterDegraded`. `phase99-static-invariants.test.ts` (`P99-INT-008`)
proves the public lead endpoint keys on `resolveClientIp(req)` and contains
no `X-Forwarded-For` reference, and asserts the same for every other
rate-limited route.

**External reviewer should attempt:** header-rotation bypass attempts
(varying `X-Forwarded-For`, attempting to spoof `X-Real-IP` from outside the
reverse-proxy boundary) against every rate-limited anonymous endpoint;
confirm that the limiter actually blocks once the configured bucket is
exhausted, without exceeding the load boundaries in
`phase99-rules-of-engagement.md`.

## Dependency review

**Invariant:** dependency advisories against the committed lockfile are
tracked, severity-mapped, and reachability-assessed (production tree vs.
build/development tree only); no advisory is silently ignored.

**Internal proof:** `scripts/ci/phase99-dependency-review.mjs` produces
`docs/security/phase99-dependency-review.json` from `npm audit`; the
`DEPENDENCY_REVIEW` group of `npm run eval:phase99:readiness` fails on any
`CRITICAL` or unmapped-severity advisory and resolves to `BLOCKED_OWNER`
(never silently to `PASS`) when `HIGH` advisories remain open, because
clearing them requires an owner-approved lockfile update or framework
upgrade. Each advisory is also filed individually in
`docs/security/phase99-findings.json` (`P99-DEP-*`).

**External reviewer should attempt:** an independent software-composition-
analysis scan against the same lockfile, and a reachability assessment for
each production-tree `HIGH` advisory (whether the vulnerable code path is
actually invoked by this application) rather than relying on severity label
alone.

## Infrastructure

**Invariant:** the application container runs as a non-root user; PostgreSQL
and Redis publish no host ports; baseline security response headers and a
Content-Security-Policy are set; CORS is never configured with a wildcard
origin alongside credentials; no credential-shaped value is baked into an
image layer.

**Internal proof:** `infrastructureReview` in `static-invariants.mjs`,
checked by the `INFRASTRUCTURE_REVIEW` group and
`phase99-static-invariants.test.ts` ("PHASE 99 — infrastructure"), reading
the committed `Dockerfile`, `docker-compose.prod.yml`, `next.config.ts` and
`src/middleware.ts`.

**External reviewer should attempt:** review of the built image for
non-root execution and layer contents, confirmation that no data-service
port is reachable from outside the authorised target's internal network, and
header/CSP verification against live responses from the authorised
non-production target.

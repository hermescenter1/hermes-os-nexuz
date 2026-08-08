# Phase 99 — Assurance Report

**Status: INTERNAL READINESS NOT COMPLETE (owner decisions outstanding). EXTERNAL GATES NOT MET. PHASE 99 IS NOT CLOSED.**

> **Correction (dependency remediation revision).** An earlier revision of this
> report claimed `PHASE_99_INTERNAL_READINESS_COMPLETE=YES` while
> `BLOCKED_OWNER` groups remained, and stated that three of the four production
> dependency advisories "clear only by moving `next` across a major version".
> Both statements were wrong and are corrected below. The evaluator's own
> contract is authoritative: any group in `BLOCKED_OWNER` means internal
> readiness is **NO**. And `npm audit` reported the `next` fix as
> `isSemVerMajor: false` — it was a **patch** bump, 15.5.20 to 15.5.23, which
> this revision applied. No major upgrade was ever required.

This report states what Phase 99 actually established, and — more importantly —
what it did not and could not establish. Phase 99 contains gates that this
repository cannot satisfy from the inside: an independent penetration test, an
external application security review, an external API security review, and a
pilot customer's acceptance. Those are acts performed by people who are not this
codebase. Nothing in this document should be read as a claim that any of them
has happened.

---

## 1. What this phase did

Phase 99 inventoried the entire HTTP surface, classified every handler by the
authorization it actually proves in its own source, hardened what that inventory
exposed, and built two evaluators that keep the result honest — one for internal
readiness, one for official closure that stays blocked until real external
evidence exists.

### Route-security inventory

| Classification | Handlers |
| --- | --- |
| PUBLIC_READ | 36 |
| PUBLIC_WRITE | 13 |
| AUTHENTICATED_USER | 210 |
| TENANT_MEMBER | 119 |
| PLATFORM_ADMIN | 115 |
| WEBHOOK | 2 |
| INTERNAL_HEALTH | 2 |
| **UNKNOWN** | **0** |

355 route files, 497 exported handlers. `UNKNOWN` is a hard readiness failure, so
every handler either proves an authorization guard in its own body or appears in
`scripts/security/phase99/public-surface.mjs` with a written justification of what
it returns. The machine-readable inventory is
`docs/security/phase99-route-security-inventory.json`, regenerated and drift-checked
by `npm run security:phase99:inventory:check`.

Three entries that a first pass would have declared "public" were found to be
defects instead and were fixed rather than declared — a public detail endpoint
that returns another tenant's unpublished record is not a public surface.

### Tenant isolation and IDOR

| Measure | Result |
| --- | --- |
| Tenant-bound handlers analysed | 234 / 234 |
| Tenant identity server-derived | 100% |
| Object references tenant-scoped | 100% |
| Handlers reading identity from the request | 0 |
| Unscoped direct object references | 0 |

Coverage reaches 100% only through `TENANT_REVIEW_ALLOWLIST` in
`scripts/security/phase99/tenant-predicates.mjs`, where each of the 37 exceptions
names the concrete mechanism that enforces isolation (a query predicate, a
platform-admin authority over a genuinely global resource, or the OT route kit).
An entry without a substantive mechanism is rejected by the validator, and an
entry that no longer matches a flagged handler is reported as stale.

**Honest limit:** this is a static proof that the tenant predicate is present and
server-derived. It is not a behavioural proof that every one of the 497 handlers
denies a foreign-tenant request at runtime. Behavioural cross-tenant proof exists
for the subsystems covered by the Phase 90/91/97 PostgreSQL suites, and extending
it to full runtime coverage is exactly the kind of independent verification the
external API security review should perform.

### Static security invariants

| Area | Result |
| --- | --- |
| Raw SQL sites | 7, all literal / parameter-bound / constant-identifier; 2 in a reviewed allowlist |
| Request-controlled outbound destinations | 0 |
| Unreviewed outbound sinks | 0 |
| Unsanitised raw-HTML sinks | 0 |
| Upload surfaces without size/type/filename/authorization controls | 0 |
| State-changing GET handlers | 0 |
| Authentication cookies not httpOnly + Secure + SameSite Lax-or-stricter | 0 |
| Rate-limit keys derived from a client-controlled header | 0 |
| Stack traces or database errors returned to clients | 0 |
| Container running as root / data services publishing host ports / CORS wildcard with credentials | 0 |

### Validation actually executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npm test` | **6057 passed, 0 failed, 122 skipped** (317 files), stable across two consecutive runs |
| `npm run build` | exit 0, standalone output produced |
| `npm run eval:phase95/96/97/98` | PASS |
| `npm run eval:phase99:readiness` | 0 FAIL, 7 BLOCKED_OWNER |
| `npm run eval:phase99:closure` | **BLOCKED (exit 1)** — correct |
| `npm run rehearse:phase99:incident` | PASS |
| `npm run security:phase99:deps` | 0 CRITICAL, 7 HIGH |

---

## 2. Findings

Phase 99's internal review found and confirmed real defects. They are recorded in
`docs/security/phase99-findings.json` with remediation and retest references.

| Severity | Total | Open | Notes |
| --- | --- | --- | --- |
| CRITICAL | 1 | 0 | fixed and retested |
| HIGH | 12 | **0** | the 7 dependency advisories are now remediated, not accepted |
| MEDIUM | 14 | 5 | the 5 remaining MEDIUM dependency advisories; none is a release blocker |
| LOW | 4 | 0 | |

`RELEASE_BLOCKERS=0`. Every HIGH closed through a fix with retest evidence;
**no risk acceptance was created**, by an agent or otherwise.

### The critical finding

**P99-INT-001 — session fixation via the cookie-consent endpoint.**
`POST /api/compliance/cookie-consent` is unauthenticated by necessity, and it set
`hermes_session` — which is not a consent identifier but `SESSION_COOKIE`, the
signed authentication session that `getCurrentUser()` treats as the sole auth
gate on most of the API — to a value taken from the request body, for one year on
path `/`. An unauthenticated caller could therefore plant a session of their
choosing in another browser, and the victim would then work inside the attacker's
account and organization.

Fixed by giving consent its own opaque, server-minted identifier cookie with a
strict shape check. The authentication cookie is never read or written by that
route, and a client-supplied `sessionId` is ignored outright.

### Other confirmed defects, all fixed and retested

- **P99-INT-002 (HIGH)** — live session tokens stored as consent keys and written
  to logs, with an unauthenticated read that returned user id, IP and user agent
  keyed by an attacker-supplied value.
- **P99-INT-003 (HIGH)** — mass assignment on `PUT /api/candidate/profile`: a
  TypeScript assertion filtered nothing at runtime, so `email`, `userId` and
  nested relation writes reached Prisma.
- **P99-INT-014/015/016 (HIGH)** — the Phase 43 site allow-list was applied only
  in the branch where no filter was supplied, so naming a site (or a gateway)
  **replaced** the allow-list instead of narrowing it. A member granted one site
  could read another site's assets, gateways, and connector configuration —
  which carries OPC UA and MQTT connection material. The item routes enforced the
  boundary correctly, so the control was defeated purely by choosing a different
  URL.
- **P99-INT-004/005/006 (MEDIUM)** — public detail endpoints returned unpublished
  and cross-tenant job, course and assessment records.
- **P99-INT-007 (MEDIUM)** — a raw SQL identifier interpolation whose only
  protection was a source comment asserting callers behave.
- **P99-INT-008 (MEDIUM)** — a rate limit keyed on the client-appendable
  X-Forwarded-For, defeating the cap entirely.
- **P99-INT-017 (MEDIUM)** — asset analytics applied no site allow-list, and its
  score queries were invalid against models with no `siteId` column, guaranteeing
  a 500 on any site-filtered request.
- **P99-INT-009/018/019 (MEDIUM/LOW)** — missing abuse controls on anonymous
  writes, a persisted session credential, and missing site authorization on the
  industrial create handlers.
- **P99-INT-010/012/013 (LOW)** — unbounded page size, unbounded anonymous JSON
  parse, and a certificate verifier that reported expired certificates as valid.

### P99-INT-011, reviewed and now fixed

Previously open. It was an unbounded cross-tenant table scan reachable from the
ten anonymous engineering-graph and operations endpoints: no data crossed the
boundary (the builder already emitted published records only), but every request
read every row of every tenant — drafts included — out of the database in order
to discard most of it, and nothing bounded how often that could be driven.

Re-reviewed for a contained correction, and one exists. Two changes, neither of
which alters a response:

1. An **additive optional `listPublished()`** on the knowledge repository pushes
   the published predicate into the query. `list()` is untouched, because the
   authenticated surfaces legitimately need drafts, and the builder falls back to
   the previous shape for any repository with no publication concept. The node
   set returned is identical; what changes is how much never leaves the database.
2. A **shared `derived-graph` rate-limit bucket** (60/min per client IP, keyed on
   the un-spoofable `X-Real-IP`) bounds the rebuild amplification across all ten
   endpoints. The budget is far above real use: each view is fetched once on
   component mount and nothing in the UI polls, so a visitor would have to reload
   about once a second to notice it.

**Deliberately not done:** memoizing the builder behind a TTL. That would delay a
newly published article from appearing, which is a product-semantics change
rather than a security fix. The published corpus itself stays unbounded by
design — it is the public content these endpoints exist to expose.

Retest: `src/lib/eng-graph/__tests__/phase99-derived-graph-bounds.test.ts`.

### Open findings

- **P99-DEP-008..012 (MEDIUM, OPEN)** — five moderate dependency advisories
  (`@hono/node-server`, `@prisma/dev`, `hono`, `prisma`, `valibot`). Recorded, not
  release blockers, and left for a routine dependency pass rather than folded
  into a security-review branch.

---

## 3. Dependency review — remediated

**`DEPENDENCY_CRITICAL=0` and `DEPENDENCY_HIGH=0`**, reached entirely by fixing,
with no risk acceptance and no major upgrade. The sanitized artifact is
`docs/security/phase99-dependency-review.json`; the retest is
`scripts/__tests__/phase99-dependency-remediation.test.ts`, which reads the
resolved lockfile and asserts the fixed boundary for **every copy** of each
package rather than trusting a transient `npm audit` run.

`npm audit fix` was **rejected**: its dry run proposed adding dozens of unrelated
packages (a whole d3 subtree among them), which is the broad rewrite the phase
brief forbids. Each advisory was instead resolved by the smallest deterministic
change that clears it.

| Finding | Package | Resolution | Mechanism |
| --- | --- | --- | --- |
| P99-DEP-001 | brace-expansion | 1.1.15 → 1.1.18, 5.0.6 → 5.0.9 | in-range transitive update |
| P99-DEP-002 | fast-uri | 3.1.2 → 3.1.5 | in-range transitive update |
| P99-DEP-003 | js-yaml | 4.2.0 → 4.3.1 | in-range transitive update |
| P99-DEP-007 | undici | 7.28.0 → 7.29.0 | in-range transitive update |
| P99-DEP-004 | next | 15.5.20 → 15.5.23 | patch bump of the pinned direct dependency |
| P99-DEP-005 | postcss | 8.5.1 → 8.5.26 | devDependency bump **plus an override** |
| P99-DEP-006 | sharp | 0.34.5 → 0.35.3 | **override** |

The first four moved with `npm update <pkg> --package-lock-only`, which cannot
leave a parent's declared range. `package.json` was untouched by that step and
exactly five lockfile entries changed.

The last three needed more care, because npm's own `fixAvailable` was
**optimistic**. It reported all three as fixed by `next@15.5.23`, but
`next@15.5.23` still pins `postcss 8.4.31` exactly and still declares
`sharp ^0.34.3` as an optional dependency — neither is reachable by bumping
`next`. Two `overrides` entries lift exactly those two packages and nothing else.
The resulting lockfile resolves a **single** copy of `next`, `postcss` and
`sharp`, which the retest asserts: a surviving nested duplicate would mean
something still pulls a vulnerable version.

Both overrides are load-bearing security controls, not tidiness. Deleting either
would silently reintroduce its advisory while every version spec still looked
current, so the retest asserts their presence explicitly.

**Remaining:** 5 MEDIUM advisories (`@hono/node-server`, `@prisma/dev`, `hono`,
`prisma`, `valibot`), all recorded as open findings. None is a release blocker.

`RELEASE_BLOCKERS=0`.

### Platform compatibility — closed by owner-supplied evidence

```
PRODUCTION_CPU_SSE4_2=PASS
SHARP_0_35_3_CPU_COMPATIBILITY=PASS
SHARP_PLATFORM_BLOCKER=CLOSED
```

The `sharp` upgrade carried one condition Phase 99 could not settle from the
inside. `sharp@0.34.5` applied its x86-64-v2 gate only to the glibc specifier
`@img/sharp-linux-x64`, which does not match Alpine's `@img/sharp-linuxmusl-x64`,
so musl was exempt; `sharp@0.35.3` gates both. The upgrade therefore introduced a
**new SSE4.2 requirement on the only runtime platform this project has**, and
verifying it meant looking at the deployment host — which Phase 99 must not do.

**The owner has supplied that evidence.** They observed the CPU capability
directly on the deployment host and reported `PRODUCTION_CPU_SSE4_2=PASS`. The
observation was read-only and made no configuration, deployment, restart,
package, container or service change. No agent inspected the host. Only the
conclusion is recorded — no host identifier, no address, no `/proc/cpuinfo`
contents.

This is **owner-supplied operational evidence**, deliberately kept distinct from
the external-review and pilot-acceptance evidence contracts. It attests to a
deployment-platform capability, not to a security review, and it is recorded in
prose rather than through the attestation schema for exactly that reason: nothing
here should be capable of satisfying an external gate. No external gate moved.

Full detail, including the failure mode and the re-check for any future host, is
in `docs/security/phase99-dependency-remediation.md`.

---

## 4. External gates — BLOCKED, not passed

| Gate | State |
| --- | --- |
| INDEPENDENT_PENETRATION_TEST | BLOCKED_EXTERNAL |
| EXTERNAL_APPLICATION_SECURITY_REVIEW | BLOCKED_EXTERNAL |
| EXTERNAL_API_SECURITY_REVIEW | BLOCKED_EXTERNAL |
| PILOT_CUSTOMER_SELECTED | BLOCKED_OWNER |
| INDUSTRIAL_ENGINEER_FEEDBACK | BLOCKED_EXTERNAL |
| PILOT_ACCEPTANCE_RECORDED | False |

`npm run eval:phase99:closure` exits non-zero and will continue to do so until
authentic external evidence is supplied and validated. The contract is enforced
mechanically, not by convention: `scripts/__tests__/phase99-governance.test.ts`
proves that a synthetic fixture resolves to BLOCKED, that an agent-attributed
attestation fails, that an expired or agent-authored risk acceptance is invalid,
and that a pilot record naming a customer instead of an alias is rejected.

No external test environment has been provisioned, so the rules of engagement
record `PENTEST_TARGET=OWNER_CONFIGURATION_REQUIRED` rather than inventing a
hostname for a real tester to attack.

---

## 5. Safety posture

Every one of the following is `False` for this phase:

```
PRODUCTION_SECURITY_TEST_EXECUTED=False
PRODUCTION_LOAD_TEST_EXECUTED=False
PRODUCTION_DEPLOY_EXECUTED=False
LIVE_OT_WRITE_EXECUTED=False
DIRECT_PLC_CONTROL_EXECUTED=False
CUSTOMER_CONTACTED=False
PENTEST_VENDOR_CONTACTED=False
REGULATOR_CONTACTED=False
NOTIFICATION_SENT=False
```

All active testing ran against this repository's source, its unit suite, and
disposable CI resources named `hermes99test*`. No production host, customer
system, industrial device or third-party service was contacted.

---

## 6. Disclosed collateral changes

Two changes outside the Phase 99 security scope are disclosed rather than hidden:

1. **`src/lib/compliance/__tests__/phase97-eval.test.ts`** — its comment stripper
   used a `$`-anchored regex, which fails on a Windows CRLF checkout and made the
   Phase 97 migration-integrity assertion fail locally while passing in CI. The
   anchor was dropped. The assertion itself is unchanged.
2. **`src/app/api/industrial-brain/__tests__/analyze-contract.test.ts`** and
   **`src/lib/security/__tests__/security-8-amendment.test.ts`** — updated for the
   controls Phase 99 added to the routes they exercise (a rate limit and a site
   authorization). Both updates make the harness supply what the new control
   needs; neither weakens an assertion.
3. **`src/lib/auth/__tests__/brain-api-boundaries.test.ts`** — its
   "public operations API keeps its anonymous contract" case called `GET()` with
   no argument. That endpoint now takes a request so it can be rate limited, so
   the case passes a real request. The anonymous contract it asserts is
   unchanged, and it additionally asserts that a first request is not throttled.

---

## 7. Correct final state

```
PHASE_99_INTERNAL_READINESS_COMPLETE=NO
PHASE_99_EXTERNAL_GATES_COMPLETE=NO
PHASE_99_IMPLEMENTATION_COMPLETE=NO
PHASE_100_ALLOWED=NO
```

Internal readiness is **NO**, and this report will not say otherwise while any
group sits in `BLOCKED_OWNER`. The evaluator's own contract decides this:
`internalReadinessComplete` is true only when no group has failed **and** none is
blocked. Five groups are blocked, all for the same reason — the pilot package is
written and validated, but a pilot cannot be executed against a customer the
owner has not yet selected.

What changed with this revision: every security group and the dependency review
now PASS, and `RELEASE_BLOCKERS` went from 8 to **0**. What did not change: the
external gates. An independent penetration test, external application and API
security reviews, and a pilot acceptance remain `BLOCKED`, and
`eval:phase99:closure` still exits non-zero. Converting any of them to PASS would
make this report false.

### Outstanding, and who owns it

| Outstanding | Owner |
| --- | --- |
| Select a pilot customer and record the alias | Owner |
| Provision a non-production target, set `PENTEST_TARGET` | Owner |
| Engage an authorised security firm against the final candidate commit | Owner |
| 5 MEDIUM dependency advisories | routine dependency pass |

Discharged since the previous revision: the production-host CPU capability
(`SHARP_PLATFORM_BLOCKER=CLOSED`), by owner-supplied operational evidence.

The external penetration test must test the FINAL candidate commit, which is why
dependency remediation was completed first.

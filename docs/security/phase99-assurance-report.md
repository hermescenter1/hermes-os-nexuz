# Phase 99 — Assurance Report

**Status: INTERNAL READINESS COMPLETE. EXTERNAL GATES NOT MET. PHASE 99 IS NOT CLOSED.**

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
| HIGH | 12 | 7 | all 7 open are dependency advisories awaiting an owner decision |
| MEDIUM | 14 | 1 | |
| LOW | 4 | 0 | |

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

### Open findings

- **P99-INT-011 (MEDIUM, OPEN)** — an unbounded cross-tenant table scan reachable
  from the anonymous engineering-graph and operations endpoints. No data crosses
  the boundary (unpublished rows are filtered before the response), but every
  anonymous request loads all tenants' rows into memory. Not remediated here
  because bounding a shared repository changes what the derived graph contains,
  which is a product decision. Two candidate remediations are recorded.
- **P99-DEP-001..007 (HIGH, OPEN)** — see below.

---

## 3. Dependency review — owner decision required

`npm audit` reports **0 CRITICAL and 7 HIGH** advisories, 4 of them in the
production dependency tree (`next`, `postcss`, `sharp`, `fast-uri`). The
sanitized artifact is `docs/security/phase99-dependency-review.json`.

The lockfile was deliberately **not** changed. Three of the four production HIGH
advisories clear only by moving `next` across a major version, which is a product
decision with a regression surface far wider than a security-review branch, and
the phase brief forbids applying broad dependency upgrades automatically. Fixing
the remaining in-range advisories would reduce the count without changing the
gate outcome, so the lockfile stays untouched and the decision reaches the owner
as one reviewable change.

**Recommendation:** run `npm audit fix` (never `--force`) for the in-range
advisories in its own pull request with full validation, and evaluate the `next`
upgrade separately. Until then these remain open HIGH findings and therefore
release blockers — `RELEASE_BLOCKERS=7`.

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

---

## 7. Correct final state

```
PHASE_99_INTERNAL_READINESS_COMPLETE=YES
PHASE_99_EXTERNAL_GATES_COMPLETE=NO
PHASE_99_IMPLEMENTATION_COMPLETE=NO
PHASE_100_ALLOWED=NO
```

Phase 99 is complete as engineering work and incomplete as a phase. That is the
correct outcome, and converting any BLOCKED gate into PASS would make this report
false.

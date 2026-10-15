# API-CONTRACT-PROPOSAL.md

HFCC HTTP contract. Proposal only — no route file created.

---

## 1. VERSIONING AND SHAPE

```
/api/factory-connections/v1/...      control plane   (session)
/api/factory-intake/v1/...           intake plane    (invitation token)
```

Rationale for a `v1` segment: the industrial surface already learned this
lesson — FC1 had to introduce `/api/industrial/v2/*` alongside `v1` precisely
because the original contract could not be changed safely. HFCC starts
versioned.

**No existing route is modified.** The brief's rule *"no existing c1 API is
broken without an explicit decision"* is satisfied trivially: every HFCC route
is new. The one dependency on existing routes is that HFCC **calls** the Phase 94
credential lifecycle (`/api/ot/gateways/[id]/enrollment{,/rotate,/revoke}`)
rather than duplicating it — read-only reuse, no signature change.

All bodies and responses are validated with **Zod**, the repo's existing
validation system.

> **Zod trap, already paid for in this programme:** `zod` **strips unknown
> keys** by default. A test that posts an unexpected field and expects a
> rejection will pass for the wrong reason. Where HFCC must *refuse* unknown
> keys (every mutation body), schemas use `.strict()`, and there is a test that
> asserts an unknown key is rejected rather than silently dropped.

---

## 2. GUARD COMPOSITION — THE EXACT ORDER

Every control-plane handler runs this, in this order. The order is the security
property; reordering it creates leaks.

```ts
// 1. REFUSE AN API KEY *BEFORE ANY LOOKUP*  (the brief's explicit requirement)
//    Returns 401 session_required without touching the database, so a key
//    cannot be used to probe whether a resource exists.
refuseApiKeyCredential(req)

// 2. Authenticate the human session (HttpOnly cookie -> sid)
const session = await requireSession()                 // src/lib/auth/request-session.ts

// 3. Resolve the tenant SERVER-SIDE. Never from the request.
const organizationId = await resolveActiveOrganization(session.sid)
//    -> ActiveOrganizationSelection[sid], re-checking ACTIVE membership

// 4. Organization permission
requirePermission(membership.role, "manage_factory_connection")   // src/lib/org/rbac.ts

// 5. Load the resource SCOPED. findFirst({ where: { id, organizationId } }).
//    NEVER findUnique({ where: { id } }) then compare.
const request = await loadRequestScoped(id, organizationId)
if (!request) return notFound()                        // 404, not 403 -- existence leak

// 6. Site permission -- the SECOND, unrelated RBAC axis
await requireSitePermission(session.userId, request.siteId, "view_site")

// 7. Step-up, for credential/provisioning/sign-off operations only
await requireRecentAuth(session, { maxAgeSeconds: 300 })  // src/lib/auth/reauth.ts

// 8. Idempotency -- replay returns the ORIGINAL result, does not re-execute
const idem = await beginIdempotent(organizationId, session.userId, op, key, body)

// 9. Feature gate -- SERVER-SIDE, not just UI
assertFeatureEnabled("factoryConnectionCenter", { operation: op })

// 10. Execute inside ONE transaction; audit inside the SAME transaction
```

**Step 1 is the unusual one and it is deliberate.** Most platforms check "is
this credential allowed here?" after resolving it. The brief requires rejecting
an API key *before* lookup. Done properly this also closes a timing/existence
oracle: an industrial API key presented to a control-plane route gets an
identical, immediate `401` whether or not the named resource exists.

### Helper names — verified against `main`

| Needed | Confirmed location on `main` |
|---|---|
| `requirePermission` | `src/lib/org/rbac.ts:309` ✅ |
| `requireSitePermission` | `src/lib/site/rbac.ts:26` ✅ |
| `can(role, permission)` | `src/lib/org/rbac.ts:305` ✅ |
| `canOnSite(role, permission)` | `src/lib/site/rbac.ts:22` ✅ |
| `requireRecentAuth` | `src/lib/auth/reauth.ts:26` ✅ |
| `requireAuthoring`, `requireWritableOwner` | `src/lib/auth/api-guards.ts:29,74` ✅ |
| session / tenant resolution | `src/lib/auth/request-session.ts`, `current-user.ts`, `ActiveOrganizationSelection` ✅ |
| idempotency | `IdempotencyKey` model + `src/lib/ats/idempotency.ts` as precedent ✅ |
| safe errors | `src/lib/logger/safe-error.ts` ✅ |
| refusal codes | `src/lib/auth/refusal-vocabulary.ts` ✅ |
| correlation id | `src/lib/logger/correlation.ts` ✅ |
| security events | `src/lib/logger/security-events.ts` ✅ |
| rate limiting | `src/lib/auth/rate-limiter.ts` ✅ |

`requireActor` and `requireSiteActor` from the brief **do not exist under those
names**; the equivalents above are the ones to use.

> **Route-security inventory.** `docs/security/phase99-route-security-inventory.json`
> classifies every handler and `npm run security:phase99:inventory:check`
> enforces it. FC1 learned that **the classifier needs auth tokens visible in
> the handler body, or a registered composite guard**. HFCC therefore registers
> `requireFactoryConnectionSession` and `requireFactoryProvisioningSession` as
> named composite guard tokens, exactly as FC1 registered
> `requireCredentialManagementSession`, plus a lock test. Note this inventory
> file is **currently modified by the foreign HRIS session**.

---

## 3. PERMISSIONS — PROPOSED ADDITIONS TO `OrgPermission`

Following the catalogue's own stated principle (`src/lib/org/rbac.ts`:
`run_industrial_automation_org_wide` is *deliberately separate* from
`manage_industrial`, and that separation is what closed the Phase 99 defect),
HFCC splits four capabilities rather than reusing one:

```ts
| "view_factory_connection"      // read the dashboard
| "manage_factory_connection"    // create, invite, advance non-sensitive states
| "review_factory_security"      // security preflight verdict, release SECURITY_HOLD
| "provision_factory_gateway"    // issue credentials, build packages, REVOKE
| "execute_factory_fat"           // run FAT checks
| "approve_factory_fat"           // SIGN OFF a FAT  (step-up)
```

Proposed role matrix:

```
view_factory_connection    OWNER ADMIN MANAGER ENGINEER VIEWER
manage_factory_connection  OWNER ADMIN MANAGER
review_factory_security    OWNER ADMIN
provision_factory_gateway  OWNER ADMIN                 + step-up
execute_factory_fat        OWNER ADMIN MANAGER ENGINEER
approve_factory_fat        OWNER ADMIN                 + step-up, signer != operator
```

Rationale for the split that matters most: **`execute_factory_fat` and
`approve_factory_fat` are separate so that the person who ran the test cannot be
the person who signs it off.** T-14 additionally asserts
`signedById !== operatorUserId` at the database level. A single
`manage_factory_fat` permission would make that unenforceable.

`manage_gateway_credentials` (FC1's permission) is **not on `main`**;
`provision_factory_gateway` is HFCC's Tier-A equivalent. If FC1 lands, the two
should be reconciled rather than coexist — **OD-B**.

A permission-matrix lock test is required (precedent:
`src/lib/auth/__tests__/api-platform-permissions.test.ts`).

---

## 4. CONTROL PLANE

All routes below are prefixed `/api/factory-connections/v1`.
`P` = permission, `S` = step-up required.

| Method | Path | P | S | Notes |
|---|---|---|---|---|
| GET | `/requests` | view | — | **paginated, cursor-based, hard max 100.** No unbounded list. |
| POST | `/requests` | manage | — | T-01. Idempotent. |
| GET | `/requests/{id}` | view | — | 404 cross-tenant |
| GET | `/requests/{id}/overview` | view | — | the Overview aggregate (§6) |
| POST | `/requests/{id}/transitions` | varies | varies | **the only state-changing route** (§5) |
| GET | `/requests/{id}/transitions` | view | — | the hash chain, paginated |
| GET | `/requests/{id}/transitions/verify` | view | — | recompute + verify the chain |
| GET/PUT | `/requests/{id}/contacts` | manage | — | |
| GET/PUT | `/requests/{id}/network-profile` | manage | — | |
| GET/POST | `/requests/{id}/data-sources` | manage | — | non-OPC-UA config → `422` |
| GET/PUT | `/requests/{id}/data-sources/{dsId}/opcua` | manage | — | **rejects any credential-shaped field** |
| GET/POST | `/requests/{id}/certificates` | manage | — | fingerprint normalised server-side |
| POST | `/requests/{id}/invitations` | manage | — | T-02. Returns the token **once**. |
| GET | `/requests/{id}/invitations` | manage | — | never returns a token or hash |
| POST | `/requests/{id}/invitations/{invId}/revoke` | manage | — | |
| POST | `/requests/{id}/tag-imports` | manage | — | multipart. **PREVIEW only** — persists nothing but the import row. |
| GET | `/requests/{id}/tag-imports/{impId}` | view | — | status + capped row errors |
| POST | `/requests/{id}/tag-imports/{impId}/commit` | manage | — | **atomic**, idempotent |
| POST | `/requests/{id}/tag-imports/{impId}/rollback` | manage | — | whole-import rollback |
| GET | `/requests/{id}/tags` | view | — | paginated |
| POST | `/requests/{id}/packages` | provision | **YES** | T-08. Build + seal. Refused under `QUALIFICATION_HOLD`. |
| GET | `/requests/{id}/packages` | provision | — | metadata + manifest hash only |
| GET | `/requests/{id}/packages/{pkgId}/manifest` | provision | — | the manifest, for verification |
| POST | `/requests/{id}/packages/{pkgId}/download` | provision | **YES** | records the receipt, then streams |
| POST | `/requests/{id}/connectivity-runs` | manage | — | enqueues; `executionMode` **server-set** |
| GET | `/requests/{id}/connectivity-runs` | view | — | paginated |
| GET | `/requests/{id}/connectivity-runs/{runId}` | view | — | structured results only |
| GET | `/requests/{id}/shadow` | view | — | current session + server-computed stats |
| GET | `/requests/{id}/shadow/quarantine` | view | — | paginated |
| POST | `/requests/{id}/fat-runs` | execute | — | T-13 |
| GET | `/requests/{id}/fat-runs/{runId}` | view | — | three-way split, never merged |
| PATCH | `/requests/{id}/fat-runs/{runId}/checks/{checkId}` | execute | — | refused once `sealedAt` is set |
| POST | `/requests/{id}/fat-runs/{runId}/sign` | approve | **YES** | T-14. All-PASS + all-FACTORY + signer≠operator |
| GET | `/requests/{id}/evidence` | view | — | paginated |
| POST | `/requests/{id}/evidence` | manage | — | upload; sealed on creation for measured kinds |
| GET | `/requests/{id}/evidence/{artId}/download` | view | — | `Content-Disposition: attachment`, `nosniff` |
| POST | `/requests/{id}/evidence-pack` | manage | — | generate the handover bundle |

### Credential lifecycle — delegated, not duplicated

```
POST   /api/ot/gateways/{id}/enrollment          issue    (exists, Phase 94)
POST   /api/ot/gateways/{id}/enrollment/rotate   rotate   (exists)
POST   /api/ot/gateways/{id}/enrollment/revoke   revoke   (exists)
```

HFCC's UI drives these. It adds **no** new credential route. Owner decision
**D-7** (revoke the API key on every REVOKED path) is honoured there, and HFCC's
`T-21` asserts it.

---

## 5. THE TRANSITION ROUTE — WHY IT TAKES A TRANSITION ID

```http
POST /api/factory-connections/v1/requests/{id}/transitions
Idempotency-Key: 01J...
Content-Type: application/json

{ "transitionId": "T-12",
  "reason": "Shadow window complete: 72 h, zero open blockers.",
  "expectedStateVersion": 7 }
```

```jsonc
// 200
{ "requestId": "...", "previousState": "SHADOW_COLLECTING",
  "nextState": "FAT_PENDING", "stateVersion": 8,
  "transition": { "sequence": 12, "auditHash": "9f2c...", "occurredAt": "2026-10-05T09:14:22Z" } }
```

Three properties:

1. **The client names a transition, never a target state.** It is structurally
   impossible to request an illegal state, because states are not part of the
   input vocabulary. An unknown `transitionId` is `422`.
2. `reason` is **mandatory** — the brief requires it on every transition, and a
   nullable column would make it optional in practice.
3. `expectedStateVersion` is the optimistic lock. A mismatch is
   `409 state_conflict`, which is what makes two simultaneous operators produce
   exactly one transition (test `S-07`, on real PostgreSQL).

---

## 6. OVERVIEW RESPONSE — HOLD IS NOT A LOW SCORE

```jsonc
// GET /requests/{id}/overview
{
  "readiness": {
    // When held, `score` is ABSENT -- not zero, not low. The client cannot
    // render a number because it was not given one.
    "state": "HOLD",
    "blockers": [
      { "code": "FCC-SEC-003", "severity": "BLOCKER", "category": "SECURITY",
        "summary": "Anonymous OPC UA access not confirmed disabled" }
    ]
  },
  "completeness": { "profile": 100, "network": 100, "dataSources": 80, "tags": 100 },
  "securityPreflight": { "state": "SECURITY_HOLD", "lastRunAt": "..." },
  "gateway":   { "state": "INSTALLED", "streamIdIssued": true, "lastSeenAt": "..." },
  "collector": { "state": "UNKNOWN", "reason": "NO_REPORT_RECEIVED" },
  "relay":     { "state": "CONNECTED", "queueDepth": 142, "backpressure": false },
  "connection":{ "state": "DETECTED", "executionMode": "SIMULATOR" },
  "shadow":    { "state": "COLLECTING",
                 "lastTelemetryAt": "2026-10-05T09:12:00Z",
                 "freshness": "LIVE",          // SERVER-COMPUTED from receivedAt
                 "provenance": "SIMULATED",    // never LIVE-eligible
                 "lagMs": 1840,
                 "counters": { "accepted": 10234, "duplicate": 3, "outOfOrder": 1,
                               "quarantined": 0, "bad": 12, "stale": 0, "replay": 0,
                               "unknownProvenance": 0 } },
  "dataQuality": { "goodPct": 99.1, "badPct": 0.9, "windowMinutes": 60 },
  "fat": { "runNumber": null, "pass": 0, "fail": 0, "notRun": 24, "notMeasured": 0,
           "byMode": { "SIMULATOR": {...}, "LAB": {...}, "FACTORY": {...} } },
  "lastAuditEvent": { "transitionId": "T-11", "occurredAt": "...", "actorKind": "SYSTEM" },
  "featureGate": { "state": "QUALIFICATION_HOLD",
                   "disabledOperations": ["buildPackage","realConnectivity",
                                          "fatApproval","factoryReadyVerdict"],
                   "reasonCode": "FCC_QUALIFICATION_HOLD" }
}
```

Note three things the shape enforces rather than requests:

- `readiness.score` is **absent** while held. The client has nothing to average.
- `fat.byMode` is three separate objects. There is no total field, so the client
  cannot render one.
- `shadow.freshness` and `shadow.provenance` are **server verdicts**, not raw
  inputs. The client cannot recompute `LIVE`.

---

## 7. INTAKE PLANE

```
/api/factory-intake/v1/...
```

| Method | Path | Notes |
|---|---|---|
| GET | `/session` | validate the token; returns the **scope only** — site name, required sections, expiry. Never the tenant's other data. |
| GET | `/draft` | the intake's own draft |
| PUT | `/draft` | T-03. Partial save. Rate-limited. |
| POST | `/tag-list` | multipart; PREVIEW only |
| POST | `/tag-list/{id}/commit` | atomic commit, scoped by token |
| POST | `/documents` | network diagram + permitted documents |
| POST | `/submit` | T-04. **Server-side completeness check.** Single-use. |

Token transport: `Authorization: Bearer <token>`, **not** a query string. The
invitation URL carries it in the **fragment** so it never reaches the server log,
a Referer header or an analytics pipeline; the client reads the fragment and
sends it as a header.

**Everything the intake plane cannot do:**

- cannot read any dashboard route (middleware excludes `/factory-intake` from
  the authenticated shell entirely)
- cannot read another `requestId`, `siteId` or tenant — the scope comes from the
  token row, never from a parameter
- cannot advance any state other than T-03 / T-04
- cannot issue credentials, build packages, run connectivity, touch FAT or
  evidence
- cannot enumerate: there is no list endpoint on this plane at all

Rate limits: per IP (`X-Real-IP` **only** — never `X-Forwarded-For`) and per
`tokenPrefix`. Lockout on repeated invalid tokens, recorded via
`security-events.ts`.

---

## 8. ERROR CONTRACT

```jsonc
{ "error": { "code": "factory_state_conflict",
             "message": "<safe, translated, no internals>",
             "correlationId": "01J..." } }
```

| Code | HTTP | When |
|---|---|---|
| `session_required` | 401 | an API key was presented (refused **pre-lookup**) |
| `unauthenticated` | 401 | no session |
| `recent_auth_required` | 401 | step-up needed; carries `maxAgeSeconds` |
| `forbidden` | 403 | in-tenant, insufficient role |
| `not_found` | 404 | absent **or cross-tenant** — indistinguishable by design |
| `factory_state_conflict` | 409 | `stateVersion` mismatch / concurrent transition |
| `invitation_spent` | 409 | already submitted |
| `org_precondition_required` | 428 | no active organization selected |
| `validation_failed` | 422 | Zod failure; field paths, never values |
| `protocol_not_implemented` | 422 | Modbus / S7 / MQTT config attempted |
| `transition_not_permitted` | 422 | the edge does not exist for this state |
| `qualification_hold` | 423 | the feature gate forbids this operation |
| `rate_limited` | 429 | with `Retry-After` |
| `upstream_unavailable` | **503** | **a database/dependency outage — NEVER 401** |

> **`503` vs `401` is a plant-availability control, not a nicety.** FC1 finding
> **F-020**: the shared `verifyApiKey` has `catch { return null }`, so a DB
> outage answered `401 invalid_api_key`; the relay **HALTS on 401** until its
> credential changes, so the data path stayed dead *after* the database
> recovered. Every HFCC ingest-adjacent route must distinguish them: `401` only
> for a credential that is genuinely wrong, `503` when the lookup itself could
> not be performed. The shared helper stays untouched (`OI-FC1-16`).

**Never in any response:** stack traces, Prisma/driver text, SQL, secrets,
unpublished records, another tenant's data, raw file paths, internal hostnames.
`src/lib/logger/safe-error.ts` is the mechanism.

---

## 9. RESPONSE HEADERS

```
Cache-Control: no-store                      (every authenticated response)
X-Content-Type-Options: nosniff
Content-Disposition: attachment; filename="<normalised>"   (downloads)
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY  +  CSP frame-ancestors 'none'
```

> **CSP note, measured in this repo:** CSP must be set on **request** headers
> or Next skips its automatic nonce handling (`provenexpert-seal-and-pnpm-build`).
> HFCC introduces **no inline script and no inline style**, so it needs no
> relaxation of the existing policy — a hard requirement, since the brief
> demands CSP compatibility and a topology visualisation is the obvious place an
> inline `<style>` sneaks in.

> `X-Frame-Options: DENY` is already in force and **blocks an iframe-based test
> harness** (measured in the FC1 browser gate). Browser tests must drive the
> page directly, not embed it.

---

## 10. IDEMPOTENCY AND REPLAY

- Every mutation accepts `Idempotency-Key` (required on POST, optional on PATCH).
- Keyed on `(organizationId, operation, keyHash)` in the existing
  `IdempotencyKey` model, with `payloadHash` stored.
- Same key **+ same payload** → the original result, no re-execution.
- Same key **+ different payload** → `409`, not a silent overwrite. This is the
  control that makes an idempotency key a safety mechanism rather than a cache.
- Keys expire via `expiresAt` (swept).
- Gateway envelope replay protection reuses `GatewayEnvelopeNonce`
  (`@@unique([gatewayId, nonce])`) — already on `main`.

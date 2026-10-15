# FACTORY-CONNECTION-CENTER-ARCHITECTURE.md

HFCC — target architecture. Phase 0 design only; nothing implemented.

---

## 1. THE ONE INVARIANT

> **The browser never connects to a PLC, SCADA or OPC UA server.
> Nothing in Hermes ever writes to a PLC. No setpoint is ever changed.**

This is not a UI rule. It is enforced at four independent layers, so that
defeating any one of them still fails closed:

| Layer | Enforcement |
|---|---|
| Schema | `EdgeGatewayProfile.readOnlyMode Boolean @default(true)` — already on `main`, schema comment: *"readOnlyMode is an invariant of this phase: no control path exists at all"* |
| Code | No write/command opcode exists in `src/lib/ot-edge` or `src/lib/industrial`. HFCC adds none. `AutomationTag` comment: *"Carries no value and cannot write to a device."* |
| Network | Northbound is **outbound HTTPS 443 only**. CORE never dials into the plant; it has no inbound route to OT. |
| Collector | The OT Collector is a read-only OPC UA client. The brief's "no-write proof" is a mandatory connectivity check (§5, test `C-17`). |

The Digital Twin section of the schema states the same invariant for the
analysis layer: *"Digital Twin and Brain integration must NEVER create, suggest,
or expose direct PLC control commands."*

---

## 2. TOPOLOGY

```
┌─ PLANT (OT) ────────────────────────────────────────────────────────────┐
│                                                                          │
│   PLC / SCADA / Historian                                                │
│        │  OPC UA  (read-only session, signed+encrypted)                  │
│        │  credentials entered ONLY here, never leave the plant           │
│        ▼                                                                 │
│   OT COLLECTOR            (Ubuntu, systemd, read-only)                   │
│        • node-opcua client, subscription + polled read                   │
│        • local spool (SQLite), survives WAN outage                       │
│        • holds the OPC UA credential + client certificate                │
│        • holds NO Hermes credential                                      │
│        │                                                                 │
│        │  localhost / plant-internal, one-way push                       │
│        ▼                                                                 │
├─ DMZ ───────────────────────────────────────────────────────────────────┤
│   DMZ RELAY                                                              │
│        • the ONLY place a Hermes credential exists on site               │
│        • cannot reach the PLC; cannot read the OPC UA credential         │
│        • backpressure, batching, retry, quarantine                       │
│        │                                                                 │
│        │  OUTBOUND HTTPS 443 ONLY  (no inbound firewall rule, ever)      │
│        ▼                                                                 │
└─ INTERNET ──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ HERMES CORE ───────────────────────────────────────────────────────────┐
│   Cloudflare edge  →  Nginx  →  Next.js App Router                       │
│        /api/industrial/*        ingest, heartbeat                        │
│        /api/ot/gateways/*       credential lifecycle (Phase 94, exists)  │
│        /api/factory-connections/*   HFCC control plane  (NEW)            │
│        /api/factory-intake/*        HFCC intake plane   (NEW)            │
│                     │                                                    │
│          PostgreSQL ┴ Redis                                              │
│                     │                                                    │
│   Operational Dashboard  /[locale]/dashboard/...                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Credential separation — the core security property

| Secret | Lives on | Reaches Hermes CORE? | Reaches HTML / RSC / log / audit? |
|---|---|---|---|
| OPC UA username / password | **OT Collector only** | **never** | **never** |
| OPC UA client private key | **OT Collector only** | **never** | **never** |
| OPC UA server cert **fingerprint** | Collector + Hermes | yes (a hash, not a secret) | yes — it is public material |
| Hermes gateway credential | **DMZ Relay only** | issued by Hermes, shown **once** | **never** after issuance |

This separation is *already enforced by the platform*, not merely promised:
`src/lib/ot-edge/secret-manager.ts` is **resolve-only — Hermes has no writable
secret store** (`ot-no-writable-secret-store`). Hermes is architecturally
incapable of persisting a factory's OPC UA password.

---

## 3. THE FIVE PLANES

HFCC is deliberately split so that a compromise of the low-trust plane cannot
reach the high-trust one.

| Plane | Audience | Auth | Writes |
|---|---|---|---|
| **1. Intake** | plant OT engineer, external | single-use expiring invitation token, **no Hermes account**, **no dashboard access** | only its own `FactoryIntegrationRequest` draft |
| **2. Control** | OWNER / ADMIN / integration team | session + org membership + permission | all HFCC state transitions |
| **3. Credential** | OWNER / ADMIN only | session + permission + **`requireRecentAuth` step-up** | gateway credentials, provisioning packages |
| **4. Ingest** | the DMZ Relay (a machine) | gateway credential, **no human session** | telemetry + heartbeat only; **cannot** read or change HFCC state |
| **5. Evidence** | auditors, owner | session + permission | **append-only**; nothing can mutate a sealed artifact |

**Rule: no plane may be reached from a lower one.** Specifically:

- An intake token can never read the dashboard, another site, or any other
  tenant (§4).
- An **API key is refused before lookup** on every HFCC control-plane route —
  the brief's requirement. Implementation: the guard inspects the credential
  *kind* and returns `401 session_required` **before** any database read, so a
  key cannot even be used to probe for the existence of a resource.
- The ingest plane cannot advance the state machine. A gateway reporting
  telemetry **produces an observation**; only the server, evaluating that
  observation under a server-side rule, advances `CONNECTION_DETECTED` →
  `SHADOW_COLLECTING`.

---

## 4. TENANCY AND ISOLATION

**Tenant resolution** uses the existing server-side mechanism and nothing else:

```
session (HttpOnly cookie)
   -> sid (server-issued session row id)
   -> ActiveOrganizationSelection[sid]      // "a pointer, never a grant"
   -> re-check ACTIVE membership on EVERY request
   -> organizationId
```

A client-supplied `organizationId`, `userId`, `siteId` or role is **never**
trusted — in a body, a query string, a header or a JWT claim.

**Filtering happens at the database query level**, not after the fetch. Every
HFCC model carries `organizationId`, every unique constraint is composite with
it, and every lookup is `findFirst({ where: { id, organizationId } })` — never
`findUnique({ where: { id } })` followed by a check.

**Information-leak rule:** where revealing that an inaccessible resource exists
would itself be a leak, HFCC answers **404**, not 403. Concretely:

- cross-tenant `factorySiteId` → **404**
- in-tenant resource, insufficient role → **403**
- in-tenant, sufficient role, stale tenant precondition → **428 / 409** reusing
  the existing `errors.resource.orgPrecondition` / `orgConflict` copy

**Site-level isolation** is a second axis. `requireSitePermission`
(`src/lib/site/rbac.ts:26`) already exists; an org ADMIN without access to
site *B* must not see site *B*'s factory connection. Note from Phase 94C1:
**there are two unrelated RBAC axes** (org and site) — HFCC checks both, in that
order, and both fail closed.

---

## 5. CONNECTIVITY — WHO ACTUALLY RUNS THE TESTS

The browser runs **none** of them. The flow is strictly:

```
Operator clicks "Run checks"  (control plane, session + permission)
   -> CORE records a ConnectivityCheck row, status QUEUED, with a correlationId
   -> the DMZ Relay PULLS the job on its next outbound poll
         (CORE never pushes; there is no inbound path)
   -> the Collector executes the checks against OPC UA, read-only
   -> the Relay POSTs a STRUCTURED RESULT back over outbound HTTPS 443
   -> CORE validates, stores, and renders the result
```

The UI renders only the structured result. It never receives a raw socket, a
stack trace, or the endpoint's credentials.

### Check catalogue (the brief's list, as server-defined check ids)

```
C-01 DNS / IP reachability        C-10 NodeId read
C-02 TCP connect                  C-11 source timestamp present
C-03 TLS handshake                C-12 server timestamp present
C-04 certificate fingerprint      C-13 OPC UA quality code
C-05 OPC UA discovery             C-14 NTP offset within tolerance
C-06 security-policy negotiation  C-15 retry behaviour
C-07 anonymous access DISABLED    C-16 reconnect after induced drop
C-08 read-only user confirmed     C-17 NO-WRITE PROOF
C-09 namespace discovery          C-18 outbound HTTPS relay reachability
                                  C-19 heartbeat round trip
```

### The SIMULATOR / MOCK rule — enforced in the data model, not the UI

Until a real adapter exists, every result carries a server-set, **non-nullable**

```prisma
executionMode  ConnectivityExecutionMode   // SIMULATOR | LAB | FACTORY
```

and the rules are absolute:

1. `executionMode` is **set by the server from the gateway's own declared
   profile** (`EdgeGatewayProfile.simulatorMode`), never from the request body.
2. **No `SIMULATOR` or `LAB` result may ever be rendered as a FACTORY PASS.**
   The readiness computation treats a non-`FACTORY` result as *not satisfied*.
3. The "run real checks" control is **disabled** while no real adapter is
   registered, and states the HOLD reason inline.
4. `FAT` results carry the same three-way split and **are never merged**
   (`STATE-MACHINE.md` §6).

This is the direct application of a lesson already paid for in this programme:
*a mock `fetch` is a FAKE Response* (Phase 95), and *a rendered empty branch is
not a reachable state* (Gate B.1). A simulated PASS that looks like a real PASS
is the same class of defect, with plant consequences.

---

## 6. SHADOW MODE AND PROVENANCE

Shadow Mode means: **data flows in, nothing flows out.** No command, no setpoint,
no write — the platform has no code path for one.

### Provenance is server-determined. Always.

```
client-sent `source`  ──X──>  provenance        (D-2: NEVER)
server evidence       ─────>  provenance
```

| Provenance | Meaning | May display as LIVE? |
|---|---|---|
| `FACTORY_VERIFIED` | v2 contract, verified gateway credential, server-evidenced | **yes** |
| `LAB` | lab gateway | no |
| `SIMULATED` | simulator | no |
| `REPLAY` | received now, measured long ago — a backfill | **never** |
| `ORIGIN_UNVERIFIED` | legacy row, no server evidence | **never** |
| `UNKNOWN` | default | **never** — and **never upgraded** |

Owner decision **D-5** (APPROVED) governs the last two rows: a legacy row
without server evidence is `UNKNOWN`, shown as *"origin not verified"*, `source`
never upgrades it, **there is no backfill**, and c1 is unchanged.

### Freshness is a server contract, not a client computation

Both freshness and "latest" derive from `receivedAt` (server-set), never
`timestamp` (gateway-reported, untrusted). This is why `REPLAY` must exist at
all: without it, a post-outage backfill renders three-hour-old plant values as
LIVE. The FC1 lane changed exactly those tests under D-5.

Lag, staleness and quality thresholds are server-side constants, exposed to the
client as *already-computed state*, never as inputs the client may recompute or
override.

Displayed Shadow Mode states: `LIVE`, `STALE`, `BAD`, `UNKNOWN`,
`DISCONNECTED`, `QUARANTINED`, `REPLAY`. Duplicate and out-of-order arrivals are
counted and shown; they are not silently discarded.

---

## 7. FC1 INTEGRATION — EXPLICITLY OPTIONAL

Per `REPOSITORY-BASELINE.md` §4, **FC1 is not in any branch**. HFCC is therefore
designed in two tiers:

| Tier | Requires FC1? | What it gives |
|---|---|---|
| **A — baseline** | **no** | The entire HFCC control plane, intake portal, state machine, tag import, provisioning workflow, FAT workspace, evidence pack. Uses `main`'s existing `IndustrialGateway`, `EdgeGatewayProfile` enrollment, `TelemetryRecord`, `AuditLog`, `IdempotencyKey`. |
| **B — FC1 layer** | **yes** | v2 ingest contract, JCS digests, `GatewayCredentialBinding` (overlapping key rotation), server-assigned `REPLAY`, sequence/stream semantics, `manage_gateway_credentials`, DB-level `(gateway, sequenceId)` dedup. |

**Tier A is the deliverable.** Tier B is an upgrade that becomes available only
if the owner lands FC1 on `main` through its own review.

Where Tier B is absent, Tier A must degrade **honestly, not silently**:

- Without FC1's dedup constraint, duplicates are *detected and displayed*, not
  claimed to be impossible.
- Without `GatewayCredentialBinding`, rotation is **single-slot** (one
  `apiKeyId`) and the UI says so: rotation has a cutover, not an overlap window.
- Without server-assigned `REPLAY`, HFCC computes `REPLAY` in its own read
  contract from `receivedAt` vs `timestamp` and labels it the same way.

Each degradation is a UI-visible statement of limitation, never a silent
downgrade of a safety claim.

---

## 8. FEATURE GATING — `QUALIFICATION HOLD`

Everything HFCC ships is behind a feature flag, following the existing precedent
`src/lib/ats/acceptance-flag.ts` and `src/lib/billing/feature-gate.ts`.

The flag has **three** states, not two:

```
OFF                 route returns 404; nothing is advertised
QUALIFICATION_HOLD  UI renders, every dangerous control is DISABLED with its
                    HOLD reason stated inline; server REFUSES the operation too
ENABLED             only after the owner's formal verdict
```

Disabled under `QUALIFICATION_HOLD`, **server-side as well as in the UI**:

- production gateway provisioning (package build and download)
- real connectivity execution (`executionMode = FACTORY`)
- FAT approval / sign-off
- any factory-ready verdict

**Forbidden strings.** The tokens `FACTORY_READY`, `PILOT_READY`,
`DEPLOY_READY`, `PRODUCTION_READY` must not appear in any rendered surface
without a formal owner ruling. This is enforced by a **repository gate test**
that greps the built output and the i18n catalogues, not by reviewer discipline
— the same technique the German gates already use.

> A disabled button is not a gate. Every HOLD is enforced at the route handler;
> the UI state merely reflects it. This is the Gate A lesson: *never let
> "pre-existing / out of scope" excuse an unenforced boundary.*

---

## 9. READINESS SCORE — WHY IT IS NOT AN AVERAGE

The brief: *"the readiness score must not hide a security blocker behind an
average; a blocker must force HOLD."*

The computation is therefore **two-stage and non-commutative**:

```
Stage 1 — BLOCKERS (boolean, fail-closed)
   any open security blocker           -> HOLD
   security preflight not PASSED       -> HOLD
   read-only not confirmed             -> HOLD
   MOC not confirmed                   -> HOLD
   certificate untrusted / expired     -> HOLD
   any connectivity result not FACTORY -> HOLD  (while in QUALIFICATION_HOLD)
   => if ANY is true: score is NOT DISPLAYED AS A NUMBER. State = HOLD.

Stage 2 — COMPLETENESS (only reachable when stage 1 is clear)
   a percentage over declared, weighted sections
```

A HOLD **replaces** the score; it does not reduce it. The UI shows the blocker
list where the number would be. There is no arithmetic path from "one security
blocker + everything else perfect" to a high score.

---

## 10. ERROR AND DISCLOSURE POLICY

- No stack traces, no Prisma errors, no driver text reaches a client.
  `src/lib/logger/safe-error.ts` already exists and is the mechanism.
- Refusals use the existing `src/lib/auth/refusal-vocabulary.ts` so codes stay
  consistent across the platform.
- **A DB outage is 503, not 401.** (FC1 F-020: a 401 permanently halts a relay;
  a 503 is retried. Getting this backwards kills the data path *after* the
  database recovers.)
- `security-events.ts` receives every authorisation refusal, with
  `correlationId`.
- Unpublished / draft records are invisible to anyone outside the tenant.

---

## 11. WHAT THIS ARCHITECTURE DELIBERATELY DOES NOT DO

- It does not introduce a new framework, database, ORM, auth system, state
  library or UI framework.
- It does not write to a PLC, and adds no code path that could.
- It does not store any factory OPC UA secret, anywhere, at any time.
- It does not re-implement the gateway credential lifecycle — Phase 94's
  `/api/ot/gateways/[id]/enrollment/*` already exists and is driven, not
  replaced.
- It does not replace `AuditLog`, `IdempotencyKey`, the RBAC helpers or the
  design system.
- It does not create a second gateway table, a seventh tag table, or a parallel
  import pipeline.
- It does not change ports, firewall rules, SSH, TLS, DNS or proxy routing.
- It does not claim any readiness verdict the owner has not issued.

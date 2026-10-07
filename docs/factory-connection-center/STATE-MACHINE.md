# STATE-MACHINE.md

HFCC integration-request lifecycle. **Server-enforced.** Phase 0 design only.

---

## 1. STATES

The brief's 16 states, as a Prisma enum:

```prisma
enum FactoryIntegrationState {
  DRAFT
  AWAITING_FACTORY_INPUT
  FACTORY_INPUT_COMPLETE
  SECURITY_PREFLIGHT
  SECURITY_HOLD
  PACKAGE_READY
  GATEWAY_INSTALLED
  CONNECTION_DETECTED
  SHADOW_COLLECTING
  FAT_PENDING
  FAT_RUNNING
  FAT_PASSED
  FAT_FAILED
  SUSPENDED
  REVOKED
  HOLD
}
```

**Classification** (this matters for what each state permits):

| Class | States | Property |
|---|---|---|
| Progressive | `DRAFT` → … → `FAT_PASSED` | advance only through the declared edges |
| Blocking | `SECURITY_HOLD`, `HOLD`, `SUSPENDED` | reachable from almost anywhere; nothing progresses while held |
| Failure | `FAT_FAILED` | re-enterable into `FAT_PENDING` after remediation |
| Terminal | `REVOKED` | **absorbing — no outgoing edge at all** |

---

## 2. TRANSITION TABLE

`T-nn` is the transition id used in audit rows, tests and mutation testing.
Every row's actor is a **human session** unless marked `system`.

| id | from | to | trigger | required capability | step-up | guards (ALL must hold) |
|---|---|---|---|---|---|---|
| T-01 | — | `DRAFT` | create connection | `manage_factory_connection` | no | site in tenant; site not already having an active request |
| T-02 | `DRAFT` | `AWAITING_FACTORY_INPUT` | issue invitation | `manage_factory_connection` | no | ≥1 `FactoryContact`; invitation TTL ≤ policy max |
| T-03 | `AWAITING_FACTORY_INPUT` | `AWAITING_FACTORY_INPUT` | intake saves a draft | intake token | no | token valid, unexpired, unrevoked, unused-as-final, matches `(org, site)` |
| T-04 | `AWAITING_FACTORY_INPUT` | `FACTORY_INPUT_COMPLETE` | intake submits | intake token | no | **server-side** completeness: all required sections present; read-only confirmed; MOC confirmed; ≥1 data source; tag import committed |
| T-05 | `FACTORY_INPUT_COMPLETE` | `SECURITY_PREFLIGHT` | start preflight | `manage_factory_connection` | no | network profile present; certificate record present |
| T-06 | `SECURITY_PREFLIGHT` | `SECURITY_HOLD` | preflight fails / reviewer rejects | `review_factory_security` | no | ≥1 blocker recorded with a reason |
| T-07 | `SECURITY_HOLD` | `SECURITY_PREFLIGHT` | blockers resolved, re-run | `review_factory_security` | no | every blocker has a resolution record |
| T-08 | `SECURITY_PREFLIGHT` | `PACKAGE_READY` | preflight passes **and** package built | `provision_factory_gateway` | **YES** | zero open blockers; `FeatureGate = ENABLED`; `GatewayPackage` sealed with manifest + SHA-256 |
| T-09 | `PACKAGE_READY` | `GATEWAY_INSTALLED` | operator confirms installation | `manage_factory_connection` | no | package `downloadedAt` is set (a download receipt exists) |
| T-10 | `GATEWAY_INSTALLED` | `CONNECTION_DETECTED` | `system` — first authenticated heartbeat | — | — | heartbeat verified against the issued credential; `executionMode` recorded; **never advanced by a client assertion** |
| T-11 | `CONNECTION_DETECTED` | `SHADOW_COLLECTING` | `system` — first accepted telemetry | — | — | ≥1 `TelemetryRecord` for this gateway with server-set `receivedAt`; a `ShadowSession` is opened |
| T-12 | `SHADOW_COLLECTING` | `FAT_PENDING` | operator declares shadow sufficient | `manage_factory_connection` | no | shadow window ≥ policy minimum; zero open blockers |
| T-13 | `FAT_PENDING` | `FAT_RUNNING` | start FAT run | `execute_factory_fat` | no | operator **and** witness both identified and distinct |
| T-14 | `FAT_RUNNING` | `FAT_PASSED` | sign off | `approve_factory_fat` | **YES** | **every** check is `PASS`; zero `FAIL` / `NOT_RUN` / `NOT_MEASURED`; every check `executionMode = FACTORY`; signer ≠ operator; `FeatureGate = ENABLED` |
| T-15 | `FAT_RUNNING` | `FAT_FAILED` | ≥1 check fails or run abandoned | `execute_factory_fat` | no | reason recorded |
| T-16 | `FAT_FAILED` | `FAT_PENDING` | remediate and retry | `manage_factory_connection` | no | remediation note recorded; previous run sealed immutably |
| T-17 | *any non-terminal* | `SUSPENDED` | suspend | `manage_factory_connection` | no | reason recorded |
| T-18 | `SUSPENDED` | *the state it was suspended from* | resume | `manage_factory_connection` | no | `resumeTo` was captured at suspension and is still a legal state |
| T-19 | *any non-terminal* | `HOLD` | administrative hold | `manage_factory_connection` | no | reason recorded |
| T-20 | `HOLD` | *the state it was held from* | release | `review_factory_security` | no | as T-18 |
| T-21 | *any state* | `REVOKED` | revoke | `provision_factory_gateway` | **YES** | reason recorded; **every credential revoked on this path (owner decision D-7)**; gateway marked revoked |

**Edges that deliberately do not exist** (each is a negative test, `N-nn`):

```
N-01  DRAFT                 -> PACKAGE_READY          (skips factory input + security)
N-02  FACTORY_INPUT_COMPLETE-> PACKAGE_READY           (skips security preflight)
N-03  SECURITY_HOLD         -> PACKAGE_READY           (ships while held)
N-04  GATEWAY_INSTALLED     -> FAT_PASSED              (skips connection + shadow + FAT)
N-05  SHADOW_COLLECTING     -> FAT_PASSED              (skips the FAT run itself)
N-06  FAT_FAILED            -> FAT_PASSED              (launders a failure)
N-07  REVOKED               -> anything                (REVOKED is absorbing)
N-08  any                   -> CONNECTION_DETECTED     by a human     (system-only)
N-09  any                   -> SHADOW_COLLECTING       by a human     (system-only)
N-10  any                   -> FAT_PASSED              while FeatureGate != ENABLED
```

---

## 3. ENFORCEMENT — WHERE THE MACHINE ACTUALLY LIVES

```
src/lib/factory-connection/state-machine.ts     pure, no I/O, exhaustively typed
src/lib/factory-connection/transitions.ts       guards + the transactional applier
```

Four rules make UI-only bypass impossible:

1. **A single server-side applier.** No route handler writes `state` directly.
   Every change goes through `applyTransition(requestId, transitionId, ctx)`.
   A repository gate test asserts that `state:` appears in no HFCC
   `prisma.*.update` call outside `transitions.ts`.
2. **Transitions are named, not inferred.** The client posts a *transition id*
   (`T-12`), never a target state. An unknown id is `422`. A client cannot name
   a state at all, so it cannot name an illegal one.
3. **The guard runs server-side from server data.** No guard input comes from
   the request body. Completeness (T-04), "every check PASS" (T-14) and "zero
   open blockers" (T-08) are all recomputed from the database inside the
   transaction.
4. **Exhaustive typing.** The transition table is a `const` record keyed by a
   union of `from` states; TypeScript's exhaustiveness checking makes an
   unhandled state a compile error, not a runtime fallthrough.

### Atomicity and concurrency

Every transition runs in **one** `prisma.$transaction`:

```
1  SELECT the request FOR UPDATE, scoped (id, organizationId)
2  assert currentState === transition.from        -- optimistic guard
3  evaluate every guard against server data
4  UPDATE state, stateVersion = stateVersion + 1
5  INSERT FactoryStateTransition (hash-chained, see §4)
6  INSERT AuditLog (action, outcome, correlationId)
7  COMMIT
```

Concurrency controls:

- `stateVersion Int` — an optimistic-lock column. A second concurrent
  transition sees a changed version and is refused `409 state_conflict`.
- The `SELECT ... FOR UPDATE` serialises same-row contenders.
- **Two operators clicking the same transition simultaneously must produce
  exactly one transition row.** This is test `S-07` in
  `TEST-AND-QUALIFICATION-PLAN.md`, and it is run against **real PostgreSQL** —
  a mocked Prisma client cannot demonstrate row locking.
- Idempotency: the mutation carries an `Idempotency-Key`; a replay returns the
  **original** result from `IdempotencyKey`, and does not transition twice.

> **Known trap, carried from the FC1 lane:** partial unique indexes are checked
> **per statement**, so a transaction that relies on a deferrable exclusion
> constraint needs `SET CONSTRAINTS ALL DEFERRED` inside it. Relevant if HFCC
> adopts "exactly one active credential" as a DB constraint.

---

## 4. THE TRANSITION RECORD — EVERY FIELD THE BRIEF REQUIRES

```prisma
model FactoryStateTransition {
  id             String   @id @default(cuid())
  organizationId String                              // tenant-bound
  requestId      String
  // --- the brief's required fields, all NON-NULL where it matters ---
  transitionId   String                              // "T-12"
  previousState  FactoryIntegrationState
  nextState      FactoryIntegrationState
  actorUserId    String?                             // null ONLY for system transitions
  actorKind      FactoryActorKind                    // HUMAN | SYSTEM | INTAKE_TOKEN
  occurredAt     DateTime @default(now())            // SERVER-SET. always.
  reason         String   @db.VarChar(1000)          // mandatory, enforced by the applier
  correlationId  String   @db.VarChar(64)
  evidenceRef    String?                             // FactoryEvidenceArtifact.id
  // --- the audit hash chain ---
  sequence       Int                                 // 1..n per request
  previousHash   String?  @db.VarChar(64)            // null only for sequence = 1
  auditHash      String   @db.VarChar(64)            // SHA-256 over the canonicalised row
  @@unique([requestId, sequence])
  @@index([organizationId, requestId, sequence])
  @@index([correlationId])
}
```

### The hash chain

```
auditHash(n) = SHA256( JCS({
   requestId, sequence, transitionId, previousState, nextState,
   actorUserId, actorKind, occurredAt, reason, correlationId,
   evidenceRef, previousHash
}) )
```

- **Canonicalisation is JCS (RFC 8785)**, not `JSON.stringify` — key order and
  number formatting must be deterministic or the chain is unverifiable across
  runtimes. FC1 already has a `jcs.ts`; on `main` HFCC must supply one.
- `occurredAt` is **strictly RFC 3339, UTC `Z`, real calendar**. This is not
  pedantry: the R2.1 harness lane spent an entire remediation round
  (`R21-F11`) on exactly this, and the final rule is that every timestamp is
  validated against a month table with Gregorian leap-year handling, no leap
  seconds, and `-00:00` refused. HFCC adopts the same validator.
- `@@unique([requestId, sequence])` makes a gap or a fork a **database** error,
  not a reviewer's observation.
- Verification is a read-only endpoint plus a gate test that walks the chain and
  recomputes every hash.

**What the chain does and does not prove.** It proves *internal* consistency:
no row was altered or removed without detection by anyone who cannot also
rewrite every later row. It does **not** prove it to a third party — that needs
external anchoring or signing, which is out of scope and recorded as `OD-H`.
HFCC must not describe it as tamper-*proof*; it is tamper-*evident*.

> **A manifested document cannot quote its own TOTAL.** Learned in the HV2 R2
> lane. Applied here: the evidence pack's manifest lists the transition chain's
> head hash; the chain must not contain a row whose content is the manifest that
> contains it.

---

## 5. BLOCKING STATES — THE `resumeTo` RULE

`SUSPENDED` and `HOLD` must return to where they came from, and the state they
came from must still be legal.

```prisma
resumeTo  FactoryIntegrationState?   // captured at T-17 / T-19, cleared on resume
```

Rules:

- `resumeTo` is written by the applier at suspension time, from the server's
  current state. It is never client-supplied.
- On resume, the applier re-validates that `resumeTo` is still a legal state for
  this request (e.g. its package has not since been invalidated). If not, the
  request resumes to the **earliest safe** state and records why.
- **`HOLD` never releases an existing held backlog.** This is a measured FG1
  behaviour: an authorised backfill needs `SEND_MARKED` *before* the outage, not
  after the release. HFCC must not imply that releasing a HOLD replays what was
  held.
- `SECURITY_HOLD` is distinct from `HOLD`: it is security-specific, requires
  `review_factory_security` to leave, and returns only to `SECURITY_PREFLIGHT`
  — never forward.

---

## 6. FAT RESULT ALGEBRA — THE THREE RESULTS NEVER MERGE

```prisma
enum FactoryCheckOutcome { PASS  FAIL  NOT_RUN  NOT_MEASURED }
enum FactoryExecutionMode { SIMULATOR  LAB  FACTORY }
```

**Counting rule, absolute:**

```
PASS counts as PASS.
FAIL, NOT_RUN and NOT_MEASURED each count as NOT PASS.
There is no partial credit, no rounding, and no "effectively passed".
```

**Separation rule, absolute:**

```
Lab result        (executionMode = LAB)
Simulator result  (executionMode = SIMULATOR)
Factory measured  (executionMode = FACTORY)

These are reported in THREE separate columns and are NEVER summed,
averaged, substituted or rolled up into one number.
```

`T-14` (`FAT_RUNNING` → `FAT_PASSED`) therefore requires, inside the
transaction:

```sql
-- every check must exist, be PASS, and be FACTORY-measured
COUNT(*) WHERE outcome <> 'PASS'                = 0
COUNT(*) WHERE executionMode <> 'FACTORY'       = 0
COUNT(*) WHERE outcome IS NULL                  = 0
COUNT(*) FROM required_checks NOT IN (run)      = 0   -- no check silently absent
```

The fourth condition matters as much as the first three: a FAT that *omits* a
required check must not pass because the omitted check had no `FAIL` row.
**Absence of evidence is not evidence of pass** — the exact lesson of
Delivery D.0-R1 (*"the gap is absence of evidence"*).

A FAT run, once sealed, is **immutable**: no outcome, attachment, comment or
signature may be edited. A correction is a **new run** that references the old
one. This is enforced with a DB-level trigger-equivalent (an applier that
refuses, plus a test that attempts the update directly).

---

## 7. STATE → UI CAPABILITY MATRIX

Each cell is what the **server** permits. The UI only mirrors it.

| state | intake can edit | tag import | build package | run connectivity | shadow visible | FAT editable | FAT sign-off |
|---|---|---|---|---|---|---|---|
| `DRAFT` | no | no | no | no | no | no | no |
| `AWAITING_FACTORY_INPUT` | **yes** | **yes** | no | no | no | no | no |
| `FACTORY_INPUT_COMPLETE` | no | no | no | no | no | no | no |
| `SECURITY_PREFLIGHT` | no | no | no | **yes** (sim) | no | no | no |
| `SECURITY_HOLD` | no | no | **no** | no | no | no | no |
| `PACKAGE_READY` | no | no | re-build only | **yes** | no | no | no |
| `GATEWAY_INSTALLED` | no | no | no | **yes** | no | no | no |
| `CONNECTION_DETECTED` | no | no | no | **yes** | partial | no | no |
| `SHADOW_COLLECTING` | no | no | no | **yes** | **yes** | no | no |
| `FAT_PENDING` | no | no | no | yes | yes | **yes** | no |
| `FAT_RUNNING` | no | no | no | yes | yes | **yes** | **yes** (T-14) |
| `FAT_PASSED` | no | no | no | yes | yes | **no (sealed)** | no |
| `FAT_FAILED` | no | no | no | yes | yes | no (sealed) | no |
| `SUSPENDED` | no | no | no | no | read-only | no | no |
| `HOLD` | no | no | no | no | read-only | no | no |
| `REVOKED` | no | no | no | no | read-only | no | no |

Every "no" above is a route-handler refusal with a specific error code, and
every one has a negative test. A disabled control in the UI is never the only
thing standing between a user and the operation.

---

## 8. DIAGRAM

```
                              ┌─────────┐
                              │  DRAFT  │
                              └────┬────┘
                           T-02    │
                              ┌────▼──────────────────────┐
                        T-03  │  AWAITING_FACTORY_INPUT   │◄──┐
                        (self)└────┬──────────────────────┘   │
                           T-04    │                      T-03┘
                              ┌────▼───────────────────┐
                              │ FACTORY_INPUT_COMPLETE │
                              └────┬───────────────────┘
                           T-05    │
                              ┌────▼──────────────┐   T-06   ┌───────────────┐
                              │ SECURITY_PREFLIGHT├─────────►│ SECURITY_HOLD │
                              └────┬──────────────┘◄─────────┤               │
                     T-08 (STEP-UP)│            T-07         └───────────────┘
                              ┌────▼─────────┐
                              │ PACKAGE_READY│
                              └────┬─────────┘
                           T-09    │
                              ┌────▼──────────────┐
                              │ GATEWAY_INSTALLED │
                              └────┬──────────────┘
                 T-10 (SYSTEM only)│
                              ┌────▼────────────────┐
                              │ CONNECTION_DETECTED │
                              └────┬────────────────┘
                 T-11 (SYSTEM only)│
                              ┌────▼──────────────┐
                              │ SHADOW_COLLECTING │
                              └────┬──────────────┘
                           T-12    │
                              ┌────▼────────┐◄────────────┐
                              │ FAT_PENDING │             │ T-16
                              └────┬────────┘             │
                           T-13    │                      │
                              ┌────▼────────┐             │
                              │ FAT_RUNNING │             │
                              └──┬───────┬──┘             │
            T-14 (STEP-UP)       │       │  T-15          │
                      ┌──────────▼─┐   ┌─▼────────────┐   │
                      │ FAT_PASSED │   │  FAT_FAILED  ├───┘
                      └────────────┘   └──────────────┘

  T-17/T-18  any non-terminal  <->  SUSPENDED   (resumeTo)
  T-19/T-20  any non-terminal  <->  HOLD        (resumeTo)
  T-21       any state          ->  REVOKED     (STEP-UP, absorbing, revokes credentials)
```

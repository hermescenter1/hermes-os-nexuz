# IMPLEMENTATION-SLICES.md

HFCC execution plan. Phase 0 — nothing started.

---

## 0. PRECONDITIONS — ALL MUST HOLD BEFORE SLICE 1

| # | Precondition | Current status |
|---|---|---|
P-1 | Owner issues `FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED` | **NOT GIVEN** |
P-2 | `OD-A` decided — the baseline branch | **OPEN** |
P-3 | Host idle: no qualification, build, test or `tsc` running | **FAILS NOW** — R2.1 independent requalification (PID 11712) + two `tsc` on this tree |
P-4 | Worktree location confirmed (`C:\h110-factory-connection-center` proposed; `E:` is ~97 % full) | **OPEN** |
P-5 | `OD-C`, `OD-E`, `OD-F` decided (tag model, i18n namespace, site uniqueness) | **OPEN** |
P-6 | Disk headroom verified on the chosen drive | not checked |

**P-3 alone blocks every slice.** Slices are sequenced so that the work which
*can* proceed under a busy host (design, already delivered) is already done.

---

## 1. SLICE OVERVIEW

Each slice is independently reviewable, independently revertable, and leaves the
tree green. **No slice merges on its own**; the branch accumulates and is
reviewed as a whole, per the brief's feature-gate requirement.

| # | Slice | Depends on | Product bytes | Risk |
|---|---|---|---|---|
1 | Lane setup + frozen baseline | P-1…P-6 | 0 | low |
2 | Feature gate + route skeleton + i18n floor | 1 | small | low |
3 | Schema + migration (additive) | 2, OD-C/F | medium | **high** |
4 | State machine (pure) + transition applier | 3 | medium | **high** |
5 | Control-plane read surface | 4 | medium | medium |
6 | Intake plane: invitation lifecycle | 4 | medium | **high** |
7 | Intake plane: the wizard | 6 | large | medium |
8 | Tag import pipeline | 3, 7 | large | **high** |
9 | Security preflight + blockers | 5 | medium | medium |
10 | Provisioning + package + credential | 5, 9 | large | **highest** |
11 | Connectivity (simulated, gated) | 10 | medium | medium |
12 | Shadow monitoring + provenance read contract | 11 | medium | **high** |
13 | FAT workspace | 12 | large | **high** |
14 | Evidence + audit chain verification | 13 | medium | medium |
15 | Overview page (the aggregate) | 5–14 | medium | medium |
16 | Accessibility, responsive, RTL hardening | 2–15 | small | medium |
17 | Qualification run + evidence pack | all | 0 | — |

**Estimated product surface: ~55–75 new files.** Zero existing product files
modified except: `prisma/schema.prisma`, `messages/{en,fa,de}.json`,
`src/lib/org/rbac.ts` (six permission keys), the i18n gate pins, the migration
gate list, and the route-security inventory. Those six are declared up front so
no reviewer is surprised, and five of them are the known coupling points.

---

## 2. SLICE DETAIL

### Slice 1 — lane setup and frozen baseline *(0 product bytes)*

```
1  Verify the host is idle. Record the evidence. Do not assume.
2  Confirm OD-A. Create the branch from the DECIDED base.
3  Create the worktree at the decided path.
4  npm ci from the lockfile. Assert the lockfile is UNCHANGED.
5  Freeze: record branch, HEAD, a content digest of the tree.
6  Record the i18n leaf baseline by MEASURING it, not by copying this document.
7  Record the migration count by MEASURING it.
8  Stand up an isolated PostgreSQL container on its own port and volume.
   Secrets in a file outside the repo; never printed.
```

Exit: `BASELINE-FROZEN.md` with digest, measured counts and host-state evidence.

> `npm ci` on this repo has a known hazard: **allow-scripts blocks install
> scripts** (Phase 92). Expect it, do not "fix" it by disabling the policy.

### Slice 2 — feature gate, route skeleton, i18n floor

```
src/lib/factory-connection/feature-gate.ts      3 states: OFF | QUALIFICATION_HOLD | ENABLED
src/app/[locale]/dashboard/factory-connections/**     11 route files, each rendering
                                                       its locked/HOLD state
src/app/[locale]/factory-intake/[inviteToken]/**      standalone shell
messages/{en,fa,de}.json                        the leaf floor under `otEdge` (OD-E)
src/i18n/__tests__/*                            leaf pins bumped in EVERY pin site
src/lib/org/rbac.ts                             the six permission keys + role matrix
```

Exit: every route reachable, renders `QUALIFICATION HOLD`, three-way i18n parity
green, permission-matrix lock test green. **Nothing functional yet** — this slice
exists so the gate and the i18n coupling are proven before any logic depends on
them.

> Do this **first**, not last. The i18n gate coupling (leaf pins in six files,
> `TRANSLATED_NS`, zero DE==EN) has blocked lanes repeatedly. Discovering it at
> slice 15 costs a rework of every string.

### Slice 3 — schema and migration *(high risk)*

```
prisma/schema.prisma      12 new models + 1 nullable column on EdgeGatewayProfile
prisma/migrations/<ts>_factory_connection_center_foundation/
  migration.sql
  rollback.sql
prisma/__tests__/phase102-migration-safety.test.ts   DECLARE the new migration (F-033)
scripts/...                                          the CI migration list
```

Procedure, in order:

```
1  Apply schema additions TEXTUALLY (a script), not via `prisma format`.
   `prisma format` rewrites CRLF -> LF for the WHOLE file and buries the diff.
2  npx prisma validate
3  npx prisma generate      <-- MUST run, or types silently lag the schema
4  Rehearse on a THROWAWAY database:
     - apply forward
     - every constraint probe must be REFUSED
     - rollback must leave a SCHEMA-IDENTICAL tree
     - an interrupted migration must leave NOTHING
5  Declare the migration in the Phase 102 gate + CI list
6  npm run gate:phase102:migrations && gate:phase102:applied-migrations
```

Exit: gates G-2, G-3, G-4 green. Additive-only diff confirmed.

> The partial unique index for **OD-F(b)** needs raw SQL — Prisma cannot express
> it declaratively.

### Slice 4 — state machine and applier *(high risk)*

```
src/lib/factory-connection/state-machine.ts     pure, no I/O, exhaustively typed
src/lib/factory-connection/transitions.ts       guards + the transactional applier
src/lib/factory-connection/audit-chain.ts       JCS + SHA-256 chain
src/lib/factory-connection/jcs.ts               RFC 8785 canonicalisation
src/lib/factory-connection/time.ts              the strict RFC 3339 validator (R21-F11)
src/app/api/factory-connections/v1/requests/[id]/transitions/route.ts
```

Exit: U-01…U-04, U-14…U-16, I-06…I-11, S-05, S-07, S-08 green. This is the slice
where **S-07 (two concurrent transitions ⇒ exactly one row) must pass on real
PostgreSQL**, not a mock.

### Slice 5 — control-plane read surface

Read routes + list/detail pages. Every list cursor-paginated with a hard max.
Exit: I-01…I-05, I-13…I-18, N-TEN-01…07, N-SITE-01 green. **The negative
controls land in the same slice as the routes they protect** — not later.

### Slice 6 — invitation lifecycle *(high risk)*

```
src/lib/factory-connection/invitation.ts    mint, hash, validate, revoke, spend
src/app/api/factory-connections/v1/requests/[id]/invitations/**
src/app/api/factory-intake/v1/session/route.ts
middleware                                   EXCLUDE /factory-intake from the
                                             authenticated shell
```

Exit: N-INT-01…N-INT-08 green. Specifically: a token cannot reach the dashboard,
cannot reach another request, cannot be replayed, and produces byte-identical
responses whether it never existed or expired.

### Slice 7 — the intake wizard

Eleven steps, partial save (T-03), server-authoritative completeness, submit
once (T-04). Includes the explicit "no password is entered here" statement in
all three locales, and the credential-shaped-content refusal on free-text fields.
Exit: N-ST-04, N-CSRF-01, B-01 (fa/en/de), A-02 green.

### Slice 8 — tag import *(high risk)*

```
src/lib/factory-connection/tag-import/
  parse-csv.ts  parse-xlsx.ts  validate.ts  commit.ts  rollback.ts
src/app/api/factory-connections/v1/requests/[id]/tag-imports/**
src/components/factory-connection/TagMappingTable.tsx
```

All 18 controls from `DATA-MODEL-PROPOSAL.md` §4. Exit: U-17…U-20, S-09, S-10,
S-14, N-CSV-01, N-UP-01…04, N-XSS-01 green.

> Run any writing generator **in a sandbox** inside tests — a lesson from the
> dependency-gate lane.

### Slice 9 — security preflight and blockers

Blocker model wired to `readinessHold`; the two-stage readiness computation;
`SECURITY_PREFLIGHT` / `SECURITY_HOLD` transitions.
Exit: U-05…U-07, N-SAFE-04 green.

### Slice 10 — provisioning, package, credential *(highest risk)*

```
src/lib/factory-connection/provisioning.ts     the 10-step sequence
src/lib/factory-connection/package-builder.ts  manifest + SHA-256 + seal
src/lib/factory-connection/package-contents/   runbook, systemd, logrotate,
                                               config templates, firewall,
                                               cert trust, backup/restore,
                                               rollback, safe shutdown,
                                               health verify, uninstall
src/app/api/factory-connections/v1/requests/[id]/packages/**
```

Drives the **existing** Phase 94 credential routes; adds none.
Honours D-1 (step-up), D-4, D-6, D-7.
Exit: N-CRED-01…N-CRED-10 green, I-12 (`423` while held) green.

> **This slice is why the feature gate exists.** Under `QUALIFICATION_HOLD`
> package build is refused at the route handler, so the slice can be completed
> and reviewed without ever producing a package that could be installed in a
> plant.

### Slice 11 — connectivity (simulated, gated)

The C-01…C-19 catalogue; pull-based job dispatch; `executionMode` server-set from
the gateway profile; the real-run control disabled with its reason.
Exit: N-SSRF-01 (including **zero outbound socket from CORE**), N-SAFE-02,
N-P-01 green.

### Slice 12 — shadow monitoring *(high risk)*

`ShadowSession`, server-computed counters, the provenance read contract
(D-2, D-5), freshness from `receivedAt`, `REPLAY` never LIVE, quarantine panel,
the three charts.
Exit: U-10…U-13, N-ING-01…N-ING-10 green.

> `N-ING-08` (DB outage ⇒ 503, relay resumes after recovery) belongs here and is
> the single highest-value availability test in the plan.

### Slice 13 — FAT workspace *(high risk)*

Preconditions, the four outcomes, operator + witness distinctness, the
three-way mode split with no total, sealing, T-14's full guard set.
Exit: U-08, U-09, S-11, N-SAFE-03, M-09, M-10, M-27, M-28 green, A-03 green.

### Slice 14 — evidence and audit

Append-only artifacts, the evidence drawer, chain verification endpoint, pack
generation.
Exit: N-AUD-01…N-AUD-08, S-12 green.

### Slice 15 — Overview

The aggregate endpoint and page; HOLD replacing the score; the 4×3 FAT matrix;
the fourteen signals.
Exit: §6 of the API contract satisfied; N-SAFE-04, N-SAFE-06 green.

### Slice 16 — accessibility, responsive, RTL hardening

Exit: A-01…A-13, R-01…R-07, L-01…L-11 green, all three locales.

### Slice 17 — qualification run and evidence pack *(0 product bytes)*

The full G-0…G-20 sequence, then the pack.
**Requires the owner to sign in for G-15** (both the site *and* the browser
extension — they are separate prerequisites).

---

## 3. SEQUENCING RATIONALE

Three ordering choices that are not obvious and are deliberate:

1. **The feature gate and i18n floor come second, not last.** The i18n gate
   coupling (six pin sites, `TRANSLATED_NS`, zero DE==EN) and the forbidden-string
   gate are the most reliable sources of late rework in this repository. Proving
   them against an empty surface costs one slice; discovering them at slice 15
   costs a rewrite of every string in all three locales.

2. **Negative controls ship in the same slice as the thing they protect.** Not
   batched into a security slice at the end. A boundary without its negative
   control is an unverified boundary, and the FC1 lane demonstrated that three
   passing suites can coexist with an open credential hole.

3. **Provisioning (10) comes before connectivity (11) and shadow (12).** The
   gateway identity and credential must exist before anything can authenticate
   as one. Attempting shadow mode first would require a fixture credential —
   and a fixture credential path is exactly the kind of thing that survives into
   production.

---

## 4. WHAT WILL GO WRONG — PRE-DECLARED

Pre-committing to these so they are recognised rather than re-discovered.

| Hazard | Source | Mitigation |
|---|---|---|
`prisma format` rewrites the whole schema CRLF→LF | FC1 | apply textually with a script |
`prisma generate` not re-run ⇒ stale types pass the typecheck | FC1 | step 3 of slice 3, non-optional |
the new migration not declared ⇒ gate fails | FC1 F-033 | step 5 of slice 3 |
i18n leaf pin wrong | i18n gate coupling | the catalogue total is **2 lines in `german-final-gate.test.ts`** (584, 628) at this baseline — measured, not the "six files" lore. Re-measure on the chosen base. |
a per-namespace `LEAF_COUNTS` table also needs bumping | i18n gate coupling | only if the chosen namespace is pinned. **`otEdge` is not; `industrial` is** → OD-E/E1 avoids this entirely |
a new top-level namespace needs `TRANSLATED_NS` | i18n gate coupling | nest under `otEdge` (OD-E/E1) |
`fa.json` CRLF ⇒ false diff | FINDING-105-001 | normalise before comparing |
`next-intl` inlines the whole catalogue into flight data | Combined | assert substituted text or a state element id |
React 19 reveal is paint-gated; hidden pane never reveals | Combined | front the tab before judging |
`X-Frame-Options: DENY` blocks an iframe harness | FC1 | drive the page directly |
extension "connected" ≠ site signed in | FC1 | both, and only the owner can do either |
a mocked Prisma client cannot show row locking | S-07 | real PostgreSQL |
`zod` strips unknown keys ⇒ a test passes for the wrong reason | automation lane | `.strict()` + an explicit test |
`1e999` ⇒ `Infinity`, and `typeof` accepts it | HV2 R2 | `Number.isFinite()` |
`catch { return null }` turns an outage into a 401 that halts the relay | FC1 F-020 | 503 vs 401, tested |
a revoked binding leaving its ApiKey valid | FC1 F-021 | D-7 + probe every route |
mutation "CAUGHT" on an untrusted baseline | FC1 SECURITY run 1 | G-8 before G-10 |
a blank `$(digest)` capture voiding a stage | Combined | check every digest line for 64 hex |
the scratchpad can be wiped by another session's startup cleanup | 2026-10-04 | keep lane state in the lane directory, not the scratchpad |
`E:` ~97 % full | FC1 | worktree on `C:` |
Docker Desktop dying overnight | FC1 | `docker info` **first** after any long wait; `docker start`, never recreate |
a fixed sleep after a restart is a latent FAIL on a slow host | FC1 | wait on the condition |
the dependency gate is RED on `main` and unreachable to zero | dep lane | declared, not inherited as green |
`touchGatewayHeartbeat(id)` takes no `organizationId` | measured in this audit | **read it before calling it** (R-07) |

---

## 5. ROLLBACK

| Slice | Rollback |
|---|---|
1 | remove the worktree; delete the branch. Zero product impact. |
2 | revert; i18n pins return to the baseline value |
3 | `rollback.sql` — rehearsed in slice 3, schema-identical |
4–16 | revert the slice's commits; the feature gate means no user-visible change at any point |
17 | no product bytes |

**The feature gate is the real rollback.** At `OFF` the routes 404 and nothing
is advertised. At `QUALIFICATION_HOLD` the surface is visible but every
dangerous operation is refused server-side. The branch can therefore be
reviewed, and even merged if the owner chooses, without exposing an unqualified
capability.

---

## 6. WHAT IS OUT OF SCOPE

- A real OPC UA adapter in CORE. The plant-side collector exists as the FG1 lab
  kit; wiring a real adapter is a separate lane with its own qualification.
- Modbus, S7, MQTT — `DEFINED_NOT_IMPLEMENTED`, fail-closed.
- `TelemetryRecord` partitioning (explicitly deferred by the schema).
- Merging FC1 to `main` — a separate decision and a separate review (OD-A/OD-B).
- Any production deployment. Production is at `58dd50d9` and HFCC has no
  deployment step in this plan.
- Docker, Nginx, firewall, DNS, TLS or proxy changes. None is required.
- Any destructive database operation.
- Any commit or push. Neither happens without an explicit instruction.

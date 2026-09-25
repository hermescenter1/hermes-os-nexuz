# Phase 112 — Pre-Implementation Audit

**Phase:** 112 — Immutable Reasoning Run + Exact Replay
**Status:** AUDIT COMPLETE — no product code changed yet
**Baseline:** `origin/main` = `562f997246b74c790df1b6974438041abee46469`
**Isolated worktree:** `E:\hermes-phase112`
**Branch:** `feature/phase112-immutable-reasoning-run`
**Date:** 2026-09-24
**Author of record:** info@hermesnovin.com

---

## 0. Isolation proof

```text
PHASE112_WORKTREE_ISOLATED=YES
PHASE111_TOUCHED=NO            # no Phase 111 branch or worktree exists in this repo; nothing to touch
PRIMARY_WORKTREE_TOUCHED=NO   # primary repo remains on fix/ats-review-worker-packaging, clean
BASELINE_SHA=562f997246b74c790df1b6974438041abee46469
```

- `git worktree add -b feature/phase112-immutable-reasoning-run E:\hermes-phase112 562f997…` created a fresh checkout at the exact fetched `origin/main`.
- No branch matching `*phase112*` / `*112*immutable*` existed before creation.
- No branch or worktree matching `*phase111*` exists at all (the only `11x` worktree is `phase109-b0`, an unrelated false match).
- The `E:\hermes-phase112` path was absent before creation.
- **All Phase 112 implementation and validation will occur only inside this worktree.**

> **Baseline note:** local `main` (`fb41cb7e…`) has diverged from `origin/main`. Per the execution
> prompt, the baseline is the fetched `origin/main` (`562f997…`), **not** local `main`. Phase 112 is
> **not** based on any unmerged Phase 110/111 branch.

---

## 1. Method

Four independent read-only forensic sweeps were run against the isolated baseline worktree, covering:
Industrial Brain reasoning surfaces; the Prisma schema + migration conventions; auth / RBAC / tenant /
audit / idempotency; and the test harness + CI + privacy/retention. Every claim below is anchored to a
`path:line` reference verified against `562f997…`. The most load-bearing facts (canonical-JSON utility,
DB immutability trigger pattern, analyzer nondeterminism, latest migration) were additionally
spot-verified directly.

The audit classifies each capability as one of: **EXISTING**, **REUSABLE**, **MISSING**,
**CONFLICTING**, or **DEFERRED (Phase 110/111 dependency)**.

---

## 2. Industrial Brain reasoning surface — findings

### 2.1 Analyzer entry point and determinism

- Entry point: `analyzeIndustrialFault(input: IndustrialFaultInput): IndustrialBrainAnalysis` —
  `src/lib/industrial-brain/analyzer.ts:1678`. Single synchronous, pure, rule/string-driven function.
  No I/O, no DB, no provider, no LLM, no `Math.random`, no `new Date()`.
- **Two nondeterministic / disconnected fields in the output envelope** (verified):
  - `analyzer.ts:1716` — `engineVersion: "Hermes Industrial Brain V1 / Phase 80"` — a **hardcoded string
    literal**, not derived from any rule/corpus checksum.
  - `analyzer.ts:1717` — `processingMs: Date.now() - t0` (with `t0 = Date.now()` at `:1679`) —
    **wall-clock elapsed time; varies run-to-run for identical input.**
- Input/output types: `IndustrialFaultInput` (`types.ts:4-23`), `IndustrialBrainAnalysis`
  (`types.ts:170-187`, includes `confidence:number` `:184`, `engineVersion:string` `:185`,
  `processingMs:number` `:186`).

> **Direct consequence for Phase 112:** the semantic-output digest **must exclude `processingMs`** (and
> any other non-semantic runtime metadata) under a documented contract, or normalize it. And the
> analyzer's current `engineVersion` literal is **not** a trustworthy engine identity — Phase 112 must
> introduce a real registered engine id + version rather than persisting the literal.

### 2.2 Public analyze route — must stay stateless

- `src/app/api/industrial-brain/analyze/route.ts` is **public / anonymous**, `POST`, `force-dynamic`.
  Comment at `:37`: "a resource boundary, not an authorization one." It **persists nothing**.
- Guards (Phase 99): `checkRateLimit(ANALYZE_ACTION, ip)` → 429; `isJsonContentType` → 415;
  `readBoundedTextBody(req, MAX_BODY_BYTES=32*1024)` → 413/400. On analyzer throw: **error class only**,
  generic 500. On validation error: safe field name, never the rejected value.

> **NON-NEGOTIABLE:** Phase 112 must not turn this route into a persistence endpoint and must not
> silently persist anonymous plant evidence.

### 2.3 Existing persistence (`save-case`) and legacy records

- `src/app/api/industrial-brain/save-case/route.ts`: requires session user (401) + `can(user.role,
  "authoring")` (403); owner resolved server-side via `requireWritableOwner()` / `resolveBrainOwner`;
  owner-scoped `caseRepository(owner)`; body cap `MAX_BODY_CHARS=300_000`; audit via `recordAuditEvent`
  with `correlationId`. It maps analysis into a bounded `EngineeringCase` draft.
- **It stores `clip(analysis.engineVersion, 40)` as a tag (`:193`)** — the untrusted client-supplied
  value, not re-derived. This is a `Case`, **not** a Phase 112 Reasoning Run.
- `src/lib/industrial/reasoning.ts` (the separate Step-8A rule engine) has **no version/checksum
  concept at all**.

### 2.4 Rule/case/graph/corpus version sources

- `src/lib/industrial-knowledge/**` has **first-class provenance/integrity** (Phase 101):
  `provenance.ts` — `canonicalizeSystem` (`:111`), `checksumOfSystem` (`:187`, SHA-256),
  `defineReferenceSystem` (`:470`); `source-artifacts.ts` — `checksumOfArtifact` (`:109`, LF-normalised),
  `normaliseSource` (`:105`); `types.ts` — `Provenance` carries `version`/`revision`/`checksum`
  (`:242-256`); `corpus.ts` — sealed-system registry `CORPUS` (`:30`) + cached `corpusIndex()` (`:41`).
- Per-reference-system identity exists (e.g. `version:"1.0.0"`, `revision:1`), and whole-corpus digests
  are pinned in tests. **But there is no single aggregate "corpus version" / "rule-pack version" /
  "engine manifest" spanning the whole corpus, and the analyzer consumes none of these checksums.**

---

## 3. Prisma / database — findings

### 3.1 The two target legacy models are the schema's outliers

- `AnalysisRecord` (`prisma/schema.prisma:65-87`) and `EngineeringCase` (`:16-44`) both carry only
  `userId String?` and `organizationId String?` — **both nullable, no FK, no `siteId`, no `assetId`, no
  composite tenant key, free-string status, no CHECK, default `Json` (jsonb)**. Isolation for these two
  is enforced only in the application layer (`owner-scope.ts`, per schema comments `:33-37`, `:79-83`).

> **Direct consequence:** legacy `AnalysisRecord` rows are **not** automatically Phase 112 Reasoning
> Runs, cannot be silently backfilled with invented engine versions/evidence/digests, and must not be
> presented as exact-replay capable. Phase 112 introduces **new** models rather than mutating these.

### 3.2 The modern tenant pattern Phase 112 should follow

- Non-null `organizationId` + real relation + **composite tenant FK** + tenant-first `@@unique`.
  Reference exemplar: `EngineeringImport` (`schema.prisma:7544-7580`) with
  `@@unique([organizationId, checksum])` and `@@unique([organizationId, idempotencyKey])`.
- Composite tenant FK exemplar: `AtsJob.hiringManager` (`:2539`) →
  `@relation(fields:[organizationId, hiringManagerId], references:[organizationId, id], onDelete:NoAction)`
  with parent `@@unique([organizationId, id])` (`:2545`); the SQL `ON DELETE SET NULL (column-list)` form
  is expressed only in the migration and pinned by a parity test.
- Native types: `@db.VarChar(n)`, `@db.Text`, `@db.Decimal` are used; `Json` is always default `jsonb`.
- **CHECK constraints are not expressible in `schema.prisma`** — they live only in raw migration SQL
  (15 migrations already do this, e.g. status-IN checks). This is where Phase 112's **lowercase-SHA-256
  hex format checks** and **positive byte-size checks** must go.

### 3.3 Migration conventions and the append-only gates (CONFLICT RISK)

- `prisma/migrations/` holds 77 dirs; naming `<14-digit UTC timestamp>_<phase_slug>`.
- **Latest migration = `20260923000000_ats_b2_s1_orchestration_and_review`** (verified). Any Phase 112
  migration must sort strictly **after** this.
- **Two hard CI append-only integrity gates** must be satisfied or updated:
  - `scripts/ci/phase997-migration-integrity.mjs` (SHA-256 per `migration.sql`, no historical mutation,
    fails closed if baseline commit unreachable) — wired in `phase997-production-completion.yml`.
  - `scripts/ci/phase102-migration-integrity.mjs` (pins a baseline/target SHA + `EXPECTED_NEW_MIGRATIONS`
    count) — wired in `phase102-media-hub-assurance.yml`.
- **CONFLICTING:** `phase102-migration-integrity.mjs` pins an exact expected set/count of migrations
  against `TARGET_SHA`. Adding a new Phase 112 migration will change the working-tree migration set and
  **may trip this gate** unless the gate's contract is designed to only assert *append-only* on future
  migrations (the audit found it does assert `FUTURE_MIGRATIONS_APPEND_ONLY`, so a strictly-appended new
  migration should pass — **this must be re-verified at implementation time**, and any newer release
  ships its own integrity contract rather than mutating the pinned ones).

### 3.4 Existing enums with terminal states (reusable design vocabulary)

- Terminal-state precedents: `IndustrialAutomationRunStatus` (ACCEPTED, RUNNING, COMPLETED, FAILED,
  EXPIRED — `:7373-7384`), `EngineeringAnalysisState`, `EngineeringImportStatus`. Source-channel
  precedent: `EngineeringSourceType` (`:7356`). Phase 112's `sourceChannel` and `runStatus` enums should
  mirror these.

---

## 4. Auth / RBAC / tenant / audit / idempotency — findings

### 4.1 Authorization helpers (the CLAUDE.md names do NOT exist verbatim)

- **There is no `requireActor` / `requireSitePermission` name-for-name in one file.** The real family:
  - `requirePlatformAuth(req)` — `src/lib/api/auth.ts:609` → `{ ctx: PlatformActorContext }` or
    `RefusedRequest`. Establishes authn + server-resolved tenant (Phase 110 selection resolver).
  - `requireOrgActor(req, orgId)` — `src/lib/org/context.ts:115` → `OrgActorContext {userId, orgId,
    memberId, role, status}`.
  - `requirePermission(role, permission)` — `src/lib/org/rbac.ts:291` (pure lookup over `PERMISSIONS`).
  - `requireSiteActor(req, orgId, siteId)` — `src/lib/site/context.ts:100` → `SiteActorContext`.
  - `requireSitePermission(role, permission)` — `src/lib/site/rbac.ts:26`.
- **Best route template for Phase 112:** the OT/engineering **route kit**
  `withOtRoute(req, {permission, bucket}, handler)` — `src/lib/ot-edge/http/route-kit.ts:147` — runs
  authn → active membership → `can()` → rate-limit → site-scope in one place, exposes `privateJson` +
  `PRIVATE_HEADERS` (`no-store`), and `readIdempotencyKey(req)` (`:282`). This is the cleanest reusable
  authenticated-route foundation.
- Server-side tenant resolution: `resolveTenantContext` / `resolveTenantContextFromRequest`
  (`src/lib/tenant/context.ts:552,838`) — never trusts org/site/role from client; `MULTIPLE_ACTIVE_
  ORGANIZATIONS` requires explicit selection. `assertServerOnly` guard at `context.ts:93`.

> **CONFLICTING NAME HAZARD:** two `can()` functions exist — `@/lib/org/rbac` (org roles) vs
> `@/lib/auth/roles` (platform roles); `write-guard.ts:119-137` documents a real bug from this. Phase 112
> must alias-import deliberately.

### 4.2 Permission model

- Org permissions live in `OrgPermission` (`rbac.ts:10-144`) with matrix `PERMISSIONS` (`:146-256`).
  Relevant: `view_industrial` / `manage_industrial` (`:36-37`), `view_knowledge` / `manage_knowledge`,
  and the OWNER/ADMIN-only `run_industrial_automation_org_wide` (`:47`).
- **There is no dedicated "industrial-brain" permission** (the analyze route is anonymous). Phase 112
  must decide the permission gate for persistent runs — likely `view_industrial` (read) +
  `manage_industrial` (create/replay), pending owner confirmation.
- Site permissions: `SitePermission` (`site/types.ts:14-25`) incl. `view_assets` / `manage_assets`.
  Asset-level access is enforced by authorizing the asset's owning site (exemplar
  `industrial/assets/route.ts:67-72`, returns **404 not 403** to avoid enumeration).

### 4.3 Audit service — redaction is convention-only (MISSING enforcement)

- `recordAuditEvent(input)` (`audit-service.ts:411`, best-effort) and
  `recordAuditEventOrThrow(input, client?)` (`:366`, tx-aware, throws) exist. `AuditInput` =
  `{userId?, action, entityType, entityId?, metadata?, organizationId?, outcome?, correlationId?}`;
  `organizationId`/`outcome`/`correlationId` are server-derived, never client body.
- **`metadata` is `Record<string, unknown>` persisted as-is. There is NO runtime allowlist / redaction.**
  Redaction is a documented per-action convention (ids + closed enums + counts + SHA-256 only).

> **Direct consequence:** Phase 112 must implement **its own explicit redaction/allowlist at the snapshot
> boundary and for audit metadata** — do not rely on the audit service to filter, and never place raw
> industrial evidence in audit metadata.

### 4.4 Idempotency — a strong, consistent, reusable pattern (REUSABLE)

- Common invariant across all implementations: **INSERT-under-unique-constraint is the lock** (never
  check-then-insert), scoped by `organizationId`, distinguishing REPLAY vs fingerprint/scope mismatch,
  P2002/23505 re-read to classify.
- Closest reusable toolkit: **`src/lib/ats/idempotency.ts`** — `validateIdempotencyKey` (`:48`),
  `canonicalizePayload` (`:58`, recursive key-sort), `hashKey` (`:74`, SHA-256), `fingerprintPayload`
  (`:78`, HMAC-SHA-256), `claimIdempotencyKey`/`completeIdempotencyClaim`/`releaseIdempotencyClaim`
  (`:108,181,192`); model `RecruitmentIdempotencyKey` `@@unique([organizationId, jobId, keyHash])`
  (`schema.prisma:2611`); PAYLOAD_MISMATCH is generic (no disclosure); expired keys treated as unseen.
- Automation-run store (`industrial/automation-run-store.ts` + `IndustrialAutomationRun`
  `@@unique([organizationId, idempotencyKey])` `:2378`) is the industrial-domain exemplar.
- Key format precedents: `[A-Za-z0-9_.:-]{16,128}` (automation) / `{8,128}` (OT kit header
  `Idempotency-Key`).

### 4.5 Bounded body + no-store (REUSABLE but not universal)

- `src/lib/security/request-guards.ts`: `readBoundedTextBody(req, maxBytes)` (`:66`),
  `readBoundedJson<T>` (`:131`), `isJsonContentType` (`:39`), `SMALL_JSON_BODY_BYTES=16*1024` (`:146`),
  `securityError(...)` sets `Cache-Control: no-store` (`:234`), `requireTrustedOrigin` (`:220`).
- Many older routes still call unbounded `req.json()`. Phase 112 routes must use the bounded readers.

---

## 5. Test harness / CI / privacy — findings

### 5.1 Runner and validation scripts (EXISTING)

- **Vitest `^4.1.8`** (no Jest). No `engines` field; CI pins Node 20. **No `NODE_OPTIONS` heap flags in
  any script** — if typecheck/build needs more heap it must be supplied at invocation.
- Validation scripts that actually exist: `lint` (`next lint`), `test` (`vitest run`),
  `build` (`next build`), `db:validate` (`prisma validate`), `db:generate` (`prisma generate`).
  **There is no `typecheck` script** — TypeScript checking in CI is `tsc --noEmit` (see 5.4).
  Prisma format is `npx prisma format` (no dedicated npm script).
- PostgreSQL integration runs use per-phase configs, e.g. `test:phase102:postgres`. Phase 112 will need
  its **own** `vitest.phase112-postgres.config.ts` + `test:phase112:postgres` script, following the
  established pattern (`fileParallelism:false`, `sequence.concurrent:false`, `include` glob on
  `**/*.pg.test.ts`).

### 5.2 Unit config excludes PG tests (EXISTING)

- `vitest.config.ts:64` **excludes `**/*.pg.test.ts`** from the default `vitest run`, and excludes
  `.next/**` / `.claude/**`. Phase 112 unit tests are ordinary `*.test.ts`; integration tests are
  `*.pg.test.ts` and only run under the dedicated PG config.

### 5.3 Auth-session mock pattern for route tests (REUSABLE)

- Pattern (exemplar `compliance/erasures/__tests__/erasures-governance.test.ts`): per-test
  `vi.resetModules()` + `vi.doMock` of `@/lib/auth/jwt` (`verifyAccessToken`), `@/lib/auth/session-store`
  (`isPayloadSessionActive`), `@/lib/db/prisma` (`getPrisma`), `@/lib/audit/audit-service`,
  `@/lib/logger/security-events`; route imported lazily after mocks; `vi.doUnmock` in `afterEach`.
  Identity via a module-scoped mutable `payload` + fake `ACCESS_TOKEN_COOKIE`.

### 5.4 Real-PostgreSQL integration pattern (REUSABLE)

- Guard: `const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;`
  then `describe.skipIf(!PG_ENABLED)` **plus an anti-silent-skip assertion** that `PG_ENABLED === true`.
- **Migrations are applied out-of-band by the workflow (`npx prisma migrate deploy`)**, not by in-test
  setup; tests then assert `_prisma_migrations` / `pg_constraint` / `pg_indexes` presence and drive real
  persistence functions on independent connections to prove atomicity/concurrency. There is **no
  testcontainers / no global-setup / no docker-compose *test* file** — CI uses a `services:` Postgres
  container (`pgvector/pgvector:pg16`).

> **BLOCKED-GATE RISK (local):** the real-PostgreSQL gate needs Docker + a Postgres service +
> `DATABASE_URL` + `HERMES_STORAGE_MODE=database` + `prisma migrate deploy`. If unavailable in this
> environment, the PG integration gate will be reported **BLOCKED / NOT_RUN with the exact reason** — it
> will not be replaced by a mock and called passed.

### 5.5 CI core gates (EXISTING)

- `ci.yml` job `validate` (PR→main, no secrets): production-compose static check → `npm ci` →
  `npm audit --audit-level=high` (0 high/critical, hard) → `prisma generate` → `db:validate` →
  `tsc --noEmit` → `lint` → `test` (unit) → `build`. Plus PG service-container jobs per phase.
- Phase 112 must not introduce new `npm audit` high/critical findings, new lint warnings, or `tsc`
  errors.

### 5.6 Privacy / retention / immutability prior art (REUSABLE — the key pattern)

- A mature governed-compliance subsystem exists under `src/lib/compliance/`.
- **The closest existing pattern to "immutable-but-deletable-under-governed-retention" is the
  compliance evidence pack** (`evidence-pack-db.ts`): one REPEATABLE READ transaction, SAFE canonical
  projections, recursively key-sorted JSON hashed to lowercase SHA-256, and — critically —
  **DB-enforced immutability triggers** (verified):
  - `prisma/migrations/20260820000017_phase97_compliance_evidence_packs/migration.sql:146` —
    `compliance_evidence_pack_ready_immutable()` `BEFORE UPDATE ON "ComplianceEvidencePack"` raising
    unless a governed REVOKED/EXPIRED transition preserving evidence (`:168`).
  - `:178` — `compliance_evidence_pack_item_immutable()` `BEFORE UPDATE OR DELETE ON
    "ComplianceEvidencePackItem"` rejecting all mutation (`:181-184`).
- Governed deletion lifecycle: `RetentionPolicy` + `LegalHold` (plan-only, execution behind default-false
  `isRetentionExecutionEnabled`, ACTIVE legal hold short-circuits to `LEGAL_HOLD`) and
  `DataDeletionRequest` (closed lifecycle CHECK, approval bound to exact `planHash`/`planVersion`).

> **Direct consequence:** Phase 112 immutability = **DB `BEFORE UPDATE/DELETE` triggers** on the run +
> artifact tables (evidence-pack pattern), with deletion permitted **only** through the governed
> retention/erasure path — never a blanket "no DELETE ever" rule that would break lawful retention
> deletion.

---

## 6. Reusable canonicalization + hashing (VERIFIED — prefer over new duplicate)

`src/lib/tia-companion/canonical.ts` (Phase 109-C2.0) is a hardened, bundler-safe canonical-JSON + SHA-256
utility (verified exports):

- `stableStringify(value)` (`:175`) — recursive key ordering via `compareCodepoints` (`:57`,
  locale-independent); refuses `__proto__`, non-finite numbers, sparse-array holes, exotic objects
  (Date/Map/Set), bigint (throws `TiaCanonicalError` `:38`).
- `sha256Hex(input)` (`:187`, async, dynamic `import("node:crypto")` to stay browser-bundle-safe),
  `canonicalSha256(value)` (`:193`) = `sha256Hex(stableStringify(value))`.
- `isSha256Hex(value)` (`:205`, strict `^[0-9a-f]{64}$`), `digestsEqual(a,b)` (`:229`, deliberately
  **not** constant-time — documented as integrity digests over non-secret metadata, not MACs).

> **DECISION POINT (for owner):** CLAUDE.md forbids duplicating a working utility, while the execution
> prompt says "implement one canonical JSON utility for Phase 112 and test it adversarially." The honest
> reconciliation is to **build Phase 112 canonicalization on top of `tia-companion/canonical.ts`** (reuse
> `stableStringify`/`sha256Hex`) and add only the Phase 112-specific **manifest binding** (digest that
> binds all artifact digests + declared engine/version fields) and the adversarial test suite. If the
> owner prefers a standalone `reasoning-runs/canonical-json.ts`, it should be a thin, tested wrapper —
> not a re-implementation. Also note: the existing hashing is **async** (Promise-returning); the Phase
> 112 create/replay services must be async accordingly.
>
> **HONESTY on RFC 8785:** the existing utility is a documented Hermes canonical profile, **not**
> certified RFC 8785. Phase 112 docs will describe a "Hermes canonical JSON profile", not claim RFC 8785.

---

## 7. Capability classification summary

| Capability | Status | Evidence / Reuse target |
|---|---|---|
| Deterministic reasoning engine | EXISTING | `analyzeIndustrialFault` `analyzer.ts:1678` (pure) |
| Stable engine identity/version | MISSING | `engineVersion` is a hardcoded literal `analyzer.ts:1716` |
| Non-semantic runtime metadata isolation | MISSING (must design) | `processingMs` `analyzer.ts:1717` |
| Canonical JSON + SHA-256 | REUSABLE | `tia-companion/canonical.ts` (build manifest binding on top) |
| Corpus/rule/graph checksums | EXISTING (per-system) | `industrial-knowledge/provenance.ts` — no aggregate manifest |
| Engine version registry / replay executor | MISSING | greenfield |
| ReasoningRun / ReplayAttempt models | MISSING | greenfield (follow `EngineeringImport` tenant pattern) |
| Tenant-scoped composite FK pattern | REUSABLE | `AtsJob.hiringManager` `schema.prisma:2539` |
| DB immutability triggers | REUSABLE | evidence-pack `20260820000017_…/migration.sql:146-184` |
| Governed retention/erasure deletion | REUSABLE | `RetentionPolicy`/`LegalHold`/`DataDeletionRequest` |
| Idempotency (INSERT-as-lock, fingerprint) | REUSABLE | `ats/idempotency.ts` + `IndustrialAutomationRun` |
| Authenticated tenant/site route kit | REUSABLE | `withOtRoute` `ot-edge/http/route-kit.ts:147` |
| Server-resolved tenant context | REUSABLE | `resolveTenantContext` `tenant/context.ts:552` |
| Bounded body + no-store helpers | REUSABLE | `security/request-guards.ts`; `privateJson`/`PRIVATE_HEADERS` |
| Audit service | REUSABLE (but redaction is convention-only) | `audit-service.ts:366,411` |
| Snapshot redaction / allowlist enforcement | MISSING | must be implemented at the snapshot boundary |
| Route/PG test patterns | REUSABLE | `vi.doMock` auth double; `*.pg.test.ts` + `describe.skipIf` |
| Migration append-only integrity gates | EXISTING (CONFLICT RISK) | `phase102`/`phase997` integrity scripts |
| Public analyze route statelessness | EXISTING (must preserve) | `industrial-brain/analyze/route.ts` |
| Legacy `AnalysisRecord` as a Run | CONFLICTING (do NOT backfill) | nullable un-related tenant `schema.prisma:65-87` |

---

## 8. Phase 110 / 111 integration points and deferred dependencies

- **Phase 111:** no branch/worktree exists in this repo. Phase 112 has **zero** current dependency on
  Phase 111 code and must not import, inspect-as-authoritative, or interfere with it. No deferral needed
  because there is nothing present; if Phase 111 later lands, Phase 112's isolation adapter (below)
  contains the blast radius.
- **Phase 110 (tenant selection):** `requirePlatformAuth` already consumes the Phase 110 tenant-selection
  resolver (`api/auth.ts:363-497`). Active Phase 110 CMMS work exists in separate worktrees
  (`hermes-os-phase110-a30`, `-a10b`). Per the prompt, Phase 112 **must not** copy or modify any competing
  Phase 110 authorization implementation. **Integration approach:** consume the *existing, merged-on-
  baseline* helpers (`requirePlatformAuth` / `requireOrgActor` / `requireSiteActor` / `withOtRoute`)
  through a **small Phase 112 adapter** (e.g. `src/lib/reasoning-runs/tenant-adapter.ts`) so any
  divergence in the live Phase 110 branch stays behind one documented seam and Phase 112 stays reviewable.

---

## 9. Conflicts, risks and open decisions to resolve before implementation

1. **Migration integrity gate contract** (§3.3) — must re-verify the new Phase 112 migration only *appends*
   and does not trip `phase102`/`phase997` pinned-set assertions; may require the Phase 112 release to
   ship its own append-only integrity contract rather than editing the pinned ones.
2. **Canonical utility reuse vs. new module** (§6) — owner decision: reuse `tia-companion/canonical.ts`
   (recommended) vs. standalone module. Async hashing propagates to services.
3. **Permission gate for persistent runs** (§4.2) — recommend `view_industrial` (read/replay-read) +
   `manage_industrial` (create + execution-replay); confirm with owner.
4. **`processingMs` handling** (§2.1) — recommend excluding all non-semantic runtime metadata from the
   semantic-output digest under a documented contract; the raw output snapshot may still retain it, but
   the *diagnostic/semantic digest* is computed over a normalized projection.
5. **Engine version registry seed** — the current deterministic engine must get a stable id + exact
   version (recommend deriving/pinning a real version constant, e.g. `hermes-industrial-brain@1.<corpus
   revision>` bound to `corpusIndex()` checksums), **not** the disconnected literal.
6. **`can()` name collision** (§4.1) — alias imports to avoid the documented org-vs-platform bug.
7. **Local PG + Docker availability** (§5.4) — if absent, the real-PostgreSQL and full-suite gates are
   reported BLOCKED with the exact reason, never mocked-and-passed.
8. **No `typecheck` npm script** (§5.1) — validation will run `npx tsc --noEmit` (with adequate heap if
   needed) since no `typecheck` script exists.

---

## 10. Why this is not "done" merely because the audit is complete

This document establishes the ground truth and the safe reuse map. It does **not** implement anything.
Per the execution prompt and CLAUDE.md, product code will only be written after a concise implementation
plan is presented and the scope/decisions above are confirmed. Phase 112 will **not** be reported
`CODE_REVIEW_READY` — let alone MERGE/DEPLOY/FACTORY/PRODUCTION_READY — until every Definition-of-Done gate
(schema+migration validated, tenant/site/asset enforced, canonical hashing + manifest integrity tested,
archival + execution replay proven, zero side effects proven, idempotency/concurrency proven on real
PostgreSQL, focused tests + tsc + lint + build green, real-PG tests green, docs + evidence complete) is
actually met and recorded.

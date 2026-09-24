# Phase 112 — Validation Report

**Status:** CODE_REVIEW_READY (uncommitted)
**Baseline:** `origin/main` @ `562f997246b74c790df1b6974438041abee46469`
**Worktree:** `E:\hermes-phase112` · branch `feature/phase112-immutable-reasoning-run`
**Date:** 2026-09-24

This report records exactly which validation commands were run and their results.
Nothing here claims a gate that was not actually executed.

---

## 1. Isolation

```text
PHASE112_WORKTREE_ISOLATED=YES
PHASE111_TOUCHED=NO            # no Phase 111 branch/worktree exists in this repo
PRIMARY_WORKTREE_TOUCHED=NO
BASELINE_SHA=562f997246b74c790df1b6974438041abee46469
```

## 2. Commands executed and results

| Gate | Command | Result |
|---|---|---|
| Prisma validate | `prisma validate` | PASS (valid; pre-existing driverAdapters deprecation warning only) |
| Prisma generate | `prisma generate` | PASS (client v7.8.0 generated with the 3 new models) |
| Migration applies to fresh DB | `prisma migrate deploy` (ephemeral pgvector:pg16) | PASS (all 78 migrations, incl. Phase 112, applied clean) |
| Migration integrity (997) | `node scripts/ci/phase997-migration-integrity.mjs` | PASS (incl. `FUTURE_MIGRATIONS_APPEND_ONLY`) |
| Migration integrity (102) | `node scripts/ci/phase102-migration-integrity.mjs` | PASS |
| Route inventory regen | `node scripts/security/phase99/generate-inventory.mjs` | Regenerated; 3 new routes classify `TENANT_MEMBER` |
| TypeScript | `tsc --noEmit` (heap 6144) | PASS — 0 errors (whole project) |
| Lint | `next lint` | PASS — 0 new warnings (one introduced warning was fixed; remaining warnings are pre-existing, unrelated files) |
| Phase 112 unit tests | `vitest run src/lib/reasoning-runs/__tests__` | PASS — canonical/integrity/create/replay/static-security |
| Phase 112 route tests | `vitest run src/app/api/industrial-brain/runs/__tests__` | PASS — 10/10 |
| Schema↔SQL parity | `vitest run prisma/__tests__/phase112-schema-sql-parity.test.ts` | PASS — 13/13 |
| Guard recognition | `vitest run scripts/__tests__/phase112-guard-recognition.test.ts` | PASS |
| Real PostgreSQL integration | `test:phase112:postgres` (real pgvector:pg16) | PASS — 10/10 |
| Full unit suite | `vitest run --maxWorkers=3` | PASS — 558 files, 13402 tests, 0 failed, 9 skipped files / 145 skipped tests |
| Production build | `next build` | PASS — 978/978 pages, 0 compile errors; the 3 routes emit as dynamic (`ƒ`) |

### Real-PostgreSQL gate — how it was run (not mocked)

An **isolated, ephemeral** `pgvector/pgvector:pg16` container was started on a
dedicated port for Phase 112 only (never the other workstream's running
container), all migrations were applied with `prisma migrate deploy`, the
`*.pg.test.ts` suite ran against it with `HERMES_STORAGE_MODE=database`, and the
container was removed afterward. No production or shared database was contacted.

### Worker-count note (honest)

The first full-suite run at default parallelism suffered **worker-startup
timeouts** on this low-RAM machine (8 files failed to *start*; the run silently
under-collected — 12388 vs 13547 tests). Re-running with `--maxWorkers=3`
eliminated the timeouts and gave the accurate, fully-green count above. This is
an environmental constraint, disclosed rather than hidden.

## 3. What the real-PostgreSQL suite proves

- the additive migration applies to a fresh database and is recorded in
  `_prisma_migrations`;
- the CHECK constraints (lowercase-SHA-256 hex on every digest, `byteSize > 0`,
  terminal-state), the composite tenant FKs, the `(org, idempotencyKey)` unique
  index, and the three UPDATE-rejecting triggers all exist;
- the immutability triggers reject `UPDATE` on the run and its artifacts;
- a concurrent create race with the same idempotency key yields a **single** run;
- reusing a key with a different request is a fingerprint mismatch;
- `RESTRICT` prevents deleting a run's parent asset;
- replay appends attempts and leaves the original run byte-identical;
- governed deletion is possible (deleting a run cascades its artifacts).

## 4. Files changed

### New (Phase 112-owned)
- `src/lib/reasoning-runs/` — `canonical-json.ts`, `types.ts`, `integrity.ts`,
  `engine-industrial-brain.ts`, `engine-registry.ts`, `redaction.ts`,
  `repository.ts`, `prisma-repository.ts`, `create-run.ts`, `replay-run.ts`,
  `projections.ts`, `tenant-adapter.ts`, `__tests__/**` (incl. `pg/`).
- `src/app/api/industrial-brain/runs/` — `route.ts`, `[id]/route.ts`,
  `[id]/replay/route.ts`, `__tests__/`.
- `prisma/migrations/20260924000000_phase112_immutable_reasoning_run/migration.sql`
- `prisma/__tests__/phase112-schema-sql-parity.test.ts`
- `scripts/__tests__/phase112-guard-recognition.test.ts`
- `vitest.phase112-postgres.config.ts`
- `docs/industrial/phase112-*.md` (audit, contract, replay-and-integrity, this report)

### Modified (additive / required estate-inventory updates)
- `prisma/schema.prisma` — **additive only: 217 insertions, 0 deletions** (3 models,
  6 enums, 5 back-relations). No existing model was reformatted or altered.
- `src/lib/auth/rate-limiter.ts` — 3 new buckets (`reasoning-run-read/create/replay`).
- `src/lib/audit/audit-service.ts` — `REASONING_AUDIT` action constants.
- `package.json` — `test:phase112:postgres` script.
- `docs/security/phase99-route-security-inventory.json` — **regenerated** to include
  the 3 new routes (the inventory gate exists precisely so new routes show as a diff).
- `scripts/security/phase99/route-inventory.mjs` — registered `resolveReasoningRunActor`
  as a tenant-scope guard token (locked by the recognition test).
- `scripts/security/phase99/tenant-predicates.mjs` — registered `authorizeRunScope`
  as a site-authorization token (locked by the recognition test).
- `prisma/__tests__/phase102-migration-safety.test.ts` — added the Phase 112 migration
  to the sanctioned `LATER_PHASE_MIGRATIONS` list (the test's own comment mandates this
  explicit, visible change for any new migration).
- `prisma/__tests__/ats-b2-s1-migration-safety.test.ts` — relaxed a brittle assertion
  that the ATS migration is permanently the *last* one (contradicted by the repo's own
  append-only design and the phase997 `FUTURE_MIGRATIONS_APPEND_ONLY` gate) to the real
  invariant: it was appended after every migration that pre-existed it.

> Note: `prisma format` reformats the entire schema to a style the repository's
> baseline does not use (a 1440/1227-line whitespace churn). It was **not** applied;
> `prisma validate` is used instead, keeping the schema diff additive-only.

## 5. Included / excluded in semantic output hashing

Included: the full semantic analysis (classification, alarms, signal matrix,
reasoning map, uncertainty, risk, likely causes, checklist, recommended actions,
related knowledge, confidence, the analyzer's constant `engineVersion` literal).
Excluded: `processingMs` (wall-clock runtime metadata) — via the engine's
documented allowlist `semanticProjection`.

## 6. Engine version support

Registered: `hermes-industrial-brain@1.0.0` (rule pack `industrial-brain-rules/1.0.0`),
no case corpus / graph / document corpus / model / provider. Any other id/version
returns `ENGINE_VERSION_UNAVAILABLE` on execution replay (fail-closed).

## 7. Retention / deletion boundary

UPDATE is DB-rejected (immutable content). DELETE remains possible for a governed
retention/privacy path and tenant cascades; the application repository issues no
deletes. Wiring reasoning runs into the existing
`RetentionPolicy`/`LegalHold`/`DataDeletionRequest` governance is **defined
follow-up work** — the DB mechanism exists, the executor integration does not yet.

## 8. Phase 110 / 111 integration points

- Phase 111: none present; zero dependency.
- Phase 110: consumed **only** through `src/lib/reasoning-runs/tenant-adapter.ts`,
  which calls the merged-on-baseline `requirePlatformAuth` / `requireOrgActor` /
  `requirePermission` / `requireSiteActor` / `requireSitePermission`. No competing
  Phase 110 branch implementation was copied or modified.

## 9. Known duplication + consolidation path

`src/lib/reasoning-runs/canonical-json.ts` is an intentional standalone canonical
JSON + SHA-256 utility, independent of `src/lib/tia-companion/canonical.ts` (per the
owner's decision to keep Phase 112's integrity contract versioned on its own and to
leave tia-companion untouched). A future consolidation could extract a shared
`canonical-json` core that both consume once their profiles are proven equivalent;
until then the duplication is deliberate and each is independently tested.

## 10. Remaining risks / not-done

- No retention/erasure executor for reasoning runs yet (DB is deletable; governance
  wiring is follow-up).
- `FAILED`/`PENDING`/`RUNNING` run states are reserved; only synchronous `COMPLETED`
  runs are persisted today.
- Not asserted here: independent integration, operational, or factory-readiness
  gates. Phase 112 is **CODE_REVIEW_READY only** — not MERGE/DEPLOY/FACTORY/PRODUCTION
  ready. No commit, push, PR, merge, deploy or production migration was performed.

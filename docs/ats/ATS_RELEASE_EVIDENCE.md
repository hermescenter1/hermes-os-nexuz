# ATS Release Evidence — S0 + B2 + S1

**Branch:** `feature/ats-recruitment-intelligence`
**Base:** `1c7aa40579d501468212d6542ddac295f3aab685` (`origin/main`, verified)
**Commit:** one LOCAL commit on this branch (its SHA is reported with the session; a document cannot contain its own commit hash). **Not pushed.**
**Deployment:** none. No server was contacted, no migration was applied anywhere, no production flag was changed.
**Date:** 2026-09-23

## 1. Flag state

| Flag | Value | Meaning |
| --- | --- | --- |
| `APPLICATION_ORCHESTRATION_IMPLEMENTED` | **true** (was false) | B2 exists: `src/lib/ats/intake.ts` |
| `APPLICATION_ACCEPTANCE_AUTHORIZED` | **false** (unchanged) | owner decision; public intake stays closed |
| `APPLY_JOURNEY_OPEN` | **false** | conjunction of the two; pinned by `phase104b14-journey-truth` and `ats-b2-s1-production-boundary` |
| `ATS_AI_REVIEW_PROVIDER` | unset → `deterministic` | no candidate text leaves the process |
| `ATS_AI_EXTERNAL_PROCESSING_ALLOWED` | unset → not allowed | |

## 2. Migration

`prisma/migrations/20260923000000_ats_b2_s1_orchestration_and_review/migration.sql` — the 78th. Additive only:
2 enum values appended (`ADD VALUE IF NOT EXISTS`, non-transactional, idempotent), 4 new enums, 9 nullable/structural columns on `AtsApplication`, 4 new tables (`AtsJobCriterion`, `AtsAiReview`, `AtsReviewDecision`, `AtsReviewOutbox`) with composite tenant FKs, 13 indexes. Body is the exact output of `prisma migrate diff --from-schema <HEAD> --to-schema <branch>` plus `IF NOT EXISTS` on the two enum statements. Rollback SQL is in the file header. **Not applied to any database** — there is no backup/migration evidence because no migration was run.

## 3. Validation — final run, commands actually executed, `set -o pipefail`

Every exit code below is the command's own, written by `cmd > log; echo $? > exit` — never the exit code of a `tee` or `tail` in a pipeline.

| Command | Exit | Result |
| --- | --- | --- |
| `npm run db:validate` | 0 | schema valid |
| `npx tsc --noEmit` | 0 | clean |
| `npm run lint` | 0 | 0 errors; 0 warnings on any ATS / careers / prisma / scripts path |
| `npm test -- --run --maxWorkers=2` | 1 | **559 / 559 files ran; 13 259 passed, 1 failed, 145 skipped**; 0 unhandled errors, 0 unstarted workers. The one failure is §4. |
| dedicated B2 / S1 / authz / migration suites (18 files) | 0 | **408 / 408** |
| `npm run build` | **0** | 978 / 978 static pages; all six new or changed ATS routes in the route table as `ƒ`; one warning, pre-existing (§6) |
| `node scripts/security/phase99/generate-inventory.mjs --check` | 0 | inventory matches source; 0 `UNKNOWN` |

### A "full" run that did not run everything

The first final suite run reported **1 failure** — over only **549 of 559** files. Under memory pressure vitest could not start a worker for **10 jsdom test files** ("Failed to start forks worker … Timeout waiting for worker to respond"; 10 unhandled errors). Those files **never executed**, and the summary line did not say so. One of them, `careers/phase104i3-apply-provenance`, covers the apply flow this change rewires. That run was rejected. The 10 files were then run explicitly (**396 / 396 pass**) and the whole suite re-run at `--maxWorkers=2`; that is the run recorded above.

## 4. The one failure — proven independent of this change against the baseline

`phase109b0-retirement › has no /api/telemetry route module` asserts `existsSync(src/app/api/telemetry) === false`.

| Evidence | Measured |
| --- | --- |
| tracked files under that path at base `1c7aa405` | **0** — a checkout of the base has no such directory, so the test passes there and in CI |
| paths under it in this change set (tracked + untracked) | **0** |
| on disk | an **empty** directory, mtime 2026-09-12 |
| the test file vs. base | **byte-identical** |
| origin | residue of `1117555 fix(dashboard): retire anonymous telemetry simulation`, which deleted the route file; git does not remove the emptied directory from an existing working tree |

The result depends only on local filesystem residue, not on code in either tree. **Not deleted**, per instruction.

## 5. Regressions introduced and closed during this work

An earlier full run reported **14 failures**. Beyond item 1 above, all 13 were caused by this change and are closed:

- **Phase 99 route-security inventory** — the 5 new/rewired handlers read `UNKNOWN` because their guards were not in the classifier's `GUARD_TOKENS` registry, which failed `phase99-static-invariants`, `phase99-route-inventory-completeness`, the Phase 100 closure evaluator (8 tests) and `phase100-evidence-integrity`. Fixed by **registering** `requireAtsActor` (tenant), `authorizeReviewWorker` (platform) and `requireRecruitmentReader` (user — deliberately not tenant, so the inventory does not overstate the fixture-backed S0 routes), each locked on both halves by `ats-guard-registration.test.ts`, following the Phase 103 / 109-R8 precedent. None of the six hash-pinned Phase 99 retest files was touched.
- **Stale public-surface declarations** — `/api/ats/{analytics,candidates,jobs,overview,pipeline}` GET were still declared public ("static demo fixtures"). A declaration short-circuits classification, so the committed inventory was calling authenticated routes `PUBLIC_READ`. Removed; now classified from source (`AUTHENTICATED_USER`). Removal locked by test.
- Inventory regenerated: `PUBLIC_READ` 41→36, `AUTHENTICATED_USER` 215→220, `TENANT_MEMBER` 127→131, `PLATFORM_ADMIN` 131→132, `UNKNOWN` 0.
- **`phase104b14-journey-truth`** pinned `APPLICATION_ORCHESTRATION_IMPLEMENTED === false`, a B1.4 fact that B2 changed. Updated and strengthened: it now asserts the owner flag is the one fact keeping the journey closed.
- **Self-inflicted, caught before it counted:** a heredoc collapsed `\\b` to `\b` inside a template string — a backspace character — which would have made the new repository-wide "no production caller" check pass vacuously. Rewritten with `String.raw` plus an anti-vacuity assertion, then proven by a planted-caller control (§7).

## 6. Build

`npm run build` → **exit 0** (npm's own exit code), 11.2 min compile, **978 / 978** pages prerendered, route table emitted. One warning:

```
./src/lib/ai/providers/shared.ts
Critical dependency: the request of a dependency is an expression
Import trace: ./src/lib/ai/providers/shared.ts <- ./src/app/api/brain/route.ts
```

**Pre-existing, proven:** the identical warning with the identical trace is in the S0 build log of 07:43, which predates `src/lib/ats/review/engine.ts` (created 13:20). It comes from Phase 12's deliberate variable-specifier `import()` in `loadOptionalPackage`.

An earlier attempt (19:49) never passed "Creating an optimized production build": the machine had 0.4 GB free of 15.9 GB (other sessions, not touched), and that build — this session's own process — was stopped after 1 h 40 min (exit 127 = terminated). The final build ran once 4 GB were free.

## 7. Gate-proof controls (a test must be able to fail)

| Control | Mutation | Observed |
| --- | --- | --- |
| S0 auth | `requireRecruitmentReader` bypassed in `/api/ats/pipeline` | exactly 4 pipeline assertions failed; restored → 17/17 |
| S1 stage gate | `expectedFrom` state check bypassed in `decision.ts` | exactly "only PENDING_HUMAN_APPROVAL accepts a gate decision" failed (1/16); restored → 16/16 |
| B2 erased candidate | `deletedAt: null` filter reinstated in `intake.ts` | exactly the `CANDIDATE_ERASED` test failed (1/19); restored → 19/19 |
| Repository-wide gate bypass | a reference to `updateApplicationStatus` planted in `intake.ts` | exactly "updateApplicationStatus has no production caller" failed (1/37); restored → 37/37 |

## 8. Security results

- Tenant isolation: composite FKs on every S1 table; actor-org predicates in every service; foreign = 404; strict bodies refuse `organizationId`.
- 401 / 409 / 428 / 503 / 403 order through `requireAtsActor`; ATS capabilities isolated in `src/lib/ats/rbac.ts`; no change to `roles.ts` or `org/rbac.ts`.
- No auto-advance / reject / hire: static and behavioural gates; conditional updates; `STALE` on concurrency.
- Prompt injection: identical scores for an injected résumé, risk flag raised.
- No PII in audit metadata (asserted); no log call in intake / decision / engine / extractor / worker / apply route (static gate).

## 9. Known limitations

- CV **file** upload not implemented; no private blob store configured.
- S0 routes (`overview`, `analytics`, `pipeline`, `candidates` GET) still serve fixtures behind the `authoring` gate; `InterviewPlannerClient` still renders hardcoded interviews (roadmap S2).
- No PostgreSQL integration test and no Playwright/e2e were run; all new coverage is unit + route-handler with a captured fake Prisma. The migration has never executed against a real database.
- **BLOCKER — `.env.example` not updated.** Both a shell read and the Read tool are refused by this environment's permission settings ("directory denied by your permission settings"); no workaround was attempted. The five variable names (`RECRUITMENT_IDEMPOTENCY_SECRET`, `ATS_REVIEW_WORKER_TOKEN`, `ATS_AI_REVIEW_PROVIDER`, `ATS_AI_EXTERNAL_PROCESSING_ALLOWED`, plus the runner's `ATS_REVIEW_WORKER_INTERVAL_MS` / `ATS_REVIEW_WORKER_BATCH`) are documented in `ATS_PRODUCTION_RUNBOOK.md` §1 and must be added to `.env.example` by someone with access.
- Three pre-B2 writers (`db.ts#createApplication`, `db.ts#updateApplicationStatus`, `application.ts#persistApplication`) still exist and would bypass the stage gate if called. None has a production caller; `ats-b2-s1-production-boundary` now fails if one ever gains one. Deleting them is a separate, reviewable change.
- `db.ts#updateApplicationStatus` now has zero consumers; left in place, not deleted.
- `/api/ats/jobs` GET calls `resolveOrgContext`, which is not a registered token, so the inventory classifies it `AUTHENTICATED_USER` — an understatement, conservative, pre-existing.
- Pre-B2 candidate rows with mixed-case e-mails would not dedupe against the lower-cased B2 intake (none expected; unverified against real data).
- Stage-1 apply **form** UI not built: when the owner opens intake it is API-only until roadmap S3.

## 10. Exact next activation steps

See `ATS_PRODUCTION_RUNBOOK.md` §3. In short, per organization: approve a `RECRUITMENT_CANDIDATE` retention policy with a real period → set `RECRUITMENT_IDEMPOTENCY_SECRET` → apply a role profile to each job → set `ATS_REVIEW_WORKER_TOKEN` and run `npm run ats:review:worker` → **owner** sets `APPLICATION_ACCEPTANCE_AUTHORIZED = true` in a dedicated reviewed commit, after the migration has been applied through the deploy contract on a verified backup.

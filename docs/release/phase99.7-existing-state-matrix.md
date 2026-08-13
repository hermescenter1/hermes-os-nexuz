# Phase 99.7 — Existing release/deployment infrastructure matrix

Evidence-first audit performed before any code was written, so Phase 99.7 could
**extend and harden** what Phases 91–99 already built rather than grow a second,
competing release subsystem.

Audit base: `cbfa2923318827ee42614c07f2e3861a3db8ed99` (origin/main).

Classification:

| Class | Meaning |
|---|---|
| `EXISTING` | Present, adequate, reused unchanged by Phase 99.7 |
| `PARTIAL` | Present but insufficient for this cutover — hardened or extended here |
| `MISSING` | Not present before Phase 99.7 — added here |
| `OWNER_CONFIGURATION` | Operator/host fact this repository cannot observe or assert |
| `EXTERNAL_GATE` | Requires evidence from outside this repository; stays blocked |

---

## 1. Continuous integration and assurance workflows

| Item | Class | Evidence / action |
|---|---|---|
| `ci.yml` — validate (prisma/types/lint/test/build) | `EXISTING` | Reused unchanged |
| `ci.yml` — `npm audit --audit-level=high` dependency gate | `EXISTING` | Phase 99.6; reused unchanged |
| `ci.yml` — Phase 91/92/93/96 PostgreSQL rehearsals | `EXISTING` | Fresh-database migration + idempotency already proven per phase |
| `phase97-compliance-assurance.yml` | `EXISTING` | Untouched |
| `phase98-dr-release-assurance.yml` | `EXISTING` | Untouched |
| `phase99-security-pilot-readiness.yml` | `EXISTING` | Untouched |
| `deploy.yml` — manual-only, SHA-pinned, non-root, pinned host key, `-p hermes` | `EXISTING` | Every existing safety property preserved verbatim |
| `deploy.yml` — migration/backup/adoption prerequisites | `MISSING` → added | It rebuilt `hermes-web` and nothing else; see §6 |
| Phase 99.7 assurance workflow | `MISSING` → added | `.github/workflows/phase997-production-completion.yml` |

## 2. Migration tooling

| Item | Class | Evidence / action |
|---|---|---|
| `scripts/dr/migration-gate.mjs` (checksums, historical-mutation detection) | `EXISTING` | Reused as the engine of the Phase 99.7 gate |
| `scripts/dr/migration-sql-classify.mjs` | `EXISTING` | Reused for deploy-time classification |
| `phase98-migration-rollback-rehearsal.mjs` | `EXISTING` | Proves the *mechanism*; untouched |
| Proof of the **actual** 49 → 69 delta for this cutover | `MISSING` → added | `scripts/ci/phase997-migration-integrity.mjs` + checked-in ledger |
| Rehearsal of the **deployed-baseline → target** upgrade | `MISSING` → added | `scripts/ci/phase997-migration-rehearsal.mjs` (real pg16) |
| Line-ending-independent migration identity | `PARTIAL` → hardened | `computeMigrationChecksums` hashes raw bytes; a Windows `core.autocrlf` checkout reported 39 of 49 historical migrations as mutated. Phase 99.7 normalises both sides. |

## 2b. Build tooling and migration execution (owner-review round 2)

| Item | Class | Evidence / action |
|---|---|---|
| Migration execution on deploy | `MISSING` → added | The runner image's `CMD` is `node server.js` and it ships only the Prisma runtime; **nothing applied migrations**. `deploy.yml` now runs them explicitly via the pinned `hermes-migrate` service before `hermes-web` is replaced, then verifies `migrate status` plus the applied/failed counts. |
| Pinned, target-derived migrator | `MISSING` → added | Dockerfile `migrator` stage, built from the release checkout; non-root; profile-gated compose service that `up -d` never starts. |
| Prisma client generation pinned | `PARTIAL` → hardened | `RUN npx prisma generate` is correct on a healthy dependency layer (a clean no-cache build generates client **v7.8.0** as expected). Its hazard is the *fallback*: on a degraded layer cache an observed build logged npm about to install **`prisma@7.9.1`** while this repository pins **`7.8.0`**, failing only afterwards on `Could not resolve @prisma/client`. Now invokes the local CLI (`node node_modules/prisma/build/index.js generate`), so the version is an artifact of `package-lock.json` and a missing dependency fails loudly instead of being silently substituted. Enforced by the `UNPINNED_BUILD_TOOLING` gate. |
| Server worktree cleanliness / build-context proof | `MISSING` → added | Dirty worktree refuses **before** checkout; after checkout `HEAD == TARGET_SHA` and a clean tree are proven **before** any build. |
| Previous-good image | `PARTIAL` → hardened | Was a warning; now a hard refusal, and the preserved tag is verified to resolve to exactly the pre-cutover image ID. |
| Compose env-file interpolation | `PARTIAL` → hardened | Every production Compose invocation now passes `--env-file .env.production`; without it the `NEXT_PUBLIC_*` build args interpolate to empty strings. Statically enforced. |
| Candidate gate ↔ repository `.env.production` | `PARTIAL` → hardened | The gate wrote and deleted the repository file. It now runs entirely from a temp workspace and redirects each declaring service with `env_file: !override`; a sentinel proves byte-for-byte survival on both the PASS and FAIL paths. |
| Local test collection isolation | `PARTIAL` → hardened | `vitest` collected a second full checkout from `.claude/worktrees/**` (331 real files → 656 collected), attributing another branch's failures to this one. Root-anchored excludes added for `.claude` and `.next`. |

## 3. Backup / restore / encryption

| Item | Class | Evidence / action |
|---|---|---|
| `scripts/backup-postgres.sh` (AES-256-GCM `.hbk`, verify, atomic publish, sidecar) | `EXISTING` | Reused unchanged; it already fails closed on missing key material |
| `scripts/verify-backup.sh`, `scripts/restore-postgres.sh` | `EXISTING` | Untouched |
| `scripts/dr/hbk.mjs`, `backup-envelope.mjs`, `apply-retention.mjs` | `EXISTING` | Untouched |
| `scripts/dr/backup-uploads.mjs` / `restore-uploads.mjs` | `EXISTING` | Untouched |
| A **release gate** that refuses a migration-bearing cutover without verified backup evidence | `MISSING` → added | `scripts/dr/release-prerequisites.mjs` + host-side check in `deploy.yml` |
| Off-host copy of the verified artifact | `OWNER_CONFIGURATION` | Never reported as PASS — stays `OWNER_CONFIGURATION_BLOCKED` |
| Owner-activated backup cron actually running in Production | `OWNER_CONFIGURATION` | Outside anything CI can observe (Phase 98 known limitation, unchanged) |

## 4. Documents / uploads persistence

| Item | Class | Evidence / action |
|---|---|---|
| `uploads_data` volume | `EXISTING` | Unchanged |
| `documents_data` volume (Phase 98, additive) | `EXISTING` | Unchanged |
| One-time adoption of the legacy writable-layer documents | `PARTIAL` → replaced | The DR runbook carried an illustrative `docker cp` pair (including a non-existent `documents_data-placeholder` service and a Windows-style path). No count, no integrity, no collision refusal. |
| Verifiable adoption mechanism | `MISSING` → added | `scripts/dr/documents-adoption.mjs` + `scripts/dr/adopt-documents.mjs` CLI |
| Adoption rehearsal reproducing the real loss scenario | `MISSING` → added | `scripts/ci/phase997-documents-adoption-rehearsal.mjs` |

## 5. Release manifest / rollout state / rollback

| Item | Class | Evidence / action |
|---|---|---|
| `scripts/dr/release-manifest.mjs` (secret-free, previous-good required) | `EXISTING` | Reused; its `previousGoodGitSha` rule is mirrored in the prerequisite gate |
| `scripts/dr/release-state.mjs` (rollout state machine, `classifyRollback`) | `EXISTING` | Reused conceptually by the cutover contract |
| `scripts/dr/blue-green.mjs`, `release-journal.mjs`, `rpo-rto.mjs` | `EXISTING` | Untouched |
| Previous-good **image** preserved on the host before a rebuild | `MISSING` → added | `deploy.yml` tags `hermes-web:previous-good` before the rebuild |
| Written cutover/rollback contract for this specific release | `MISSING` → added | `docs/release/phase99.7-production-cutover-contract.md` |

## 6. Candidate validation

| Item | Class | Evidence / action |
|---|---|---|
| `phase99-disposable-app-security.mjs` (security smoke on the real image) | `EXISTING` | Untouched — different question (security contract, not release fitness) |
| `phase98-full-node-recovery.mjs` (rebuild-from-backup) | `EXISTING` | Untouched |
| `deploy/rehearsal/docker-compose.rehearsal.yml` | `EXISTING` | Reused unchanged |
| Pinned-SHA release candidate gate (health, readiness, `/fa` `/en` `/de`, severe logs, restart count, OpenBao off) | `MISSING` → added | `scripts/ci/phase997-candidate-gate.mjs` |

## 7. `sharp` runtime

| Item | Class | Evidence / action |
|---|---|---|
| `sharp` pinned to `0.35.3` via `overrides` | `EXISTING` | Phase 99 remediation; never downgraded |
| `IMAGE_OPTIMIZER_SERVES` check in the Phase 99 security smoke | `PARTIAL` | Exercises the endpoint, but only within the security job |
| Real runtime gate (SSE4.2 classification + import + decode + transform) | `MISSING` → added | `scripts/dr/sharp-runtime-gate.mjs`, run **inside** the candidate container |
| Production host CPU actually advertising SSE4.2 | `OWNER_CONFIGURATION` | Owner-supplied operational evidence (`PRODUCTION_CPU_SSE4_2=PASS`, Phase 99). Re-check on any host change. |

## 8. OpenBao credential plane

| Item | Class | Evidence / action |
|---|---|---|
| `src/lib/ot-edge/secret-backend.ts` — disabled unless `OT_SECRET_BACKEND === "openbao"`, enabled-but-invalid throws | `EXISTING` | **Unchanged by Phase 99.7**; re-asserted by `phase997-release-safety.test.ts` |
| `docker-compose.openbao-staging.yml`, `scripts/openbao-*` | `EXISTING` | Untouched |
| Private transport to the OpenBao host | `OWNER_CONFIGURATION` | Unchanged; the backend ships disabled |

## 9. Gates that remain blocked

| Item | Class |
|---|---|
| Independent penetration test | `EXTERNAL_GATE` |
| External application security review | `EXTERNAL_GATE` |
| External API security review | `EXTERNAL_GATE` |
| Pilot acceptance / UAT | `EXTERNAL_GATE` |
| External legal / privacy reviews | `EXTERNAL_GATE` |
| Owner pricing / Stripe decisions | `OWNER_CONFIGURATION` |
| Owner backup off-host configuration | `OWNER_CONFIGURATION` — see §10 |
| Live model-evaluation evidence | `EXTERNAL_GATE` |

No amount of green CI substitutes for any row in this table.

## 10. Owner evidence supplied outside CI (recorded 2026-08-08)

`OWNER_CONFIGURATION` in this matrix is a statement about what **this repository
and its CI can observe** — it is not a statement that the owner has done
nothing. The owner has separately supplied evidence for the items below. The
two channels are deliberately kept distinct: owner evidence stands on its own
and is never laundered into a CI `PASS`, and a CI `OWNER_CONFIGURATION_BLOCKED`
status is never read as "missing" when owner evidence exists beside it.

| Item | Owner evidence | CI-side status |
|---|---|---|
| Production deployment | Production established at `cbfa2923318827ee42614c07f2e3861a3db8ed99` with 69 completed migrations (the 49 → 69 rehearsal baseline in §2 stays as the historical record of what this phase rehearsed) | Not observable |
| Production CPU SSE4.2 / `sharp` runtime | Operational evidence supplied (Phase 99 `PRODUCTION_CPU_SSE4_2=PASS` lineage); re-check on any host change | Candidate gate proves the image, not the host |
| Off-host JIT backup copy | Owner evidence supplied | `OWNER_CONFIGURATION_BLOCKED` |
| Host-to-OpenBao WireGuard/TLS transport | Prior owner evidence exists | Not observable |
| Application-container-to-OpenBao connectivity / backend enablement | **None — unproven**; `OT_SECRET_BACKEND` stays unset/disabled, enabled-but-invalid fails closed | `DISABLED` (test-proven) |

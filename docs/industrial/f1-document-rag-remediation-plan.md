# F-1 Remediation Plan: Tenant Isolation for Document RAG

Status: **Stage 1 IMPLEMENTED (uncommitted, not deployed)**, owner-approved 2026-09-23.
Stage 0 was done by the owner: the production flag was reported `disabled`. Stage 2 is not started.
Finding details and evidence: `knowledge-security-findings.md` §F-1.
Baseline: `origin/main` @ `1c7aa40`. Results: §7.

## 0. Principles

- **Fail closed.** An unresolved or ambiguous owner, a NULL-tenant document, or a missing join returns **zero** chunks, never "all".
- **Filter in SQL.** The tenant predicate lives in the query itself, not in a JavaScript post-filter.
- **Owner derivation stays server-side.** It comes from `resolveBrainOwner()` (`src/lib/storage/brain-owner.ts:64-76`), never from the body, query or headers.
- **No behaviour change with the flag off.** Every response contract stays byte-compatible.
- **Delivery.** A separate branch from `origin/main` and a small reviewable PR. No other scope.

## 1. Stage 0: containment (operator, no code)

Run the production check in `knowledge-security-findings.md` §F-1.4. If it prints `enabled`, set the flag to `false` and recreate `hermes-web` using the documented steps, with rollback. This is an owner or operator action; this session has no production access.

Stage 1 is designed so that it is safe **even if** the flag stays on.

## 2. Stage 1: code fix, no schema change

The goal is to make every document-chunk search tenant-scoped, using the existing `Document.tenantId` column.

1. **`src/lib/documents/chunk-vector-store.ts`**
   - `search(queryVector, topK, scope)` takes a **required** `scope: { orgId: string }`. There is no optional or overloaded unscoped variant.
   - The SQL becomes a join:
     ```sql
     SELECT c.id, c."documentId", c.position, c.text, c.metadata,
            1 - (c.embedding <=> $1::vector) AS score
     FROM "DocumentTextChunk" c
     JOIN "Document" d ON d.id = c."documentId"
     WHERE c.embedding IS NOT NULL
       AND d."tenantId" = $2            -- never NULL-matching
       [AND c."documentId" = $3]
     ORDER BY c.embedding <=> $1::vector
     LIMIT $n
     ```
   - The in-memory/session store implements the same predicate. Its chunks have no tenant, so it looks up the document map and returns an empty list when the lookup fails.
2. **`src/lib/documents/search.ts`**: `searchDocuments(query, topK, scope)`, with the scope **required**. If `scope.orgId` is falsy, return `{ matches: [] }` **before** calling the embedding provider, so no question leaves the host.
3. **`src/app/api/brain/route.ts`**
   - Pass the already-resolved `owner` into `buildDocumentRagEvidence(question, owner)`.
   - If `!owner || owner.ambiguous || !owner.orgId`, return `{ enabled: true, matches: [], fallbackUsed: true, error: "document_rag_scope_unavailable" }` with no search.
   - The response shape stays unchanged.
4. **`src/app/api/documents/search/route.ts`** (F-1.5 / F-2): resolve the caller's org the same way and pass the scope. With no org, return an empty result. A platform-admin cross-tenant search, if ever needed, must be a separate, explicitly named and audited function. It is not part of this fix.
5. **Type-level guard.** The `scope` parameter is non-optional in `ChunkVectorStore.search`. `tsc` then fails on any future unscoped caller.

**Consequence.** `Document.tenantId` is never written today (F-2), so every existing document becomes invisible to Brain document RAG after Stage 1. That is the intended fail-closed outcome. Legacy rows need an explicit owner decision to reattach them (Stage 2); they are never guessed.

## 3. Stage 2: schema hardening (separate PR, owner-approved migration)

1. Additive migration:
   - Add `organizationId` to `DocumentTextChunk` (and `DocumentChunk`).
   - Add a composite unique `Document(id, tenantId)` and a composite FK `DocumentTextChunk(documentId, organizationId) → Document(id, tenantId)`.
   - This follows the composite-tenant-FK pattern already used in the repository (Phase 109-C-UI.2 R7).
2. Backfill:
   - Only rows whose parent `Document.tenantId` is non-NULL get copied.
   - NULL-tenant documents and their chunks stay NULL and invisible. The owner decides per document whether to assign them or quarantine them. **Nothing is deleted.**
3. `/api/documents` write paths (F-2) start writing `tenantId` from `requireOrgActor` context.
4. Rollback: a new down migration that drops the added FK, unique index and columns. There is no data loss, because the columns are additive.

## 4. Regression tests (must be RED on the current baseline, GREEN after the fix)

| # | File (proposed) | Assertion |
|---|---|---|
| R1 | `src/lib/documents/__tests__/chunk-vector-store.scope.pg.test.ts` (real PG) | Seed org A and org B documents and chunks with embeddings. A search scoped to A returns **only** A chunk ids; B text never appears. |
| R2 | same | Chunks whose `Document.tenantId IS NULL` are never returned for any scope. |
| R3 | same | A chunk with no parent `Document` row (orphan) is never returned. |
| R4 | `src/lib/documents/__tests__/search-scope.test.ts` | `searchDocuments` with an empty or undefined `orgId` returns `[]` and **does not call** the embedding provider (spy). |
| R5 | `src/app/api/brain/__tests__/route.test.ts` (extend) | Flag on, owner in org A, and the store mock holds A and B chunks. `documentRagEvidence.matches` contains only A. A planted canary string in a B chunk is absent from the serialised body. |
| R6 | same | Flag on, `resolveBrainOwner()` returns `null`, `ambiguous: true` or `orgId: null`. Result: `matches: []`, no provider call, and the deterministic fields are unchanged. |
| R7 | same | Flag on, the request body carries `organizationId`/`tenantId` of org B. The value is ignored and only A results are returned. |
| R8 | same (existing `:384-410`) | With the flag off or `"false"`, there is still no `documentRagEvidence` key. This one must stay green. |
| R9 | `src/app/api/documents/search/__tests__/route.test.ts` (extend) | A platform admin whose session org is A never receives B chunks. With no org, the result is empty. |
| R10 | type test (`tsc --noEmit` in CI) | A call to `getChunkVectorStore().search(v, k)` without a scope fails to compile. It lives in a `@ts-expect-error` fixture. |
| R11 | `src/lib/security/__tests__/…` static invariant | Grep-based guard: no raw SQL on `"DocumentTextChunk"` without a `"tenantId"` or `"organizationId"` predicate. It is paired with a planted-violation control, so the guard is proven to catch. |

**Mutation proof.** After the fix, temporarily delete the `AND d."tenantId" = $2` line locally. R1, R2, R5 and R9 must turn RED, then restore the line. The results are recorded in the PR.

## 5. Validation to run for the fix PR

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
- The real-PostgreSQL test lane for R1–R3 (`*.pg.test.ts` runs in the CI phase91 job).
- Stage 2 only: `npx prisma validate`, `npx prisma generate`, and a migration-safety test in the style of `prisma/__tests__/*-migration-safety.test.ts`.
- Do not use `prisma format`, which rewrites the schema (known repository hazard).

## 6. Risks

- **Legacy invisibility (Stage 1).** Any document relied on by admins disappears from Brain RAG until it is reattached. Accepted as the fail-closed behaviour.
- **Owner model mismatch.** `Document` uses `tenantId` while the org model uses `organizationId`. Stage 2 must confirm that `tenantId` holds organisation ids before using the composite FK.
- **External embedding.** The flag-on path sends questions to OpenAI by default (`embedding-provider.ts:27-30`). That is a separate governance question, surfaced to the owner under D6.

## 7. Stage 1 results (2026-09-23, uncommitted)

Branch `feature/industrial-knowledge-library`, HEAD `1c7aa405` (no commit). Worktree `E:\hermes-knowledge-library`. The flag was never enabled, and nothing touched production.

**Code changed**
- `src/lib/documents/chunk-vector-store.ts`: `ChunkSearchScope` is a required parameter. Two fully literal SQL statements with `INNER JOIN "Document"` and `d."tenantId" = $2`. The session store applies the same predicate. An unusable scope returns `[]`.
- `src/lib/documents/search.ts`: `searchDocuments(query, scope, topK)` has a required scope. `resolveDocumentSearchScope(owner)` fails closed. With no scope, the embedding provider is not called.
- `src/app/api/brain/route.ts`: passes the server-resolved `owner`. Returns `document_rag_scope_unavailable` when there is no scope.
- `src/app/api/documents/search/route.ts`: scoped to the caller's resolved organization.
- `scripts/security/phase99/static-invariants.mjs`: the now-stale `RAW_SQL_ALLOWLIST` exception for `chunk-vector-store.ts` is removed. The site no longer interpolates anything, so the gate is **stricter**.

**Tests added or updated.** Existing assertions were not weakened; setups now seed tenant-owned documents or pin a single-org owner.
- `src/lib/documents/__tests__/pg/chunk-vector-store-scope.pg.test.ts`: real PostgreSQL R1–R3, documentId cross-tenant, unknown tenant, SQL-shaped orgId.
- `src/lib/documents/__tests__/chunk-vector-store.test.ts`, `search.test.ts`, `embedding.test.ts`: session-mode R1–R4 and `resolveDocumentSearchScope`.
- `src/app/api/brain/__tests__/route.test.ts`: R5, R6 (4 owner shapes, no embedding call), R7 (body tenant fields ignored). Model-context canary for governance 0 and 1: no chunk text reaches `completeTask` or `aiRouter.ask`. The simulated-failure test now proves `searchDocuments` is called with the scope.
- `src/app/api/documents/search/__tests__/route.test.ts`: R9 (org A, personal, ambiguous, null owner, body tenant fields).
- `src/lib/documents/__tests__/f1-scope-invariants.test.ts`: R10 (`@ts-expect-error`) and R11 (static guard with a planted control).
- `src/lib/documents/__tests__/tenant-fixtures.ts`: shared fixtures.

**Validation actually run**

| Command | Result |
|---|---|
| Real PostgreSQL: disposable local `pgvector/pgvector:pg16` (tmpfs, `--rm`), `prisma migrate deploy` (all repo migrations), `vitest --config vitest.phase91-postgres.config.ts <F-1 pg file>` | **8/8 PASS**. Container stopped and removed afterwards. |
| `vitest run` F-1 suites + phase99 static invariants + phase100 evaluators (16 files) | **16 files, 322 tests PASS** |
| `tsc --noEmit -p tsconfig.json` (no `typecheck` script exists in package.json) | **0 errors** |
| `next lint --file …` (all 13 changed or added files) | **No ESLint warnings or errors** |
| Full `vitest run` | 2 failures, both outside F-1: `phase100-closure-eval` "emits the complete Phase 100 output contract" timed out under load (64.9 s > 60 s) and **passes when re-run idle**; `phase997-sharp-runtime` "imports sharp…" times out inside the Vitest worker even idle, while `runSharpRuntimeSmoke()` outside Vitest succeeds in 76 ms (sharp 0.35.4). Neither file is in the diff. The sharp result was **not** reproduced on a clean baseline. |
| `next build` | **Not run.** The change is server-side logic fully covered by typecheck and tests. |

**Mutation proof.** Each mutation was applied, run, then restored; the sha256 of every restored file matched.

| Mutation | Caught by |
|---|---|
| M1: SQL tenant predicate replaced by `$2::text IS NOT NULL` (both statements) | real-PG suite: 6/8 RED |
| M2: session-store `ownedDocumentIds` filter removed | 12 tests RED across 4 files (R1, R2, R3, R5, R7, R9) |
| M3: `searchDocuments` scope guard removed | R4 "never calls the embedding provider" RED |
| M4: `owner.ambiguous` check removed | 2 RED (unit + R6 route) |
| R10: `scope` made optional | `tsc`: TS2578 unused `@ts-expect-error` |
| R11: SQL predicate removed | the static guard RED |

**Remaining limits**
- Stage 2 (tenant column and composite FK) is not implemented. The Stage 1 predicate relies on `Document.tenantId`, which is never written today (F-2), so every existing document is invisible to document RAG (fail closed).
- `Document.tenantId` holding organisation ids is an assumption, confirmed only by this code's own use. It must be verified before Stage 2.
- Personal (org-less) users get no document RAG by design.
- Not committed, not pushed, not deployed. `HERMES_DOCUMENT_RAG_ENABLED` stays `disabled` in production (owner-reported).

## 8. Review follow-ups (2026-09-24, uncommitted)

The independent review gave **PASS WITH FOLLOW-UPS**. This section records the follow-ups the owner approved. Test and documentation changes only: no production code, no migration, nothing for F-2 or F-3.

| # | Follow-up | Change |
|---|---|---|
| FU-1 | The model-context test for governance=1 never reached the gateway, because the provider policy denies by default | `src/app/api/brain/__tests__/route.test.ts`, model-context test rewritten. For governance=1 it now enables the governed path with an eligible environment and a provider policy approved for org-a **only**. A shared event log asserts the order: owner scope first, then every LLM call (gateway and router), then the single embedding call. Positive controls cover `completeTask` (default or governed path), `ask`, exactly one `embed`, and matches equal to `doc-tenant-a`. The embedding provider receives only `{ chunkId: "__query__", text: question }`. No outbound payload (gateway, router or embedding) contains own-tenant or foreign chunk text. The suite saves and restores `HERMES_AI_GOVERNANCE_ENFORCED`, `HERMES_DEPLOY_ENV` and `HERMES_EXTERNAL_AI_ENABLED`. |
| FU-2 | The R11 guard only matched `FROM "DocumentTextChunk"` | `src/lib/documents/__tests__/f1-scope-invariants.test.ts`, R11 rewritten. It reuses the Phase 99 scanner's `walkSource` and `readSourceCode`: tests are excluded and comments stripped, without duplicating the walker. Three rules. **(1)** Every raw read via `FROM` or `JOIN`, in any case, carries a tenant predicate in the same statement. **(2)** The typed Prisma delegate `documentTextChunk` is used only in the single choke point `src/lib/documents/chunk-repository.ts`. **(3)** Repository reads (`list`, `listByDocumentId`) are detected directly, through a variable alias, through destructuring, or through an **import alias**. None may occur outside `src/lib/documents/`, and the unfiltered `list()` has no production caller. Each rule has planted controls and a positive control that proves it sees the real production occurrences. |
| FU-3 | The inventory said "77 migrations" | Corrected to **76** in `knowledge-source-inventory.md` §3, with the commands used as evidence. |
| FU-4 | The R1 title claimed a "best match" although the scores are equal | Renamed to "…even when both chunks have an identical similarity score". The assertion is unchanged. |
| FU-5 | `zz-f1-review-probe.test.ts` | It existed **only** in the disposable review worktree (`E:\hermes-f1-review\src\app\api\brain\__tests__\`). It was deleted from there right after the probe run on 2026-09-23. It was **never** in this branch or this worktree, and it is not present in either tree today. |

**Mutation proof for the follow-ups.** Each mutation was applied in this worktree, run, then restored; every sha256 matched.

| Mutation | Expected | Result |
|---|---|---|
| MC1: document-RAG block moved before the LLM paths | RED | RED (both governance modes) |
| MC2: governed path given an unknown provider id, so it never reaches the gateway | RED | RED (governance=1) |
| R11-M1: unscoped `JOIN "DocumentTextChunk"` read added | RED | RED |
| R11-M2: vector-store tenant predicate neutralised | RED | RED |
| R11-M3: typed delegate used in a route | RED | RED |
| R11-N1: delegate mentioned in a **comment** only | GREEN | GREEN (no false positive) |
| R11-M4: repository read from `/api/brain` through an **import alias** | RED | RED. It initially passed GREEN, which exposed a detector gap; the detector was fixed to resolve import aliases and a planted control was added. |
| R11-M5: unfiltered `list()` called inside the pipeline | RED | RED |

**Full-suite comparison, baseline vs fix (as observed; not assumed).** Runs were on this host with default Vitest concurrency. Baseline = a clean detached worktree at `1c7aa405`.

| Run | Test Files | Failed tests | Unhandled "Errors" |
|---|---|---|---|
| Fix, run 1 (2026-09-23, before the allowlist fix) | 3 failed / 514 passed / 9 skipped (526) | 10: phase99 raw-SQL gate (real, caused by the change, then fixed) plus 9 phase100 knock-on failures | 22 |
| Fix, run 2 (after the fix) | 2 failed / 485 passed / 9 skipped (496) | phase100 output-contract timeout (64.9 s > 60 s); phase997 sharp smoke timeout | 52 |
| Baseline `1c7aa405` | 1 failed / 526 passed / 9 skipped (536) | "is imported by no route module" timeout (67.9 s) | 11 |

- **What the unhandled errors are:** in every run they are `[vitest-pool]: Failed to start forks worker`. The affected files never ran, and the set differs from run to run.
- **Follow-up runs:**
  - All 54 files that failed to start in the two fix runs were re-run on the fix tree with 3 workers, and the last 3 serially: **54 files, all PASS**.
  - The baseline's 11 unstarted files: **11 files, all PASS**.
  - Run idle on **both** trees, the phase100 and phase997 tests **PASS**: sharp 4 of 4 runs, phase100 on both.
- **Conclusion:** every observed full-suite failure outside the phase99 gate is a load or worker-start timeout that also occurs, in different tests, on the clean baseline. **No F-1-attributable failure remains.** This conclusion comes from the reruns above, not from an assumption that the failures were pre-existing.
- **Correction:** a note in §7 said the sharp test "times out inside the Vitest worker even idle". That was wrong. That run was not idle, because `next lint` was running concurrently.

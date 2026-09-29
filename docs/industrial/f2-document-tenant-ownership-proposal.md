# F-2 Proposal: Tenant Ownership for the Document Pipeline

Status: revisions **R1–R5** (2026-09-24 → 2026-09-28), **committed on branch
`feature/f2-document-tenant-ownership` for review; not merged, not deployed** (see §11, §12.12). No production change,
no production migration and no data change has been made. `HERMES_DOCUMENT_RAG_ENABLED` stays
**disabled**. No legacy document is to be assigned, archived or deleted
automatically.

- Baseline read: `origin/main` @ `562f9972` (F-1 merged, PR #104).
- Finding: `knowledge-security-findings.md` §F-2.
- F-1 context: `f1-document-rag-remediation-plan.md`.
- F-3 is **out of scope**.

R1 changes:
1. Every statement about **production data** is now separated from code evidence and marked `UNVERIFIED` until the read-only counts in §10 are run.
2. The chunk-level `organizationId` + composite-FK design was re-evaluated (§3.2). The recommendation is now **no duplicated tenant column on chunks** (Option S).
3. The decision table (§9) now records the recommendation, consequence, evidence prerequisite and approver for each item.

---

## 1. Evidence

### 1A. Code evidence (verified in this repository)

| # | Fact | Evidence |
|---|---|---|
| C-1 | No production code path **writes** `Document.tenantId`; it is only read by the repository mapper. | writers: none; reader: `src/lib/documents/document-repository.ts:111` |
| C-2 | No production code path **writes** `Document.uploadedBy`. The upload `create()` payload omits it. | `src/app/api/documents/route.ts:116-131`; reader only: `document-repository.ts:110` |
| C-3 | C-1 and C-2 hold for the **whole Git history**. `src/app/api/documents/route.ts` has a single commit (`3587660`, 2026-06-16, "phase 16b document upload"), which already omitted both fields. The only commits touching `tenantId`/`uploadedBy` in the documents code are the type definition (`a761dd5`) and F-1 (`68f45fb`, read-side only). | `git log --follow` / `git log -S` on `origin/main` |
| C-4 | The only production writer of `Document` rows is `POST /api/documents`. No seed, script or import writes `Document`. The one migration that updates `Document` changes only `status`/`lastProcessedAt`. | grep over `src/`, `scripts/`, `prisma/`; `prisma/migrations/20260618000000_resize_document_text_chunk_embedding/migration.sql:33-35` |
| C-5 | That route has **always** been gated by the platform capability `can(role, "admin")` alone. It uses no `requireOrgActor` and no org permission. | `route.ts:39-49`; the same gate at `3587660` |
| C-6 | The upload audit event `DOCUMENT_UPLOADED` records `userId` and `entityId`, and **no `organizationId`**. | `route.ts:158-164`; `AuditLog.organizationId String?` |
| C-7 | Audit rows are prunable: `scripts/audit-retention.mjs` defaults to 365 days (minimum 30). | `scripts/audit-retention.mjs:39-52` |
| C-8 | `OrganizationMember` has no history (`status` is overwritten; no validity window). Membership at upload time cannot be reconstructed from the schema. | `prisma/schema.prisma:727` |
| C-9 | `DocumentTextChunk` has no tenant column and no FK to `Document`. | `prisma/schema.prisma:182` |
| C-10 | `DocumentChunk` (the table used by `src/lib/rag/vector-store-pgvector.ts:45`) holds the RAG pipeline's static public corpus, not `Document` rows. | `vector-store-pgvector.ts:11,45` |
| C-11 | There is no document-specific org permission. | `src/lib/org/rbac.ts:10-144` |
| C-12 | Deploy runs `prisma migrate deploy` **before** recreating `hermes-web`. Migrations must therefore be compatible with the running code. | `.github/workflows/deploy.yml:401-431` |
| C-13 | F-1 retrieval takes the tenant **only from the parent `Document`**: `INNER JOIN "Document" d … AND d."tenantId" = $2`. | `src/lib/documents/chunk-vector-store.ts:198-222` |
| C-14 | Precedents in the repo: composite tenant FKs (Phase 97) and guarded manual data workflows (Phase 106). No migration uses `NOT VALID`. | `…/20260820000011_phase97_…/migration.sql:86-103`; `.github/workflows/journal-import.yml` |

### 1B. Production-data claims (P-1..P-7 measured by the owner on 2026-09-24)

Code evidence says how rows *should* have been written by this application. It does not prove the **actual** production contents: rows could have come from manual SQL, a restore from another environment, or an earlier deployment of a different codebase. Each claim below stays `UNVERIFIED` until its read-only query (§10) is run by the owner or an operator.

| # | Claim | Status | Query |
|---|---|---|---|
| P-1 | Every production `Document` has `tenantId IS NULL` | **MEASURED (owner-reported): 0 documents exist**, so the claim is vacuously true | Q1 |
| P-2 | Every production `Document` has `uploadedBy IS NULL` | **MEASURED (owner-reported): 0 documents** | Q2 |
| P-3 | Every production `Document` was uploaded by a platform admin | **MEASURED (owner-reported): no documents and no related upload audit rows**, so there is nothing to attribute | Q5 |
| P-4 | No non-null `tenantId` points to a missing `Organization` | **MEASURED (owner-reported): 0** | Q3 |
| P-5 | The number of orphan chunks (no parent `Document`) | **MEASURED (owner-reported): 0** | Q6 |
| P-6 | The volume of `Document` and `DocumentTextChunk` | **MEASURED (owner-reported): Document = 0, DocumentTextChunk = 0** | Q4, Q7 |
| P-7 | Whether upload audit rows still exist for legacy documents | **MEASURED (owner-reported): no related upload audit rows** | Q5 |
| P-8 | `HERMES_DOCUMENT_RAG_ENABLED` is disabled | owner-reported `disabled` (2026-09-23), not observed by this session | F-1 §F-1.4 check |

**Production result (2026-09-24, owner-run read-only Q1–Q7):** `Document = 0`, `DocumentTextChunk = 0`, orphan chunks `= 0`, and no related upload audit. There are **no legacy documents**, so **no backfill or manifest is needed** for existing data. Nothing is created, assigned or deleted automatically. The B1 backfill (§4) is kept only as a documented procedure, should documents ever need to be moved later (D-F2-5). This session did not run the queries; the numbers are as reported by the owner.

## 2. Where can a document's tenant come from?

| Candidate source | Trustworthy for ownership? | Verdict |
|---|---|---|
| `Document.tenantId` | only if Q1/Q3 show valid non-null values. Code never wrote any (C-1, C-3), so any value found would have an **unknown provenance** | treat any existing value as **unverified evidence**; never auto-trust (D-F2-3) |
| `Document.uploadedBy` | code never wrote it (C-2) | none expected; confirm with Q2 |
| `AuditLog` `DOCUMENT_UPLOADED.userId` | identifies **who** uploaded (a platform admin, per C-5), not **for which tenant**; may have been pruned (C-7) | evidence for the reviewer only |
| Uploader's current membership | staff membership ≠ customer ownership; no history (C-8) | **rejected** |
| Title, filename, metadata, content | guessing | **rejected** |

**Conclusion.** Nothing in the code or schema provides a deterministic, trustworthy tenant mapping for legacy documents. **No automatic backfill is proposed.** Legacy documents stay unassigned. Under F-1 they are invisible to every tenant, which is fail-closed. They can be assigned only through an owner-reviewed manifest (§4).

The conclusion itself rests on code evidence. §10 confirms whether the production data matches it. If Q1 unexpectedly finds non-null `tenantId` values, those rows are **not** auto-accepted: they go to the manifest review like everything else (D-F2-3).

## 3. Target design

### 3.1 Schema: migration M1, additive (expand); recommended Option S

A new migration; nothing existing is edited. Final SQL is written only after approval.

```sql
-- Document.tenantId becomes a real reference (column name kept, D-F2-1)
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Document_tenantId_createdAt_idx" ON "Document" ("tenantId", "createdAt");

-- Assignment provenance (nullable, no default → no rewrite, old code unaffected)
ALTER TABLE "Document" ADD COLUMN "tenantAssignedAt"       TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "tenantAssignedBy"       TEXT;
ALTER TABLE "Document" ADD COLUMN "tenantAssignmentSource" TEXT;  -- 'UPLOAD' | 'MANIFEST'
ALTER TABLE "Document" ADD COLUMN "tenantAssignmentRunId"  TEXT;  -- backfill run id

-- Optional hygiene (D-F2-6): a plain parent FK so no new orphan chunk can exist.
-- Only if Q6 = 0, or after an owner-approved orphan decision.
ALTER TABLE "DocumentTextChunk"
  ADD CONSTRAINT "DocumentTextChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE;
```

**Properties**
- No data change, and compatible with the running code (C-12).
- **No tenant column on chunks.** The chunk's tenant is always its parent's `tenantId`, read through the join F-1 already performs (C-13).
- The migration **fails safely** if Q3 ≠ 0 (the FK cannot be added). Nothing is modified to make it pass.

### 3.2 Re-evaluation: should `DocumentTextChunk` carry its own `organizationId`?

**Is it necessary for security?** No.
- Retrieval (C-13) already derives the tenant from the parent row in the same SQL statement. A chunk cannot be returned unless its parent exists (`INNER JOIN`) **and** the parent's `tenantId` equals the scope.
- A second copy of the tenant on the chunk does not narrow this further. It only adds a second value that can **disagree** with the first.

**What the composite FK really guarantees.** Considered design: `FOREIGN KEY ("documentId","organizationId") REFERENCES "Document"("id","tenantId")`. PostgreSQL's default is **MATCH SIMPLE**: if **any** referencing column is NULL, the constraint is **not checked at all**.

| Chunk `organizationId` | Parent `tenantId` | MATCH SIMPLE result | Safe? |
|---|---|---|---|
| `A` | `A` | accepted | yes |
| `A` | `B` | **rejected** (no parent row `(id, B)` matches `(id, A)`) | yes |
| `A` | `NULL` | **rejected** (NULL never equals `A`) | yes |
| `A` | parent missing | **rejected** | yes |
| `NULL` | `A` | **accepted, unchecked** | **drift**: the chunk claims no tenant while its parent has one |
| `NULL` | `NULL` or missing | **accepted, unchecked**; also accepts **any** `documentId`, even a nonexistent one | **orphans possible** |

So the composite FK prevents a *wrong* tenant, but **not** a *missing* one. It says nothing about rows where the chunk tenant is NULL. Closing that gap takes additional machinery:

- **MATCH FULL** (all columns NULL or all non-null). This rejects every existing legacy chunk (non-null `documentId`, NULL `organizationId`), so the migration fails unless every chunk is backfilled or removed first. That is not possible while legacy documents stay unassigned (§2).
- **A CHECK constraint** cannot read another table, so it cannot express "NOT NULL when the parent has a tenant".
- **Triggers** would be needed:
  - on chunk insert/update, derive `organizationId` from the parent, never trusting the application;
  - on parent `tenantId` change, propagate to the chunks;
  - then `NOT NULL` could only be imposed after the legacy question is fully resolved.
  - This is database logic this repo does not use today.

**Comparison: Option S (no chunk tenant column) vs Option C (composite FK)**

| Aspect | **Option S** (recommended) | Option C (chunk `organizationId` + composite FK) |
|---|---|---|
| Security | single source of truth; F-1 join enforces it; no mismatch state exists | the FK blocks A≠B, but NULL-lag and orphan states remain unless triggers plus MATCH FULL/NOT NULL are added |
| Data consistency | always consistent by construction | drift is possible (chunk NULL, parent set); needs a backfill of chunks, triggers and verification queries |
| Migration | FK plus index on `Document` only (small table), plus an optional plain parent FK on chunks | new column plus composite FK on the (possibly large) chunk table, plus a unique index on `Document(id, tenantId)`, plus triggers; the lock cost depends on Q7 |
| Backfill | update `Document` only | update `Document` **and** all its chunks in lock-step |
| Query cost | one PK join per candidate chunk (`Document` by `id`) | can avoid the join and allow an `(organizationId, …)` index for **exact** per-tenant scans |
| ANN recall (HNSW) | tenant filtering happens after the nearest-neighbour scan, so a tenant may get fewer than `topK` results when other tenants' chunks are nearer | **same limitation**: the HNSW index is not tenant-partitioned either; it would need per-tenant partial indexes or pgvector iterative scans in both options |
| Rollback | drop FK/index/columns | also drop the column, triggers and indexes; revert chunk backfills |

**Recommendation: Option S.** Reconsider Option C only if **measured** query cost or recall (after Q7 sizing and a staging benchmark) requires chunk-level tenant indexing. If it is adopted then, it must include:
- a trigger-derived `organizationId` (never written by the application);
- propagation on parent reassignment;
- the composite FK;
- `NOT NULL` once no unassigned chunks remain.

It must never rely on the default MATCH SIMPLE behaviour alone. This is D-F2-7.

### 3.3 Code: C1

- **`POST /api/documents`**
  - `requirePlatformAuth → requireOrgActor(orgId) → requirePermission(<D-F2-2>)`.
  - Write `tenantId = ctx.orgId`, `uploadedBy = actor.userId`, `tenantAssignmentSource='UPLOAD'` and `tenantAssignedAt`.
  - Body `organizationId`, `tenantId` and `orgId` are ignored.
  - The audit event carries `organizationId`.
- **List:** `where: { tenantId: ctx.orgId }`, `take ≤ 50`, with a cursor.
- **`GET`, `DELETE /api/documents/[id]` and `POST …/process`:** look up by `(id, tenantId)`. A foreign or NULL-tenant id returns **404**; nothing is processed or deleted.
- **Chunk creation:** unchanged under Option S; chunks inherit the tenant through the parent.
- **F-1 search:** unchanged (parent join and `d."tenantId" = $2`). R11 continues to require a tenant predicate.
- **Platform admin without a single org scope:** sees nothing (the F-1 behaviour). Any cross-tenant platform function is separate and audited (D-F2-4).
- **Phase 99:** regenerate the route inventory and run `security:phase99:inventory:check`.

### 3.4 Invariants

1. The tenant is set only server-side: from the resolved org at upload, or from an owner-approved manifest.
2. `Document.tenantId` references a real `Organization` (FK, `RESTRICT`).
3. A chunk has **no independent tenant**. It is visible only through a parent whose `tenantId` equals the scope.
4. NULL-tenant documents and orphan chunks are never retrievable.
5. No silent reassignment. Changing a non-null `tenantId` requires the audited procedure (D-F2-5).

## 4. Backfill B1: manifest-driven, separate from deploy

No inference (§2). A separate script and a manual protected workflow, following the Phase 106 pattern.

1. **Inventory (read-only).** A reviewer listing of `tenantId IS NULL` documents with `id`, `title`, `originalFilename`, `createdAt`, `status` and `chunkCount`, plus the upload-audit uploader if present, marked *evidence only*. No content, no chunk text.
2. **Manifest.** Owner-written `{ documentId, organizationId, reason, reviewer }`, reviewed in Git, ids only. Unlisted documents stay NULL.
3. **Dry run (default, zero writes).**
   - Before-counts.
   - A per-row outcome: `WOULD_ASSIGN`, `SKIP_ALREADY_SAME`, `CONFLICT_ALREADY_OTHER` (never overwritten), `REJECT_UNKNOWN_DOCUMENT`, or `REJECT_UNKNOWN_ORG`.
4. **Commit.**
   - Requires `--commit`, a confirmation phrase, the protected environment, and a verified pre-backfill backup.
   - One statement per document:

     ```sql
     UPDATE "Document" SET "tenantId"=$org, "tenantAssignedAt"=now(), "tenantAssignedBy"=$operator,
            "tenantAssignmentSource"='MANIFEST', "tenantAssignmentRunId"=$run
      WHERE id=$doc AND "tenantId" IS NULL;
     ```

   - Plus an audit event with `organizationId=$org` and the run id.
   - Under Option S, **no chunk updates** are needed.
5. **Verify.** After-counts equal before-counts plus the assigned rows. A re-run reports `assigned = 0, unchanged = N`.
6. **Unassigned documents stay NULL.** Archiving or deleting them is a **separate** owner decision (D-F2-3); B1 never deletes.

## 5. Rollback

| Layer | Rollback | Data loss |
|---|---|---|
| M1 | a new down migration dropping the added FKs, index and nullable columns | none |
| C1 | redeploy the previous image | none |
| B1 | a reverse run by `tenantAssignmentRunId` (same dry-run/commit guard); last resort: restore the pre-backfill backup | none |

## 6. Tests required before merge

**Migration and schema (real PostgreSQL)**
- A migration-safety test: additive only; no `DROP`, `UPDATE` or `DELETE`; no defaults on new columns.
- The FK rejects an unknown organization on `Document.tenantId`.
- With D-F2-6: the plain parent FK rejects a chunk whose parent does not exist.
- `RESTRICT` (D-F2-8): an org with documents cannot be deleted silently.

**Routes**
- Upload takes the tenant from the server context; body fields are ignored.
- Non-members, missing permission, and ambiguous or org-less actors are refused.
- List, get, delete and process are own-tenant only. A foreign or NULL id returns 404 with no side effect.

**F-1 stays fail-closed.** The existing R1–R11 stay green, plus:
- After an org-A upload, the document is retrievable **only** by org A, on the route and on real Postgres with two orgs.
- A cross-tenant canary check on chunks produced by processing.
- Legacy NULL documents remain invisible after M1, C1 and a partial B1.
- A new R11 rule: no raw SQL reads chunks without joining `Document` and a tenant predicate. This is already covered by rule 1; keep it.

**B1**
- The dry run performs zero writes (DB snapshot compare).
- Idempotent: the second commit run reports `assigned = 0`.
- A conflict is never overwritten.
- An unknown document or org is rejected.
- Every assignment writes an audit row.
- A reverse run restores exactly that run.

**Gates**
- `security:phase99:inventory:check`, phase99 static invariants, `tsc`, lint, build.
- Mutation proofs for each new guard.

## 7. Deployment order (flag stays OFF)

1. **Read-only production counts** Q1–Q7 (§10), run by the owner or an operator. Continue only if Q3 = 0. Use Q4, Q6 and Q7 for the D-F2-6 decision.
2. **Verified Postgres backup** (Phase 98).
3. **PR-1: M1 + C1.** Deploy applies M1 first (compatible with the old code), then the new web code. From then on, new uploads are tenant-owned.
4. **Read-only verification:** new uploads have a non-null tenant; legacy counts are unchanged; F-1 isolation passes on staging.
5. **The owner builds the manifest.**
6. **B1 dry run → owner review → B1 commit.**
7. **Post-backfill verification.**
8. **Re-enabling Document RAG** is a separate, later decision, after F-2 is verified. F-3 is independent.

Failure at step 3: the migration refuses to apply and the old code keeps running; roll back M1 if needed. Failure at step 6: reverse run, or backup restore.

## 8. Risks

- Legacy documents may stay unassigned indefinitely. That is intentional (fail-closed).
- Current uploaders are platform admins (C-5). After C1 they need a tenant context or the D-F2-4 function. This is a workflow change.
- ANN recall under tenant filtering (§3.2) affects both options. Measure before optimising.
- Any non-null `tenantId` found by Q1 has unknown provenance (C-3). It must go through manifest review, not be trusted.

## 9. Decisions

| Id | Decision | Recommendation | Consequence | Evidence prerequisite | Needs |
|---|---|---|---|---|---|
| D-F2-1 | Tenant column on `Document` | keep `tenantId`, add FK to `Organization` | least churn; F-1 code and tests unchanged | Q3 = 0 | owner decision |
| D-F2-2 | Document permissions | new `view_documents` / `manage_documents` | explicit least privilege; RBAC matrix and tests to update | none | owner decision |
| D-F2-3 | Legacy documents (incl. any unexpected non-null `tenantId`) | stay NULL / invisible; manifest review only; no archive or delete now | fail-closed; legacy lost to RAG until reviewed | Q1, Q2, Q5 | owner decision |
| D-F2-4 | Platform-admin upload and cross-tenant view | forbid in C1; a separate audited function later if needed | staff must act inside a tenant context | none | owner decision |
| D-F2-5 | Reassigning a document to another tenant | manual audited procedure only (dry-run/commit) | no silent moves | none | owner decision |
| D-F2-6 | Plain parent FK on `DocumentTextChunk.documentId` (orphan prevention) | add if Q6 = 0; otherwise decide the orphans first (never auto-delete) | blocks new orphans; lock cost scales with Q7 | Q6, Q7 | **operator check** + owner decision |
| D-F2-7 | Chunk-level `organizationId` (Option C) | **not now (Option S)**; revisit only on measured need, with triggers + composite FK + NOT NULL | simpler, drift-free; ANN recall is addressed separately | Q7 + a staging benchmark | owner decision (after measurement) |
| D-F2-8 | Org deletion with documents | `RESTRICT` | no silent data loss; org offboarding must handle documents | Q4 | owner decision |
| D-F2-9 | Manifest author and approver | an owner-named reviewer; ids only in Git | accountable assignments | the Q5 listing | owner decision |
| D-F2-10 | Running the §10 read-only counts in production | required before PR-1 | turns P-1..P-7 from UNVERIFIED into measured | production access | **operator check** |

## 10. Claims awaiting read-only production verification

All queries are `SELECT count(*)` / grouped counts only. They print **no** content, titles or ids. Run them by the documented operator path; this session has no production access.

| Query | Verifies | SQL (read-only) |
|---|---|---|
| Q1 | P-1 | `SELECT count(*) FILTER (WHERE "tenantId" IS NULL) AS null_tenant, count(*) FILTER (WHERE "tenantId" IS NOT NULL) AS set_tenant FROM "Document";` |
| Q2 | P-2 | `SELECT count(*) FILTER (WHERE "uploadedBy" IS NULL) AS null_uploader, count(*) FILTER (WHERE "uploadedBy" IS NOT NULL) AS set_uploader FROM "Document";` |
| Q3 | P-4 | `SELECT count(*) FROM "Document" d WHERE d."tenantId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Organization" o WHERE o.id = d."tenantId");` |
| Q4 | P-6 | `SELECT count(*) FROM "Document";` |
| Q5 | P-3, P-7 (action string `document.uploaded` = `AUDIT_ACTIONS.DOCUMENT_UPLOADED`, `src/lib/audit/audit-service.ts:34`) | `SELECT count(*) FILTER (WHERE a.id IS NOT NULL) AS with_upload_audit, count(*) FILTER (WHERE a.id IS NULL) AS without_upload_audit FROM "Document" d LEFT JOIN LATERAL (SELECT id FROM "AuditLog" x WHERE x.action = 'document.uploaded' AND x."entityId" = d.id LIMIT 1) a ON true;`, plus the uploader-role distribution: `SELECT u.role, count(*) FROM "AuditLog" x JOIN "User" u ON u.id = x."userId" WHERE x.action = 'document.uploaded' GROUP BY u.role;` |
| Q6 | P-5 | `SELECT count(*) FROM "DocumentTextChunk" c WHERE NOT EXISTS (SELECT 1 FROM "Document" d WHERE d.id = c."documentId");` |
| Q7 | P-6 | `SELECT count(*) AS chunks, count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded FROM "DocumentTextChunk";` |

Until these are run, **P-1 to P-7 remain UNVERIFIED or UNKNOWN**. No implementation decision that depends on them (D-F2-1, 3, 6, 7, 8, 10) should be taken as final.

## 11. Implementation record (2026-09-24)

Owner decisions applied: D-F2-1 (keep `Document.tenantId`, add FK), D-F2-2 (`view_documents` / `manage_documents`), D-F2-3 (no legacy rows exist, nothing assigned), D-F2-4 (no platform-admin bypass), D-F2-5 (reassignment is manual only), D-F2-7 (Option S: no chunk tenant column), D-F2-8 (`RESTRICT`). D-F2-6 (a parent FK on `DocumentTextChunk.documentId`) was **not** decided and is **not** implemented.

- **M1** `prisma/migrations/20260925120000_f2_document_tenant_fk/migration.sql`: one index `("tenantId","createdAt")` and `Document_tenantId_fkey` → `Organization(id)` `ON DELETE RESTRICT ON UPDATE CASCADE`. No column added or dropped, no row touched. Validated only on a disposable local PostgreSQL.
- **C1** every `/api/documents*` handler runs `requirePlatformAuth` → (`requireTrustedOrigin` on writes) → `requireOrgActor` → `requirePermission`. Reads and writes go through `documentRepositoryForOrganization(orgId)`, which filters on `tenantId` in the query. A foreign or NULL-tenant id is `404` with no side effect. Upload writes `tenantId` and `uploadedBy` from the proven member; request fields are never read. `GET` is bounded (default 50, max 100). Audit rows carry `organizationId`.
- **UI** the admin document pages stamp the server-resolved organization (`DocumentTenantStamp`) so the client's writes send the `x-hermes-organization` precondition.
- **Reassignment (D-F2-5)**: no route can change `tenantId` (ownership keys are stripped from every update). Moving a document is a manual operator procedure: a reviewed, id-only manifest, a dry run, then one audited transaction. It is documented here only; no tooling was added.
- **Not in scope / still open** (as of R1): magic-byte upload validation (F-2 finding item 4), cursor pagination, D-F2-6, and F-3. Items 4 and 5 were implemented in R2 (§12).

## 12. R2: owner decisions of 2026-09-25

### 12.1 Document pages open to organization members
- **Middleware** (`src/lib/auth/rbac.ts`): `/{locale}/admin/documents` and `/{locale}/admin/documents/search` follow the workspace `dashboard` platform capability (superadmin, admin, engineer, customer, vendor). Every other `/admin` path stays platform-admin only. The paths remain protected; only their role rule changed.
- **Page gate** (`src/lib/documents/page-access.ts`): `RequireCapability capability="dashboard"`, then the same session tenant resolver the API uses. It needs an ACTIVE membership in the resolved organization with `view_documents`. `manage_documents` decides whether the upload form and the process/delete controls render at all.
- **Refusals** reuse the existing `DataUnavailableNotice` copy (fa/en/de): unauthenticated, no organization, selection required, unavailable, and FORBIDDEN.
- **Platform admins:** a platform admin who is not a member of the resolved organization is refused like anyone else. No platform role reaches a tenant's documents implicitly.
- **Navigation:** the SiteNav and Control Center links for these pages now carry `dashboard`, so link visibility still equals middleware authorization.

### 12.2 Session storage mode (no database): fail-closed by design
Session mode has no `OrganizationMember` table, so neither the page resolver nor `requireOrgActor` can prove a membership.
- The tenant resolver reports `ORGANIZATION_STORE_DISABLED` (`src/lib/tenant/context.ts`), which maps to `ORGANIZATION_CONTEXT_UNAVAILABLE`.
- Every document page renders the existing "unavailable" notice (or the sign-in prompt).
- Every `/api/documents*` request is refused: 401 without a session, otherwise 503 `ORGANIZATION_CONTEXT_UNAVAILABLE`.
- The documents feature is therefore **unavailable without PostgreSQL**. This is intended: a tenant-owned library must not run without a tenant boundary.
- The session repository remains in code only as the database-failure fallback and for tests. It is filtered by `tenantId` like the database path.

### 12.3 Deleting a document; chunk foreign key (D-F2-6): investigated, NOT added
**Current behaviour** of `DELETE /api/documents/[id]`, after the scoped ownership check:
1. Delete the original object (best-effort).
2. `DocumentTextChunk.deleteMany({documentId})` (best-effort).
3. Delete the `Document` row.

These three steps are not atomic. Findings:
- **Orphan chunks are possible.** If step 2 fails, the chunks stay behind. On a database error the chunk repository falls back to the in-process store, so the database rows silently remain. The same happens if `processDocument` writes chunks after a concurrent delete (it runs a delete-then-insert of chunks, with no lock).
- **Orphans never leak through search.** The F-1 search joins every chunk to its parent `Document` and matches `tenantId`. They do remain stored text and embeddings, which is a retention and erasure problem.
- **Production:** Q6 orphan chunks = 0 (owner-reported, 2026-09-24).
- **The extracted-text object is not deleted.** `processDocument` stores extracted text under `extractedTextKey`, and the DELETE route removes only `storageKey`, so the extracted text outlives the document in object storage. This is follow-up **FU-F2-R2-3**, not fixed here.

**Would a foreign key help?** `DocumentTextChunk.documentId → Document(id) ON DELETE CASCADE` would:
- delete the chunks in the same statement as the document (atomic);
- reject chunk inserts for a deleted document, which closes the race.

`RESTRICT` would instead make the delete fail whenever step 2 failed.

Recommendation: **CASCADE**, in its own additive migration, only after Q6 (orphan count) returns 0 in every target environment. Adding the FK validates existing rows and fails on any orphan; orphans are never auto-deleted. Per the owner's decision it is **not added in F-2**.

### 12.4 Upload content signature (F-2 finding item 4): implemented
`validateFileSignature` checks the bytes actually received against the extension:
- `.pdf` must start with `%PDF-`.
- `.docx` must start with the ZIP local-file header. Only the container is checked; the OOXML parts are not inspected.
- `.txt` and `.md` must be valid UTF-8 with no NUL byte and no PDF, ZIP or ELF signature. A leading `MZ` alone is text (model numbers such as "MZ-80"); a real DOS/PE executable is still refused by the NUL rule (R3).

A mismatch is refused with `400 file_signature_mismatch` before anything is stored.

**Deviation from the finding text:** `application/octet-stream` is still **accepted as a declared type**, because browsers report it for `.md` and `.docx`. It is never trusted, though: the signature decides, and the stored and served MIME type is now derived from the extension (`canonicalDocumentMimeType`), never taken from the client. UTF-16 text files are rejected (follow-up if needed).

### 12.5 Cursor pagination (F-2 finding item 5): implemented
`GET /api/documents?limit=&cursor=` returns `{ documents, nextCursor }`.
- The order is `createdAt DESC, id DESC`, and the cursor is an opaque, Zod-validated keyset of the last row's **values**. No row is looked up, so a cursor cannot probe another tenant; the next page is filtered by `tenantId` in the same query.
- A malformed cursor gets `400 invalid_cursor`.
- The page size defaults to 50, with a maximum of 100.
- The UI gains a "load more" control (one new leaf, `adminDocuments.list.loadMore`, in fa/en/de).
- The first page (no cursor) also returns `stats` — total / indexed / failed for the whole organization library, computed on the server by one tenant-filtered `groupBy` on `status` (R3; closes FU-F2-R2-1). Later pages carry no stats; the UI shows "—" rather than 0 until the figures arrive.

### 12.6 The migration against existing staging/dev data
Evidence from the repository:
- `Document.tenantId` has existed since `20260616010000_add_document`.
- No code path, seed, fixture or SQL file ever wrote it before F-2 (the git history of the routes and repository shows only the Phase 16A type declaration and F-1's read-side filter).
- The only writers are the PostgreSQL test suites, which use `f1pg-`/`f2pg-` prefixed rows and clean them up.

So in any environment deployed from this repository, a non-null `tenantId` can come only from manual SQL, a restore from elsewhere, or an interrupted PG test run against a shared database.

The migration is fail-closed: if any non-null `tenantId` names no `Organization`, `ADD CONSTRAINT` fails and the migration stops without changing data. Nothing is ever auto-repaired or deleted.

**Before applying it to a staging/dev database, run this read-only preflight (counts only):**

```sql
BEGIN READ ONLY;
SELECT count(*) AS orphan_tenant FROM "Document" d
 WHERE d."tenantId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Organization" o WHERE o.id = d."tenantId");
SELECT count(*) AS leftover_test_rows FROM "Document" WHERE id LIKE 'f1pg-%' OR id LIKE 'f2pg-%';
ROLLBACK;
```

If either count is non-zero, the owner decides per row; this session changed no staging or dev data. The session has no access to staging or dev, so their contents are **UNVERIFIED**. Production Q3 = 0.

### 12.7 Remaining follow-ups
- ~~**FU-F2-R2-1** server-side document counts for the page metrics.~~ Done in R3 (§12.5).
- **FU-F2-R2-2** the chunk FK (D-F2-6), after an environment-wide Q6 = 0.
- ~~**FU-F2-R2-3** delete the extracted-text object on document delete, and make delete plus chunk cleanup transactional.~~ Implemented in R4 (§12.9). `HERMES_DOCUMENT_RAG_ENABLED` stays disabled.
- **FU-F2-R2-4** UTF-16 text uploads and deeper DOCX validation.
- **F-3** remains out of scope.

### 12.8 R3 (2026-09-25): integration with main and review fixes
- **Main merged** (normal `git merge origin/main`, no rebase), twice: the branch fast-forwarded from `48538431` to `26b49cc` (Phase 112), then to `837deb5` (ATS-M1). The uncommitted F-2 work was re-applied on top each time. Five files conflicted, and each was resolved by keeping both sides: the two Phase 102 migration lists, `schema.prisma` (Organization relations), the ATS migration-safety test (main's append-only version kept), and the Phase 99 inventory (regenerated).
- **Migration renamed** from `20260924000000_f2_document_tenant_fk` to `20260925120000_f2_document_tenant_fk`. Every ref and worktree was checked. The old name shared its timestamp with main's `20260924000000_phase112_immutable_reasoning_run`, and ATS-M1 (PR #108) claims `20260925000000`. The new stamp is unique and sorts after both.
  - ATS-M1 (PR #108) was then merged into main (`837deb5`) while R3 was in progress. `origin/main` was merged again the same way (fast-forward `26b49cc` -> `837deb5`). F-2 now sorts after both and needs no further re-dating. ATS-M1's own "newest migration" assertion was changed to the same append-only rule main uses for ATS-B2/S1 and Phase 112. The German gate is at 7912, measured (7910 on main + 2 F-2 leaves).
- **Append-only assertions:** Phase 112's parity test no longer requires Phase 112 to be the globally last migration. It now requires every later migration to carry a strictly greater timestamp, and its own timestamp to be unique (the same rule main applies to the ATS test). Both Phase 102 lists declare `…_phase112…` and then `…_f2_document_tenant_fk`.
- **Library figures** now come from the server (§12.5). Text beginning with "MZ" is no longer refused (§12.4).
- **Still open:** FU-F2-R2-3 (delete the extracted-text object before tenant rollout), FU-F2-R2-2 (chunk FK), FU-F2-R2-4, and F-3. RAG stays disabled. Staging/dev contents remain **UNVERIFIED**.

### 12.9 R4 (2026-09-27): FU-F2-R2-3, safe and repeatable file removal

**Findings that shaped the design:**
- Object storage (`src/lib/documents/object-storage.ts`) is a key/value seam; only `local` is implemented.
- Its `delete()` swallowed **every** error, not only "file missing". A permission or lock failure (EACCES/EPERM/EBUSY) was indistinguishable from success, so a removal could never be verified.
- The repository's established pattern for reliable post-commit side effects is a durable outbox with a claim and back-off (Phase 109 `IndustrialMeteringOutbox`, with a worker endpoint guarded by `authorizeWorkerRequest`).

**Design (minimal, recoverable):**
1. `ObjectStorage.remove(key)` resolves `"deleted"` or `"absent"` (idempotent success) and **rejects** on any other failure. The old `delete()` is unchanged for its existing caller (media).
2. `DELETE /api/documents/[id]`:
   - Proves ownership with the scoped `get`.
   - Then `deleteWithStorageCleanup` runs **one database transaction**: delete the document's `DocumentTextChunk` rows, delete the `Document` row (with `tenantId` in the predicate), and insert one `DocumentStorageCleanup` row listing the keys to remove.
   - In database mode it never falls back to the session store: a failure rolls everything back, the route answers 500, and nothing is deleted.
3. **After the commit** the route runs the cleanup row: it removes the original and the extracted text and re-deletes the chunks. Object storage is **not** part of the transaction and is not presented as such.
   - Success marks the row `DONE`.
   - Failure keeps it `PENDING` with a stable `lastErrorCode` (`storage_remove_failed`, `storage_provider_unavailable`, `chunk_delete_failed`), increments `attempts`, and sets `nextAttemptAt` with exponential back-off (30 s × 2ⁿ⁻¹, capped at 1 h).
   - The response still reports the document deleted, with `storageCleanup: "pending"`; the audit row carries the same value.
4. **Retries:**
   - Inline: after each delete, up to 5 due rows of the **same organization**.
   - `POST /api/documents/storage-cleanup?limit=` for everything else, called on a schedule by the `hermes-document-cleanup-worker` service (R5, §12.11). It returns counts only and is idempotent. Its guard is `authorizeDocumentCleanupWorker`, with its own `DOCUMENT_CLEANUP_WORKER_TOKEN` (R5; R4 had reused the metering guard).
   - A row is claimed by an atomic conditional update on its `nextAttemptAt` and leased for 5 minutes, so concurrent passes never process a row twice, and a crashed pass is retried after the lease.
5. **Scope of removal:** only keys strictly under `documents/<documentId>/`.
   - Always includes the canonical `documents/<id>/extracted.txt`, so a processing run racing the delete cannot leave its output behind.
   - Every attempt also re-deletes chunks for the id, which catches chunks inserted by such a run.
   - A key outside the prefix is never enqueued, and never deleted even if forged into a row.
6. **Schema:** folded into the not-yet-applied F-2 migration (`20260925120000_f2_document_tenant_fk`). It adds a new empty table `DocumentStorageCleanup` and enum `DocumentStorageCleanupStatus` with a unique `documentId`, a claim index, and an FK to `Organization` with `ON DELETE RESTRICT`. An organization with pending cleanups cannot be deleted, because that would drop the only record of files to remove. No existing row is touched.

**Residual (documented, not blockers):**
- There is still no chunk → document FK (FU-F2-R2-2). The per-attempt chunk re-delete covers a racing processing run only if the cleanup runs after it finishes.
- ~~**FU-F2-R4-1** nothing calls the worker endpoint on a schedule.~~ Closed in R5 (§12.11): a dedicated compose worker with a dedicated token.
- `DONE` rows are kept, holding object keys only and no content. A retention sweep is optional (**FU-F2-R4-2**).

### 12.10 Staging/dev pre-flight: aggregate, read-only, operator-run

Staging/dev contents remain **UNVERIFIED**; this session did not connect to them. The operator runs everything below on that environment's host, **one environment per fresh shell** (so no variable carries over from another environment).

**Safety properties**
- The SQL runs **inside the environment's own `postgres` container**, with that container's `POSTGRES_USER`/`POSTGRES_DB` (the pattern `deploy.yml` uses). No connection string or password appears on a command line, in shell history or in the output.
- It runs inside `BEGIN READ ONLY … ROLLBACK`, with `statement_timeout = 60s` and `lock_timeout = 5s`.
- The output is **labels, counts, `t`/`f`, a schema name, one migration name and one timestamp only**: no ids, titles, object keys, document content or env values.
- Never use any of these, because they print env values:
  - `docker inspect` without `--format`;
  - `docker compose config` without `--services`;
  - `env` or `printenv` in a container;
  - opening `.env*` files.

#### Step 0: P, F, E, the Compose project, compose file and interpolation env file

`E` must be **the interpolation env file**: the file whose values Compose used for `${…}` substitution when this environment's stack was brought up (`--env-file`, or the project directory's `.env` by default).
- It is **not** the same thing as a service's `env_file:`, which only injects variables into a container. The two can differ, so `env_file:` must never be used to infer `E`.
- Nor may `E` be guessed from a directory listing.
- The only accepted sources are:
  - what Compose itself recorded on the running containers (the label `com.docker.compose.project.environment_file`);
  - failing that, the exact path stated by the owner.

**0.1** On the host, list what Compose recorded for the `postgres` container. Labels hold names and paths only, never env values:

```bash
docker ps --filter label=com.docker.compose.service=postgres --format 'container={{.Names}} project={{.Label "com.docker.compose.project"}} dir={{.Label "com.docker.compose.project.working_dir"}} files={{.Label "com.docker.compose.project.config_files"}} envfile={{.Label "com.docker.compose.project.environment_file"}}'
```

- **P** is `project`.
- **F** is `files`, which must be exactly one path.
- **E** is `envfile`, which must be exactly one path.
- If both environments share a host, pick the line by `project` and `dir`, and `cd` into that `dir`.

**Stop rules**:
- `envfile` is **empty or missing**: Compose did not record the interpolation file. **Stop the pre-flight** and ask the owner for its exact path. Do not substitute `env_file:` or a guessed `.env*`. Only after the owner states the path, set `E` to it and `E_OWNER_CONFIRMED=yes`.
- `files` or `envfile` lists **more than one path** (comma-separated): stop, because these commands take exactly one of each. The owner decides how to adapt them.

**0.2** Set the three values to the **real** ones from 0.1. Placeholders are refused by 0.3.

```bash
P='<project>' F='<files, one absolute path>' E='<envfile, one absolute path>'
```

**0.3** Pre-check.
- It compares `F` and `E` with what Compose recorded for project `P`, checks that both files exist, and refuses placeholders.
- It prints **only** `OK` or a `STOP:` reason, never a path or value.
- It sets `PF_OK=1` only on success. The SQL blocks below refuse to run without it.

```bash
{
  PF_OK=
  LBL=$(docker ps --filter "label=com.docker.compose.project=$P" --filter label=com.docker.compose.service=postgres --format '{{.Label "com.docker.compose.project.config_files"}}|{{.Label "com.docker.compose.project.environment_file"}}' | sort -u)
  LF=${LBL%%|*}; LE=${LBL#*|}
  if [ -z "$P" ] || [ -z "$F" ] || [ -z "$E" ] || printf '%s' "$P$F$E" | grep -q '[<>]'; then echo "STOP: P/F/E are empty or still placeholders"
  elif [ -z "$LBL" ]; then echo "STOP: no running postgres container is labelled with project P"
  elif [ "$(printf '%s\n' "$LBL" | wc -l)" -ne 1 ]; then echo "STOP: Compose labels for project P are ambiguous"
  elif case "$LF" in *,*) true;; *) false;; esac; then echo "STOP: Compose recorded more than one compose file; the owner must decide"
  elif [ "$F" != "$LF" ]; then echo "STOP: F is not the compose file Compose recorded for P"
  elif case "$LE" in *,*) true;; *) false;; esac; then echo "STOP: Compose recorded more than one interpolation env file; the owner must decide"
  elif [ -z "$LE" ] && [ "${E_OWNER_CONFIRMED:-}" != yes ]; then echo "STOP: Compose did not record the interpolation env file; ask the owner for its exact path"
  elif [ -n "$LE" ] && [ "$E" != "$LE" ]; then echo "STOP: E is not the interpolation env file Compose recorded for P"
  elif [ ! -f "$F" ] || [ ! -f "$E" ]; then echo "STOP: F or E does not exist on this host (run from the project directory)"
  elif ! docker compose -p "$P" -f "$F" --env-file "$E" ps --services --status running | grep -qx postgres; then echo "STOP: postgres is not running under P/F/E"
  else PF_OK=1; if [ -n "$LE" ]; then echo "OK"; else echo "OK (E stated by the owner)"; fi; fi
}
```

#### Step 1: S0–S6 (before the migration)

```bash
[ "${PF_OK:-}" = 1 ] && docker compose -p "$P" -f "$F" --env-file "$E" exec -T postgres sh -c 'psql -U "${POSTGRES_USER:-hermes}" -d "${POSTGRES_DB:-hermes_db}" -X -q -t -A -F "|" -v ON_ERROR_STOP=1' <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
\echo S0 prisma_migrations_schemas|document_in_public|organization_in_public
SELECT (SELECT coalesce(string_agg(n.nspname, ',' ORDER BY n.nspname), '(none)') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = '_prisma_migrations' AND c.relkind = 'r'), to_regclass('public."Document"') IS NOT NULL, to_regclass('public."Organization"') IS NOT NULL;
\echo S1 documents_total|tenant_null|tenant_empty_or_whitespace|tenant_set
SELECT count(*), count(*) FILTER (WHERE "tenantId" IS NULL), count(*) FILTER (WHERE "tenantId" IS NOT NULL AND btrim("tenantId", E' \t\r\n') = ''), count(*) FILTER (WHERE "tenantId" IS NOT NULL AND btrim("tenantId", E' \t\r\n') <> '') FROM public."Document";
\echo S2 non_null_tenant_without_organization|of_which_empty_or_whitespace
SELECT count(*), count(*) FILTER (WHERE btrim(d."tenantId", E' \t\r\n') = '') FROM public."Document" d WHERE d."tenantId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Organization" o WHERE o.id = d."tenantId");
\echo S3 leftover_pg_test_documents
SELECT count(*) FROM public."Document" WHERE id LIKE 'f1pg-%' OR id LIKE 'f2pg-%';
\echo S4 orphan_chunks|chunks_total
SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public."Document" d WHERE d.id = c."documentId")), count(*) FROM public."DocumentTextChunk" c;
\echo S5 fk_by_name_on_document|fk_document_tenantId_to_organization_id_any_name|tenant_index_on_document|cleanup_table|cleanup_enum
SELECT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype = 'f' AND c.conname = 'Document_tenantId_fkey' AND c.conrelid = to_regclass('public."Document"')), EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('public."Document"') AND c.confrelid = to_regclass('public."Organization"') AND cardinality(c.conkey) = 1 AND cardinality(c.confkey) = 1 AND a.attname = 'tenantId' AND fa.attname = 'id'), EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public."Document_tenantId_createdAt_idx"') AND i.indrelid = to_regclass('public."Document"')), EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass('public."DocumentStorageCleanup"') AND c.relkind = 'r'), EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'DocumentStorageCleanupStatus' AND t.typtype = 'e');
\echo S6 applied|unfinished|last_applied_by_finished_at|last_finished_at|f2_applied|f2_rows_any_state
SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL), count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL), (SELECT m.migration_name FROM public."_prisma_migrations" m WHERE m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL ORDER BY m.finished_at DESC, m.migration_name DESC LIMIT 1), max(finished_at) FILTER (WHERE rolled_back_at IS NULL), count(*) FILTER (WHERE migration_name = '20260925120000_f2_document_tenant_fk' AND finished_at IS NOT NULL AND rolled_back_at IS NULL), count(*) FILTER (WHERE migration_name = '20260925120000_f2_document_tenant_fk') FROM public."_prisma_migrations";
ROLLBACK;
SQL
```

The output is 14 lines: seven labels, each followed by one line of values.

**Go/no-go before applying the migration there:**

| Check | Required | Otherwise |
|---|---|---|
| S0 | exactly `public\|t\|t` | Stop: the tables live elsewhere and the checks below do not apply as written. |
| S1 | For information. The last three columns add up to `documents_total`. Unassigned documents stay invisible under F-1 (fail-closed). | Report a mismatch. |
| S2, column 1 | **0**. A PostgreSQL FK validates **every non-NULL value, empty and whitespace-only strings included**, so any such `tenantId` without an `Organization` makes `ADD CONSTRAINT` fail. | Stop. Column 2 shows how many of them are empty or whitespace. The owner decides per row; nothing is auto-repaired. |
| S3 | **0** | Stop; the owner decides. |
| S4 | For information; ideally 0. F-2 adds no chunk FK. | Report it; not a blocker. |
| S5 | **`f\|f\|f\|f\|f`** | By-name `f` but structural `t`: a differently named FK from `tenantId` to `Organization.id` already exists, so stop. All `t`: already applied, so cross-check S6. Mixed: stop. |
| S6 `unfinished` | **0** | Stop. |
| S6 `f2_applied` / `f2_rows_any_state` | **0 / 0** | `f2_rows_any_state > 0` means an earlier failed or rolled-back attempt: stop. |
| S6 `last_applied_by_finished_at` | `20260925000000_ats_m1_position_management` for an environment at the current main level | Older: the deploy applies several migrations. Know it before approving. |
| S6 `applied` | 79 at the current main level (80 after F-2) | Report a difference. |

Earlier revisions of this block had two defects, corrected on 2026-09-29:
- S2 counted only non-blank tenants, which missed blank values that would still fail the FK.
- `last_applied` used `max(migration_name)` instead of the newest `finished_at`.

#### Step 2: V1–V3 (after applying, read-only)

Run the same way, after the same Step 0 in a fresh shell:

```bash
[ "${PF_OK:-}" = 1 ] && docker compose -p "$P" -f "$F" --env-file "$E" exec -T postgres sh -c 'psql -U "${POSTGRES_USER:-hermes}" -d "${POSTGRES_DB:-hermes_db}" -X -q -t -A -F "|" -v ON_ERROR_STOP=1' <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
\echo V1 document_fk_on_delete|on_update|cleanup_fk_on_delete|on_update (expect r|c|r|c)
SELECT (SELECT confdeltype::text FROM pg_constraint WHERE contype = 'f' AND conname = 'Document_tenantId_fkey' AND conrelid = to_regclass('public."Document"')), (SELECT confupdtype::text FROM pg_constraint WHERE contype = 'f' AND conname = 'Document_tenantId_fkey' AND conrelid = to_regclass('public."Document"')), (SELECT confdeltype::text FROM pg_constraint WHERE contype = 'f' AND conname = 'DocumentStorageCleanup_organizationId_fkey' AND conrelid = to_regclass('public."DocumentStorageCleanup"')), (SELECT confupdtype::text FROM pg_constraint WHERE contype = 'f' AND conname = 'DocumentStorageCleanup_organizationId_fkey' AND conrelid = to_regclass('public."DocumentStorageCleanup"'));
\echo V2 status|rows|max_attempts
SELECT status::text, count(*), max(attempts) FROM public."DocumentStorageCleanup" GROUP BY status ORDER BY status;
\echo V3 overdue_pending_older_than_1h
SELECT count(*) FROM public."DocumentStorageCleanup" WHERE status = 'PENDING' AND "nextAttemptAt" < now() - interval '1 hour';
ROLLBACK;
SQL
```

V2 and V3 are also the ongoing health check for FU-F2-R2-3. A growing `PENDING` count, or `max(attempts)`, means storage removals are failing. Read `lastErrorCode` by aggregate only (`SELECT "lastErrorCode", count(*) FROM public."DocumentStorageCleanup" GROUP BY 1`).

### 12.11 R5 (2026-09-28): FU-F2-R4-1, scheduled retry and a dedicated token

**Is the metering token enough isolation? No.** R4 guarded `POST /api/documents/storage-cleanup` with `authorizeWorkerRequest`, which accepts `METERING_WORKER_TOKEN` and **falls back to `METRICS_TOKEN`**, the credential the monitoring stack uses to scrape `/api/metrics`. That meant:
- a read-only monitoring credential could trigger a mutating action (removing stored files);
- the metering container held a capability it has no business with;
- rotating one secret silently changed two capabilities.

The removal itself is narrow: only `documents/<id>/` of already-deleted documents, and idempotent. The coupling still broke least privilege, and the repository had already set the opposite precedent: the ATS review worker uses its own `ATS_REVIEW_WORKER_TOKEN` with no fallback.

**Implemented, following the ATS precedent exactly:**
- **Guard:** `src/lib/documents/storage-cleanup-worker-auth.ts` → `authorizeDocumentCleanupWorker`. A constant-time comparison against `DOCUMENT_CLEANUP_WORKER_TOKEN` only (no fallback to any other variable; unset or empty never matches), or a signed-in platform admin; otherwise 401/403. It is registered at PLATFORM scope in `scripts/security/phase99/route-inventory.mjs` and locked on both halves by `scripts/__tests__/document-cleanup-worker-registration.test.ts`.
- **Runner:** `scripts/documents/storage-cleanup-worker.mjs`. A dependency-free thin trigger that polls the endpoint every `DOCUMENT_CLEANUP_WORKER_INTERVAL_MS` (default 60 s), with batch `DOCUMENT_CLEANUP_WORKER_BATCH` (default 50, at most 200).
  - It backs off exponentially with jitter on failure (capped at 10× the interval).
  - It finishes the in-flight pass on SIGTERM/SIGINT, and refuses to start (exit 2) without its token. The wait between passes is interruptible: a signal ends it at once, so `docker stop` never reaches its 10 s SIGKILL during a back-off.
  - It logs counts only, with error bodies truncated to 200 characters, and never logs the token. `--once` is for cron use.
  - npm: `documents:cleanup:worker[:once]`.
- **Packaging:**
  - A dedicated Dockerfile stage `document-cleanup-worker` that copies exactly one file and runs as a non-root user.
  - A one-file exception in `.dockerignore`.
  - Compose service `hermes-document-cleanup-worker`: `restart: unless-stopped`, internal network only, waits for a healthy `hermes-web`, no ports or volumes. The runner reads only its token and never talks to the database. Like the ATS and metering workers, though, it receives the whole `.env.production` through `env_file`. Narrowing that for all three workers is a separate change, not made here.
  - Added to the Phase 99.7 candidate `ENV_FILE_SERVICES`, so a candidate run never reads the real `.env.production`.
- **Concurrency:** several replicas are safe, because every outbox row is claimed by an atomic conditional update. Tested at route level (4 concurrent passes over 3 rows process each exactly once) and on PostgreSQL (§12.9).
- **Migration:** unchanged. It stays folded into `20260925120000_f2_document_tenant_fk`; nothing here needs a schema change.

**Operator steps (not done by this session; the deploy workflow recreates only `hermes-web`):** the full production runbook is §12.12. `.env.example` now carries the variable **name** with an empty value.

**Read-only readiness check for staging/dev (prints only set/missing, never the value):**

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production exec -T hermes-web \
  sh -c 'if [ -n "${DOCUMENT_CLEANUP_WORKER_TOKEN:-}" ]; then echo DOCUMENT_CLEANUP_WORKER_TOKEN=set; else echo DOCUMENT_CLEANUP_WORKER_TOKEN=missing; fi'
```

Adapt `-p` and `-f` to that environment. Together with the §12.10 SQL, this is the full pre-flight.

**R5 container evidence (2026-09-28, local Docker Desktop, image `hermes-f2-doc-cleanup-worker:local`):**
- `docker build --target document-cleanup-worker` exited 0. The image runs as `worker` (uid 1001) and holds exactly one file, `scripts/documents/storage-cleanup-worker.mjs`.
- No token: exit 2 with the refusal line. A dummy token against an unreachable host with `--once`: exit 1, a bounded `transport failure` line, and the token not in the output.
- `docker stop` during a back-off: **the first build was SIGKILLed (exit 137 after the 10 s timeout)**, because the signal handler set a flag but did not end the sleep. Fixed with an interruptible wait. After the rebuild it exited 0, 8 ms after `SIGTERM received`. A regression test (`SIGTERM during a long wait …`) runs on Linux/CI; it is skipped on Windows, which cannot deliver a catchable SIGTERM to a child process.
- The metering and ATS runners share the old sleep pattern. That is pre-existing and not changed here.

**R5 PostgreSQL evidence (2026-09-28, disposable `pgvector/pgvector:pg16`, removed afterwards):**
- `migrate deploy` exited 0. 80 migrations are applied, the last being `20260925120000_f2_document_tenant_fk`, and both new FKs are RESTRICT.
- The drift check (`migrate diff --from-config-datasource --to-schema`) exited 0. Its stderr was visible and held only the config/update banner. The 1098-line diff predates F-2 and has 0 F-2 lines.
- F-1/F-2 PG tests: 27/27. Phase 112 PG tests: 10/10.

### 12.12 Release runbook (prepared, NOT executed by this session)

Nothing below has been run against any real environment. None of these commands prints the value of a secret or env variable. `HERMES_DOCUMENT_RAG_ENABLED` stays **disabled** throughout; nothing here reads or changes it.

**A. Staging/dev: read-only pre-flight (before the migration).** Use a fresh shell per environment, on that environment's host:
1. §12.10 **Step 0**: determine `P`/`F`/`E` from what Compose recorded, apply the stop rules and run the pre-check. `E` is the interpolation env file, never inferred from `env_file:`. If Compose did not record it, stop and get the exact path from the owner. Without `OK`, stop here.
2. §12.10 **Step 1**: S0–S6, then the go/no-go table.
3. Check the token is present, printing only `set` or `missing`:

   ```bash
   [ "${PF_OK:-}" = 1 ] && docker compose -p "$P" -f "$F" --env-file "$E" exec -T hermes-web sh -c 'if [ -n "${DOCUMENT_CLEANUP_WORKER_TOKEN:-}" ]; then echo DOCUMENT_CLEANUP_WORKER_TOKEN=set; else echo DOCUMENT_CLEANUP_WORKER_TOKEN=missing; fi'
   ```

   Before the F-2 deploy, `missing` is expected.
4. Check the worker service resolves. `--services` prints service names only; never run `config` without it:

   ```bash
   [ "${PF_OK:-}" = 1 ] && docker compose -p "$P" -f "$F" --env-file "$E" config --services | grep -x hermes-document-cleanup-worker
   ```

   Before this PR is deployed there, no output is expected.

**B. Production: token (before the deploy that ships this PR).** On the host, in `/opt/hermes-os-nexuz`. This adds a new random value only if the name is absent. It prints `present` or `added`, never the value:

```bash
cd /opt/hermes-os-nexuz
if grep -q '^DOCUMENT_CLEANUP_WORKER_TOKEN=.' .env.production; then echo present; \
else printf '\nDOCUMENT_CLEANUP_WORKER_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env.production && echo added; fi
```

Do not paste the value anywhere. Appending keeps the file's owner and mode. If the token is added **before** the deploy, the deploy's `up -d --no-deps hermes-web` recreates the web container with it. If it is added **after** the deploy, `hermes-web` must be recreated to read it:

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --no-deps hermes-web
```

Until then the endpoint rejects the worker with 401, fail-closed, and inline cleanup on delete keeps working.

**C. Production: migration and deploy.** Through the protected `deploy.yml` (workflow_dispatch) only, after merge and after the §12.10 Step 0 + Step 1 pre-flight on production.
- `deploy.yml` runs every Compose command there from `/opt/hermes-os-nexuz` with `-p hermes -f docker-compose.prod.yml --env-file .env.production`. The expected values are therefore `P=hermes`, `F=/opt/hermes-os-nexuz/docker-compose.prod.yml`, `E=/opt/hermes-os-nexuz/.env.production`.
- The Step 0 pre-check still confirms them against what Compose recorded, and any `STOP` is resolved by the owner.
- The workflow takes the backup, runs `hermes-migrate` and recreates `hermes-web`. After it, run §12.10 Step 2 (V1–V3, read-only).

**D. Production: start the worker once** (the deploy workflow never starts workers):

```bash
cd /opt/hermes-os-nexuz
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production build hermes-document-cleanup-worker
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --no-deps hermes-document-cleanup-worker
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production logs --tail 20 hermes-document-cleanup-worker
```

`--no-deps` stops Compose from also recreating `hermes-web`. The worker waits through its own back-off if the web tier is not ready yet.

**Expected:** lines of the form `[document-cleanup-worker] claimed=N done=N retrying=N`. Failure signs:
- `HTTP 401`: the token differs between the worker and `hermes-web`. Recreate `hermes-web` (B).
- `refusing to start`: the token is missing. Do B.

**E. Rollback.** Stop the worker; this loses nothing, because PENDING rows stay in the table:

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production stop hermes-document-cleanup-worker
```

The schema rollback is in the migration header and is owner-approved only.

**F. Watch.** §12.10 Step 2 (V2/V3), and the worker's count lines. A growing `PENDING` count or `max(attempts)` means storage removal is failing.

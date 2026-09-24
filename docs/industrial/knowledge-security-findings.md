# Knowledge Library — Open Security Findings Register

Status: F-1 has an uncommitted Stage 1 fix (§F-1.6); F-2, F-3 and F-4 are `OPEN` and unfixed. No code was changed while
documenting them. Baseline: `origin/main` @ `1c7aa40579d501468212d6542ddac295f3aab685`
(re-fetched 2026-09-23; unchanged). Evidence was read directly from source at that commit.

| Id | Title | Priority | State |
|---|---|---|---|
| F-1 | Document RAG layer in `/api/brain` returns document text across tenants | **P0: immediate, security blocker** | **FIX IMPLEMENTED, UNCOMMITTED** (Stage 1 of `f1-document-rag-remediation-plan.md`, see §F-1.6). Production flag reported **`disabled`** by the owner on 2026-09-23 after running the §F-1.4 check. This session did not observe production itself. The fix is not deployed. |
| F-2 | Generic document pipeline has no tenant ownership | **P1** | OPEN |
| F-3 | Anonymous `GET /api/knowledge` runs an unbounded full-table read | **P2** | OPEN |
| F-4 | Author avatar upload trusts the declared MIME type (public path) | P3 | OPEN (noted, out of scope) |

The knowledge-library work (catalog, ingestion) **must not** reuse the `Document` /
`DocumentTextChunk` pipeline until F-1 and F-2 are closed.

---

## F-1: Cross-tenant document text via `/api/brain` (P0)

### F-1.1 Evidence

| Step | Location | Observation |
|---|---|---|
| Flag gate | `src/lib/rag/config.ts:43-45,64-66` | `isDocumentRagEnabled()` is true **only** for the literal `"true"` (trimmed, case-insensitive). Unset or any other value means off. |
| Route call | `src/app/api/brain/route.ts:843-850` → `buildDocumentRagEvidence(question)` (`:421-432`) → `searchDocuments(question, 5)` (`:423`) | The owner is resolved at `:483` (`resolveBrainOwner()`) but is **not passed** to the document search. |
| Search | `src/lib/documents/search.ts:32-51` | Signature `searchDocuments(query, topK)` has **no tenant parameter**. It returns `chunkId, documentId, position, text, score`. |
| SQL | `src/lib/documents/chunk-vector-store.ts:134-151` | `WHERE embedding IS NOT NULL [AND "documentId" = $n]`, with no tenant predicate and no join to `Document`. |
| Schema | `prisma/schema.prisma:182-200` | `DocumentTextChunk` has **no tenant column** and no FK to `Document`. `Document.tenantId` is nullable (`:148`) and never written (F-2). |
| Response | `route.ts:846` | `analysis.documentRagEvidence.matches[].text` (raw chunk text) is returned to the caller. |
| Caller gate | `route.ts:442-446` `requireAuthoring()` | Needs the platform `authoring` capability, which the `superadmin`, `admin` and `engineer` roles have (`src/lib/auth/roles.ts:45-51`). |
| Embedding default | `src/lib/documents/embedding-provider.ts:27-30` | Unless `DOCUMENT_EMBEDDINGS_PROVIDER=mock`, the **OpenAI** provider is used. With the flag on, each question is also sent to the external embedding API. |

### F-1.2 Exploit preconditions

All of these must hold:
1. `HERMES_DOCUMENT_RAG_ENABLED=true` in the running `hermes-web` container.
2. At least one `DocumentTextChunk` row has a non-null `embedding` of the active dimension (`chunk-vector-store.ts:42-44`).
3. The query embedding succeeds: provider configured, and a key present for OpenAI.
4. The caller is signed in with the `authoring` capability, in **any** organisation.

### F-1.3 Impact

- Any authoring user of organisation B can receive up to 5 chunks per question from documents uploaded under organisation A, or uploaded by platform staff.
- It is a confidentiality breach of tenant data. It also violates CLAUDE.md "Tenant isolation / never expose another organization's data".
- Secondary impact: the user's question leaves the host through the embedding provider.

### F-1.4 Production flag check

**Result from this session: `UNVERIFIED`** (the owner-reported result is at the end of this section). This session could not observe production, for these reasons:
- The flag is read only from `/opt/hermes-os-nexuz/.env.production` on the production host, via `env_file` in `docker-compose.prod.yml:54`. It is not in the repository or in GitHub configuration.
- Production is reached only by GitHub Actions over SSH with a deploy key (`.github/workflows/deploy.yml:254`). This session has no production SSH access. An attempt to inspect the local SSH configuration was **denied**, and it was not retried or circumvented.
- No authenticated `authoring` session is available to probe `/api/brain` behaviourally.
- Creating a workflow to probe production would be a code change plus a push, and that is outside the current authorisation.

**Therefore the flag was neither confirmed nor changed.**

The owner, or an operator with production access, can check it with the procedure below. It prints only `enabled` or `disabled` and reveals no value:

```bash
cd /opt/hermes-os-nexuz && docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production exec -T hermes-web node -e 'const v=(process.env.HERMES_DOCUMENT_RAG_ENABLED||"").trim().toLowerCase();process.stdout.write(v==="true"?"enabled\n":"disabled\n")'
```

The check reads the **running container's** environment, which is authoritative. The file on disk could differ from what the container started with.

**Optional exposure sizing (a count only, no content):**

```bash
cd /opt/hermes-os-nexuz && docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM \"DocumentTextChunk\" WHERE embedding IS NOT NULL"'
```

If the first command prints `enabled`, apply the containment procedure. It is an owner or operator action, because it modifies a production environment file:
1. Back up the env file (`cp -p .env.production .env.production.bak-<UTC-timestamp>`, mode 600).
2. Set `HERMES_DOCUMENT_RAG_ENABLED=false`. Change only that key; print nothing.
3. Recreate only the web container: `docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --no-deps hermes-web`. Expect a brief restart. The compose healthcheck gates readiness.
4. Re-run the check command. It must print `disabled`.
5. **Rollback:** restore the backup file and repeat step 3.

With the flag off, `/api/brain` attaches no `documentRagEvidence` and keeps every deterministic field, for unset and for `"false"` alike. This is pinned by `src/app/api/brain/__tests__/route.test.ts:384-410`. **No functionality the product relies on is lost.**

A durable, code-level fix is still required either way (the remediation plan). An env flag is only containment.

**Owner result (2026-09-23):** the owner ran the check above and reported `disabled`. The flag was not changed, and this session never connected to production.

### F-1.5 Related unscoped caller

`POST /api/documents/search` (`src/app/api/documents/search/route.ts:19-43`) called the same unscoped `searchDocuments()`. It is gated by platform `admin`, not flag-gated. The F-1 change scopes it too, because `searchDocuments` now **requires** a scope. The rest of the document pipeline's ownership gaps remain under F-2.

### F-1.6 Fix status (2026-09-23, uncommitted, branch `feature/industrial-knowledge-library`)

The Stage 1 code fix is in the working tree. It adds no schema change and no migration.

- **`chunk-vector-store.ts`:** `search()` now takes a **required** `ChunkSearchScope`.
  - SQL `INNER JOIN "Document" d … AND d."tenantId" = $2`, with the orgId bound as a parameter.
  - The session store applies the same predicate through the session document store.
  - An unusable scope returns `[]`.
- **`search.ts`:** `searchDocuments(query, scope, topK)` has a required scope. `resolveDocumentSearchScope(owner)` fails closed for anonymous, ambiguous and org-less owners. Without a scope the embedding provider is **not called**.
- **`/api/brain`:** the server-resolved `owner` is passed to the document layer. Without a usable scope the result is `{ matches: [], fallbackUsed: true, error: "document_rag_scope_unavailable" }`. Scope resolution happens inside the existing try/catch.
- **`/api/documents/search`:** scoped to the caller's resolved organization.
- **Tests:** real PostgreSQL 8/8. F-1 unit suites 13 files, 223 tests; with the phase99 and phase100 gates, 16 files, 322 tests, all PASS. `tsc` 0 errors, lint clean. Mutation proofs M1–M4, R10 and R11 all turned RED under mutation and passed after restore. The full suite has 2 failures outside F-1 (load and sharp timeouts). Details are in the remediation plan §7.
- **Remaining:**
  - Legacy NULL-tenant documents are now invisible to Brain document RAG, which is the intended fail-closed behaviour.
  - Stage 2 (schema hardening) and F-2 are still open.
  - The flag stays `disabled` in production.

---

## F-2: Document pipeline has no tenant ownership (P1)

### Evidence
- `POST /api/documents` (`src/app/api/documents/route.ts:63-116`) creates `Document` rows through `documentRepository().create(...)` and **never sets `tenantId`**.
- The only guard is a local `requireAdmin()` (`:39-49`), a platform `can(role,"admin")` check with no `requireOrgActor` and no `requirePermission`.
- `GET /api/documents` (`:51-56`) → `documentRepository().list()` → `findMany({ orderBy: { createdAt: "desc" } })` (`src/lib/documents/document-repository.ts:124-128`). It is **unscoped and unbounded**.
- `GET/DELETE /api/documents/[id]` (`src/app/api/documents/[id]/route.ts:22-49`) and `POST /api/documents/[id]/process` (`process/route.ts:31`) use the same platform-admin gate, with no ownership check on the id.
- `DocumentTextChunk` and `DocumentChunk` have no tenant column (`prisma/schema.prisma:182-200, 226-245`).
- Upload validation is weaker than the Phase 102 media pattern. It checks the extension and MIME allow-list and accepts `application/octet-stream`, and has **no magic-byte check** (`src/lib/documents/validation.ts:64-87`).

### Impact
- Every document is effectively platform-global. Any holder of the platform `admin` capability can list, read metadata of, process or delete any document.
- Whether this is a cross-tenant exposure depends on whether platform `admin` is ever granted to tenant users. **Owner to confirm.**
- The pipeline is also the data source for F-1. The unbounded list is a performance risk.

### Proposed fix (not implemented)
1. Treat the platform `Document` pipeline as **platform-internal only** until it is rebuilt. Document that decision.
2. When tenant documents are needed (knowledge-library proposal, Phase P3), use the owner-derived chain `requirePlatformAuth → requireOrgActor → requirePermission`. Write `organizationId` from the server context only, and filter every read or delete by it in SQL. Return 404 for foreign ids.
3. Additive migration: add `organizationId` to `DocumentTextChunk` (and `DocumentChunk`), with a composite FK to `Document(id, organizationId)`, following the Phase 109-C-UI.2 R7 composite-tenant-FK precedent. Backfill needs an owner decision for existing NULL-tenant rows: quarantine them, do not guess.
4. Add magic-byte validation and refuse `application/octet-stream`, reusing `src/lib/media/validation.ts`.
5. Paginate `GET /api/documents`: `take ≤ 50` plus a cursor.

### Regression tests to add with the fix
- Org A admin cannot list, read, process or delete an org B document (404, not 403).
- A body or query `organizationId` is ignored.
- NULL-tenant legacy rows are invisible to tenant callers.
- An octet-stream or mismatched magic-byte upload is rejected.
- The list is bounded.

---

## F-3: Unbounded anonymous read in `GET /api/knowledge` (P2)

### Evidence
- `src/app/api/knowledge/route.ts:45-57`: `GET()` calls `repo.list()` for **every** caller, including anonymous ones. It then returns `articles.filter((a) => a.status === "published")` unless the caller has `authoring`.
- `src/lib/storage/knowledge-repository.ts:100-107`: `list()` is `findMany({ orderBy: { createdAt: "desc" } })`, with **no `where` and no `take`**.
- A published-only `listPublished()` already exists (`:107`).
- `KnowledgeArticle` has **no indexes** (`prisma/schema.prisma:46-63`).

### Impact
- **No confidentiality leak was observed.** Drafts are filtered before serialisation, and existing tests assert that anonymous and viewer callers see published articles only (`src/app/api/knowledge/__tests__/route.test.ts`).
- The risk is resource exhaustion: every anonymous request loads every row, drafts included, into memory. That is an unauthenticated amplification vector as the table grows.
- The filter-after-read pattern also means one future refactor mistake would leak drafts.
- `KnowledgeArticle` is a global table with no `organizationId`, so this is **not** a cross-tenant issue.

### Proposed fix (not implemented)
- Non-authoring callers use `repo.listPublished()`, which filters on status in SQL. All callers get `take ≤ 100` with cursor pagination.
- Add the index `@@index([status, createdAt])` in a new additive migration.

### Regression tests
- Anonymous GET issues a query with a `status: "published"` predicate and a `take`, verified via the repository mock.
- A draft row never appears for anonymous, viewer or engineer-without-authoring callers.
- The response size is bounded with more than 100 rows.
- Existing published-only tests remain green.

---

## F-4: Avatar upload trusts the declared MIME type (P3, noted)

`src/app/api/articles/author-profile/avatar/route.ts:46-58` checks only `file.type`, and its extension check is inert. Files are written to publicly served `public/uploads/authors`. It passes the Phase 99 static gate only because that gate matches tokens (`scripts/security/phase99/static-invariants.mjs:488-520`). Fix: reuse `sniffImageMime` from `src/lib/articles/media.ts`. It is out of scope for the knowledge library and is recorded so it is not lost.

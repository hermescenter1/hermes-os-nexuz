# Phase 90B — knowledge-surface tenant ownership: deployment runbook

Covers migration `20260813000000_phase90b_knowledge_tenant_ownership` and the
application changes that extend Phase 90's Industrial-Brain tenant isolation to
the saved-memory / unknown-triage / project / knowledge-graph surface, plus the
durable audit tenancy fields.

Nothing in this document has been executed against a real database. It is the
reviewed plan. Phase 90B stacks on top of Phase 90
(`20260812000000_phase90_brain_tenant_ownership`); apply Phase 90 first.

---

## 1. What the migration does

Purely additive, on five tables:

| Table | Added |
| --- | --- |
| `EngineeringMemory` | `userId TEXT NULL`, `organizationId TEXT NULL`, two indexes |
| `UnknownAnalysis` | `userId TEXT NULL`, `organizationId TEXT NULL`, two indexes |
| `Project` | `userId TEXT NULL`, `organizationId TEXT NULL`, two indexes |
| `EngineeringCase` | one index `(status, createdAt)` — supports the public read |
| `AuditLog` | `organizationId TEXT NULL`, `outcome TEXT NULL`, `correlationId TEXT NULL`, one index |

No `DROP`, `DELETE`, `TRUNCATE`, `RENAME`, no `ALTER COLUMN`, no `NOT NULL`, no
default. Existing rows remain valid and unmodified — they simply carry `NULL` in
the new columns. Asserted statically by
`prisma/__tests__/phase90b-migration-safety.test.ts`.

## 2. Legacy ownership policy (identical to Phase 90)

Before Phase 90B, `EngineeringMemory` / `UnknownAnalysis` / `Project` had no
owner column, so `/api/memory`, `/api/unknown`, `/api/projects`,
`/api/knowledge-graph/*` and every dashboard/intelligence surface built on them
were protected only by the coarse `requireAuthoring` capability: **every
authoring user of every organization saw every other tenant's saved memories,
unknown queries, projects and the whole cross-tenant knowledge graph.**

A row whose `userId` and `organizationId` are both `NULL` cannot be attributed to
any tenant. Serving it to "all authoring users" would be exactly the cross-tenant
exposure this work removes, so such rows are **quarantined**:

- excluded from list, read, update, delete, search, graph traversal and export;
- indistinguishable from a missing row (no existence disclosure);
- **not deleted** — the data is preserved, only unreachable.

`MemoryFeedback` has no owner column of its own — it inherits tenant scope
through its parent memory (feedback create/list is gated on parent ownership via
the owner-scoped `memoryRepository`).

### Deterministic backfill: not possible

Neither `EngineeringMemory`, `UnknownAnalysis` nor `Project` carries any trusted
relationship from which ownership could be proven (they predate the tenant
model). Every pre-Phase-90B row is therefore **ambiguous**, and per policy
ambiguous rows must not be assigned to an arbitrary user or "the first
organization". **No backfill is proposed.** All legacy rows stay quarantined.

To size the quarantine before deploying, run this **read-only** query against a
replica or a backup restore — never as part of the deploy:

```sql
SELECT 'EngineeringMemory' AS table_name, count(*) AS quarantined
  FROM "EngineeringMemory" WHERE "userId" IS NULL AND "organizationId" IS NULL
UNION ALL SELECT 'UnknownAnalysis', count(*)
  FROM "UnknownAnalysis"  WHERE "userId" IS NULL AND "organizationId" IS NULL
UNION ALL SELECT 'Project', count(*)
  FROM "Project"          WHERE "userId" IS NULL AND "organizationId" IS NULL;
```

Counts are environment-specific and were **not** measured here: no production or
staging database was contacted during this phase.

### Recovery

If a quarantined row must be restored to a tenant, that is an explicit
administrative action, not an API read. The shared `legacyQuarantineWhere()` /
`ownerWhere()` predicates in `src/lib/storage/owner-scope.ts` govern this; no
ordinary repository read serves an unattributed row.

## 3. Out of scope (documented follow-ups)

- **KnowledgeArticle** is not tenant-owned. Its published rows are intentionally
  shared knowledge; scoping its draft/review rows is a separate follow-up. The
  `action:"library"` path in `/api/unknown` still writes to the shared library —
  but only from the caller's own (owner-scoped) unknown row.
- **`resolveBrainOwner()` N+1**: the downstream dashboard/intelligence services
  (dashboard/intelligence/domain-intelligence/multi-agent/benchmark/risk/timeline)
  are now correctly tenant-scoped *for free* (they call the owner-scoped service
  functions), but each per-memory `getEngineeringMemory` in their loops
  re-resolves the owner. This is correct but adds one indexed membership lookup
  per row; batching the owner resolution across those loops is a perf follow-up,
  not a correctness gap.

## 4. Compatibility across the deploy window

- **Old application + migrated database.** The old code never references the new
  columns; adding nullable columns and indexes does not change any existing
  query's result. The currently-running container keeps working normally.
- **New application + un-migrated database.** Owner-scoped queries would
  reference columns that do not exist. Therefore the migration MUST precede the
  new container. Readiness (`/api/health/ready`) reflects database reachability;
  it does not probe for these columns.

## 5. Deployment order

Do not reorder. Apply **after** the Phase 90 migration.

| # | Step | Verify before continuing |
| --- | --- | --- |
| a | **Verify a database backup exists and restores.** | Backup is recent; a test restore succeeded. |
| b | Fetch and check out the reviewed SHA on the deploy host. | `git rev-parse HEAD` matches the reviewed commit. |
| c | `npx prisma migrate deploy` | Command exits 0; the Phase 90 AND Phase 90B migrations are applied. |
| d | **Verify the migration.** Run the schema check below. | All new columns and indexes present. |
| e | `docker compose -p hermes -f docker-compose.prod.yml build hermes-web` | Build exits 0. |
| f | `docker compose -p hermes -f docker-compose.prod.yml up -d --no-deps hermes-web` | Only `hermes-web` is recreated; Postgres/Redis untouched. |
| g | Liveness + readiness | `GET /api/health` → 200; `GET /api/health/ready` → 200 `{"database":true}`. |
| h | **Tenant-isolation smoke** (below) | All checks pass. |

Step (d) verification — read-only:

```sql
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_name IN ('EngineeringMemory','UnknownAnalysis','Project','AuditLog')
   AND column_name IN ('userId','organizationId','outcome','correlationId')
 ORDER BY table_name, column_name;
```

Step (h) tenant-isolation smoke — as two authoring users in **different** orgs:

1. User A saves a memory / runs an unknown analysis; it appears in A's lists.
2. User B's `/api/memory`, `/api/unknown`, `/api/knowledge-graph` do **not**
   contain A's records.
3. B requests A's memory id directly (`GET /api/memory/<A-id>`) → 404, and
   `POST /api/memory/<A-id>/feedback` → 404 (no cross-tenant mutation).
4. A public/anonymous request for the published library still returns it.

## 6. Rollback

**Application rollback is safe and is the supported path**: redeploy the previous
`hermes-web` image. The added columns and indexes are nullable and unreferenced
by the old code, so they are inert.

**Do not roll the schema back.** Dropping the columns would destroy any ownership
attribution written by the new version while it was live. The additive columns
are designed to be left in place permanently; a forward fix is always preferred
to a destructive down-migration.

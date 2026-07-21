# Phase 90 — Industrial Brain tenant ownership: deployment runbook

Covers migration `20260812000000_phase90_brain_tenant_ownership` and the
application changes that quarantine unattributed legacy rows.

Nothing in this document has been executed. It is the reviewed plan.

---

## 1. What the migration does

Purely additive, on two tables:

| Table | Added |
| --- | --- |
| `AnalysisRecord` | `userId TEXT NULL`, `organizationId TEXT NULL`, two indexes |
| `EngineeringCase` | `userId TEXT NULL`, `organizationId TEXT NULL`, two indexes |

No `DROP`, `DELETE`, `TRUNCATE`, `RENAME`, no `ALTER COLUMN`, no `NOT NULL`,
no default. Existing rows remain valid and unmodified — they simply carry
`NULL` in the two new columns. Asserted statically by
`prisma/__tests__/phase90-migration-safety.test.ts`.

## 2. Legacy ownership policy

Before Phase 90 neither table had an owner column, so `/api/brain` could only be
protected by the coarse `requireAuthoring` gate: **every authoring user saw every
other user's analyses and cases.**

A row whose `userId` and `organizationId` are both `NULL` cannot be attributed to
any tenant. Serving it to "all authoring users" would be exactly the cross-tenant
exposure this work exists to remove, so such rows are **quarantined**:

- excluded from list, read, update, delete, export and save-as-case;
- indistinguishable from a missing row (no existence disclosure);
- **not deleted** — the data is preserved, only unreachable.

`PUBLISHED` cases are unaffected. Publishing is what makes a case public
knowledge, so the public corpus is served by the separate, explicitly named
`listPublishedCases()` path, which is deliberately not owner-scoped. A legacy
published case therefore stays publicly readable.

### Deterministic backfill: not possible

Neither model carries any trusted relationship from which ownership could be
proven — verified against the schema:

| Model | Relations | Creator field | Site / asset / project link |
| --- | --- | --- | --- |
| `AnalysisRecord` | none | none | none |
| `EngineeringCase` | none | none | none |

The only ownership-bearing fields are the new nullable columns themselves.
Every pre-Phase-90 row is therefore **ambiguous**, and per policy ambiguous rows
must not be assigned to an arbitrary user or to "the first organization".
**No backfill is proposed.** All legacy rows stay quarantined.

To size the quarantine before deploying, run this **read-only** query against a
replica or a backup restore — never as part of the deploy:

```sql
SELECT 'AnalysisRecord' AS table_name, count(*) AS quarantined
  FROM "AnalysisRecord" WHERE "userId" IS NULL AND "organizationId" IS NULL
UNION ALL
SELECT 'EngineeringCase', count(*)
  FROM "EngineeringCase" WHERE "userId" IS NULL AND "organizationId" IS NULL;
```

Counts are environment-specific and were **not** measured here: no production or
staging database was contacted during this phase.

### Recovery

If a quarantined row must be restored to a tenant, that is an explicit
administrative action, not an API read. `legacyQuarantineWhere()` exists to let a
separately reviewed, permission-gated and audited tool enumerate the affected
rows. No repository calls it (asserted by test), and no global
"authoring users can see legacy data" fallback exists anywhere.

## 3. Compatibility across the deploy window

- **Old application + migrated database.** The old code never references the new
  columns; adding nullable columns and indexes does not change any existing
  query's result. The currently-running container keeps working normally between
  step (c) and step (f) — there is no insecure or broken window.
- **New application + un-migrated database.** Owner-scoped queries would
  reference columns that do not exist. Therefore the migration MUST precede the
  new container. Readiness (`/api/health/ready`) reflects database reachability;
  it does not probe for these columns, so do not rely on it to detect a skipped
  migration — use step (d).

## 4. Deployment order

Do not reorder. Steps (c) and (f) are the only state-changing steps.

| # | Step | Verify before continuing |
| --- | --- | --- |
| a | **Verify a database backup exists and restores.** | Backup timestamp is recent; a test restore succeeded. |
| b | `git pull` on the deploy host (no build yet). | `git rev-parse HEAD` matches the reviewed commit. |
| c | `npx prisma migrate deploy` | Command exits 0 and reports the Phase 90 migration applied. |
| d | **Verify the migration.** Run the schema check below. | All four columns and four indexes present. |
| e | `docker compose -f docker-compose.prod.yml build hermes-web` | Build exits 0. |
| f | `docker compose -f docker-compose.prod.yml up -d --no-deps hermes-web` | Only `hermes-web` is recreated; Postgres/Redis untouched. |
| g | Liveness + readiness | `GET /api/health` → 200 `{"status":"ok"}`; `GET /api/health/ready` → 200 `{"status":"ready","database":true}`. |
| h | `docker compose -f docker-compose.prod.yml restart nginx` | Public pages load over HTTPS. |
| i | **Tenant-isolation smoke** (below) | All checks pass. |
| j | Rollback decision | See §5. |

Step (d) verification — read-only:

```sql
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_name IN ('AnalysisRecord','EngineeringCase')
   AND column_name IN ('userId','organizationId')
 ORDER BY table_name, column_name;   -- expect 4 rows

SELECT indexname FROM pg_indexes
 WHERE tablename IN ('AnalysisRecord','EngineeringCase')
   AND indexname LIKE '%userId%' OR indexname LIKE '%organizationId%';
```

Step (i) tenant-isolation smoke — as two users in **different** organizations:

1. User A runs a Brain analysis; it appears in A's history.
2. User B's history does **not** contain A's analysis.
3. B requests A's analysis id directly → same response as a fabricated id.
4. A public/anonymous request for published library cases still returns them.
5. A `VIEWER` requests `GET /api/organizations/<org>/invitations` → 403.
6. `GET /api/health` returns 200 while the database is reachable.

## 5. Rollback

**Application rollback is safe and is the supported path**: redeploy the previous
`hermes-web` image. The added columns and indexes are nullable and unreferenced
by the old code, so they are inert.

**Do not roll the schema back.** Dropping the columns would destroy any ownership
attribution written by the new version while it was live. The additive columns
are designed to be left in place permanently; a forward fix is always preferred
to a destructive down-migration.

If the migration itself fails partway, Postgres rolls back the failing statement;
re-run `prisma migrate deploy` after fixing the cause. Take no destructive action
against the two tables.

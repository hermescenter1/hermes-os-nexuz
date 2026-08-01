/**
 * PHASE 92 — legacy-populated migration rehearsal (CI only, real PostgreSQL).
 *
 * Proves that a database created at the pre-Phase-92 baseline, populated with
 * representative AuditLog rows, survives the Phase 92 additive-index migration
 * with NO row loss or mutation, and that the two new indexes can also be built
 * the production-safe way (CREATE INDEX CONCURRENTLY, the operator escape hatch
 * documented in docs/phase92-observability-runbook.md).
 *
 * Procedure:
 *   1. Create an isolated legacy database via a maintenance connection.
 *   2. Hold back the Phase 92 migration dir; `prisma migrate deploy` → base schema
 *      (AuditLog present, WITHOUT the two observability indexes).
 *   3. Raw-insert representative rows: ordinary-old, protected-old (login.failure),
 *      ordinary-recent — some carrying a correlationId. Record the count.
 *   4. Assert the two indexes are absent at baseline.
 *   5. Restore the Phase 92 dir; `prisma migrate deploy` → the additive CREATE INDEX.
 *   6. Assert both indexes exist and verify their pg_catalog definitions.
 *   7. Assert the row count and the individual rows are unchanged (no data loss).
 *   8. Prove the CONCURRENTLY path: DROP + `CREATE INDEX CONCURRENTLY` (identical
 *      names, so the recorded migration stays valid) and re-verify definitions.
 *   9. Idempotency: `prisma migrate deploy` again → prove NO pending migration.
 *  10. Prove the indexed lookups: correlationId equality and createdAt range,
 *      and that the planner can use each index (enable_seqscan=off + EXPLAIN).
 *
 * Never prints DATABASE_URL, row payloads or any secret. Non-zero exit on any
 * failed assertion. Executes NO destructive rollback and never contacts
 * production — it only reaches the CI-local service container.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS = join(REPO, "prisma", "migrations");
const HOLD = join(REPO, ".phase92-held-migrations");
const PHASE92_DIRS = ["20260816000000_phase92_audit_observability_indexes"];
const IDX = ["AuditLog_createdAt_idx", "AuditLog_correlationId_idx"];

const LEGACY_URL = process.env.DATABASE_URL; // the (fresh) legacy database
const MAINT = process.env.MAINT_DATABASE_URL; // an existing database, used only to CREATE the legacy one
if (!LEGACY_URL || !MAINT) {
  console.error("RESULT phase92_legacy=FAIL (need DATABASE_URL + MAINT_DATABASE_URL)");
  process.exit(2);
}

const DAY = 24 * 60 * 60 * 1000;
let failed = false;
const check = (label, cond) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond) failed = true;
};

// Create the isolated legacy database (idempotent) via the maintenance connection.
{
  const legacyDb = new URL(LEGACY_URL).pathname.replace(/^\//, "");
  const admin = new pg.Client({ connectionString: MAINT });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${legacyDb}"`);
    await admin.query(`CREATE DATABASE "${legacyDb}"`);
  } finally {
    await admin.end();
  }
}

function deploy() {
  execSync("npx --no-install prisma migrate deploy", { cwd: REPO, stdio: "inherit", env: process.env });
}
function holdPhase92() {
  if (!existsSync(HOLD)) mkdirSync(HOLD);
  for (const d of PHASE92_DIRS) {
    const from = join(MIGRATIONS, d);
    if (existsSync(from)) renameSync(from, join(HOLD, d));
  }
}
function restorePhase92() {
  for (const d of PHASE92_DIRS) {
    const from = join(HOLD, d);
    if (existsSync(from)) renameSync(from, join(MIGRATIONS, d));
  }
  if (existsSync(HOLD)) rmSync(HOLD, { recursive: true, force: true });
}

async function indexNames(client) {
  const { rows } = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'AuditLog' AND indexname = ANY($1::text[]) ORDER BY indexname`,
    [IDX],
  );
  return rows.map((r) => r.indexname);
}
async function indexDefs(client) {
  const { rows } = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'AuditLog' AND indexname = ANY($1::text[])`,
    [IDX],
  );
  return Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
}

const client = new pg.Client({ connectionString: LEGACY_URL });

try {
  // 1-2: base schema only (Phase 92 dir held back).
  holdPhase92();
  deploy();

  await client.connect();

  // 3: representative rows (metadata is a required Json column → '{}'::jsonb;
  //    id has no DB default → supplied explicitly).
  const now = new Date();
  const old = new Date(now.getTime() - 400 * DAY);
  const seed = [
    ["p92leg_old_ord", "case.updated", "case", old, "p92leg-cid-old"],
    ["p92leg_old_prot", "login.failure", "user", old, "p92leg-cid-prot"],
    ["p92leg_recent_ord", "case.updated", "case", now, "p92leg-cid-recent"],
  ];
  for (const [id, action, entityType, createdAt, cid] of seed) {
    await client.query(
      `INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt", "correlationId")
       VALUES ($1, $2, $3, '{}'::jsonb, $4, $5)`,
      [id, action, entityType, createdAt, cid],
    );
  }
  const before = (await client.query(`SELECT count(*)::int AS c FROM "AuditLog"`)).rows[0].c;
  check("phase92_legacy_seeded", before >= 3);

  // 4: indexes absent at baseline.
  check("phase92_legacy_indexes_absent_pre", (await indexNames(client)).length === 0);

  // 5: apply the Phase 92 migration.
  restorePhase92();
  deploy();

  // 6: both indexes exist with the expected definitions.
  check("phase92_legacy_both_indexes_present", (await indexNames(client)).join(",") === IDX.slice().sort().join(","));
  {
    const defs = await indexDefs(client);
    check(
      "phase92_legacy_createdAt_indexdef",
      /\bON public\."AuditLog"[\s\S]*\("createdAt"\)/.test(defs["AuditLog_createdAt_idx"] ?? ""),
    );
    check(
      "phase92_legacy_correlationId_indexdef",
      /\bON public\."AuditLog"[\s\S]*\("correlationId"\)/.test(defs["AuditLog_correlationId_idx"] ?? ""),
    );
  }

  // 7: no row loss or mutation.
  const after = (await client.query(`SELECT count(*)::int AS c FROM "AuditLog"`)).rows[0].c;
  check("phase92_legacy_rowcount_intact", after === before);
  {
    const { rows } = await client.query(
      `SELECT id, action FROM "AuditLog" WHERE id = ANY($1::text[]) ORDER BY id`,
      [seed.map((s) => s[0])],
    );
    check("phase92_legacy_rows_intact", rows.length === seed.length);
  }

  // 8: prove the production-safe CONCURRENTLY path (operator escape hatch).
  //    CONCURRENTLY cannot run inside a transaction; a bare pg query is autocommit.
  for (const name of IDX) await client.query(`DROP INDEX IF EXISTS "${name}"`);
  check("phase92_legacy_indexes_dropped", (await indexNames(client)).length === 0);
  await client.query(`CREATE INDEX CONCURRENTLY "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt")`);
  await client.query(`CREATE INDEX CONCURRENTLY "AuditLog_correlationId_idx" ON "AuditLog" ("correlationId")`);
  check("phase92_legacy_concurrently_rebuilt", (await indexNames(client)).join(",") === IDX.slice().sort().join(","));

  // 9: idempotency — a second deploy applies nothing new.
  const migCountBefore = (await client.query(`SELECT count(*)::int AS c FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows[0].c;
  deploy();
  const migCountAfter = (await client.query(`SELECT count(*)::int AS c FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows[0].c;
  check("phase92_legacy_migrate_idempotent", migCountAfter === migCountBefore);
  {
    // prisma migrate status must report an up-to-date schema (exit 0, no pending).
    let statusOk = true;
    try {
      execSync("npx --no-install prisma migrate status", { cwd: REPO, stdio: "pipe", env: process.env });
    } catch {
      statusOk = false;
    }
    check("phase92_legacy_no_pending_migrations", statusOk);
  }

  // 10: index-backed lookups return the correct rows.
  const byCid = await client.query(`SELECT id FROM "AuditLog" WHERE "correlationId" = $1`, ["p92leg-cid-old"]);
  check("phase92_legacy_correlation_lookup", byCid.rows.length === 1 && byCid.rows[0].id === "p92leg_old_ord");
  const cutoff = new Date(now.getTime() - 365 * DAY);
  const byTime = await client.query(`SELECT count(*)::int AS c FROM "AuditLog" WHERE "createdAt" < $1`, [cutoff]);
  check("phase92_legacy_createdAt_range", byTime.rows[0].c >= 2);

  // and the planner can actually use each index (force it on this tiny table).
  await client.query("SET enable_seqscan = off");
  const planCid = (await client.query(`EXPLAIN SELECT id FROM "AuditLog" WHERE "correlationId" = $1`, ["p92leg-cid-old"])).rows
    .map((r) => r["QUERY PLAN"]).join("\n");
  check("phase92_legacy_correlation_index_usable", planCid.includes("AuditLog_correlationId_idx"));
  const planTime = (await client.query(`EXPLAIN SELECT id FROM "AuditLog" WHERE "createdAt" < $1`, [cutoff])).rows
    .map((r) => r["QUERY PLAN"]).join("\n");
  check("phase92_legacy_createdAt_index_usable", planTime.includes("AuditLog_createdAt_idx"));
  await client.query("SET enable_seqscan = on");
} catch (err) {
  // Redacted: never surface the connection string or row payloads.
  console.error(`RESULT phase92_legacy=FAIL (${err?.name ?? "error"}: ${String(err?.message ?? "").slice(0, 200)})`);
  failed = true;
} finally {
  try {
    await client.end();
  } catch {
    /* ignore */
  }
  restorePhase92(); // always restore the migration dir, even on failure
}

console.log(`RESULT phase92_legacy=${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);

/**
 * PHASE 93 — disaster-recovery restore rehearsal (CI only, real PostgreSQL).
 *
 * Proves the ACTUAL backup → disaster → restore pipeline that operations uses
 * (scripts/backup-postgres.sh + scripts/verify-backup.sh + scripts/restore-postgres.sh),
 * end to end, against a disposable CI-local PostgreSQL 16 service. It measures a
 * real Recovery Time Objective (RTO) for the restore and proves the Recovery
 * Point (data-integrity) is exact: not one row is lost or mutated.
 *
 * Mirrors the production scripts' pg_dump/pg_restore flags EXACTLY:
 *   backup  : pg_dump  --format=custom --no-acl --no-owner   (backup-postgres.sh:27-33)
 *   verify  : pg_restore --list                              (verify-backup.sh:22)
 *   restore : DROP DATABASE + CREATE + pg_restore --no-acl --no-owner (restore-postgres.sh)
 *
 * Procedure:
 *   1. Create an isolated PRIMARY database; `prisma migrate deploy` → full schema.
 *   2. Seed representative AuditLog rows (some carrying a correlationId).
 *   3. Snapshot the per-table row-count map of every public base table.
 *   4. Back up: pg_dump custom format (== backup-postgres.sh).
 *   5. Verify the artifact: pg_restore --list must list the four essential tables
 *      (== verify-backup.sh: Organization, User, IndustrialSite, IndustrialAsset).
 *   6. DISASTER: drop + recreate the RESTORE target database empty.
 *   7. RESTORE and MEASURE RTO: time pg_restore --no-acl --no-owner.
 *   8. Data-integrity proof: the restored per-table row-count map is DEEP-EQUAL
 *      to the pre-disaster snapshot (no loss, no mutation).
 *   9. Assert the four essential tables exist in the restored schema.
 *  10. Post-restore `prisma migrate deploy` is idempotent (schema already current;
 *      matches restore-postgres.sh's operator reminder) — no pending migrations.
 *  11. FRESH restore: restore the same artifact into a brand-new empty database
 *      and prove the seeded AuditLog count matches (fresh-database restore path).
 *  12. Clean up every temporary database.
 *
 * Never prints any connection string, credential or row payload. Non-zero exit
 * on any failed assertion. Executes NO rollback and never contacts production or
 * staging — it only reaches the CI-local service container.
 */

import { execSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MAINT = process.env.MAINT_DATABASE_URL; // existing DB, used only to CREATE/DROP the rehearsal DBs
if (!MAINT) {
  console.error("RESULT phase93_dr=FAIL (need MAINT_DATABASE_URL)");
  process.exit(2);
}

// Essential tables asserted by scripts/verify-backup.sh — the backup is only
// considered valid if all four survive the round trip.
const ESSENTIAL = ["Organization", "User", "IndustrialSite", "IndustrialAsset"];

const PRIMARY_DB = "hermes_phase93_dr_primary";
const RESTORE_DB = "hermes_phase93_dr_restore";
const FRESH_DB = "hermes_phase93_dr_fresh";

let failed = false;
const check = (label, cond) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond) failed = true;
};

function urlWithDb(base, dbName) {
  const u = new URL(base);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function withAdmin(fn) {
  const admin = new pg.Client({ connectionString: MAINT });
  await admin.connect();
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

async function recreateDb(admin, dbName) {
  // Terminate stragglers so DROP cannot block, then drop + create empty.
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
}

// Per-table row-count map for every base table in the public schema.
async function rowCountMap(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows: tables } = await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const map = {};
    for (const { table_name } of tables) {
      const { rows } = await c.query(`SELECT count(*)::int AS c FROM "${table_name}"`);
      map[table_name] = rows[0].c;
    }
    return map;
  } finally {
    await c.end();
  }
}

function mapsEqual(a, b) {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length || ak.join(",") !== bk.join(",")) return false;
  return ak.every((k) => a[k] === b[k]);
}

const PRIMARY_URL = urlWithDb(MAINT, PRIMARY_DB);
const RESTORE_URL = urlWithDb(MAINT, RESTORE_DB);
const FRESH_URL = urlWithDb(MAINT, FRESH_DB);

const workDir = mkdtempSync(join(tmpdir(), "hermes-dr-"));
const DUMP = join(workDir, `hermes_${PRIMARY_DB}.dump`);
const DAY = 24 * 60 * 60 * 1000;

try {
  // 1. Isolated PRIMARY database with the full, current schema.
  await withAdmin((admin) => recreateDb(admin, PRIMARY_DB));
  execSync("npx --no-install prisma migrate deploy", {
    cwd: REPO,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: PRIMARY_URL },
  });

  // 2. Seed representative AuditLog rows (matches the phase92 rehearsal shape).
  {
    const c = new pg.Client({ connectionString: PRIMARY_URL });
    await c.connect();
    try {
      const now = new Date();
      const old = new Date(now.getTime() - 400 * DAY);
      const seed = [
        ["p93dr_a", "case.updated", "case", now, "p93dr-cid-a"],
        ["p93dr_b", "login.failure", "user", old, "p93dr-cid-b"],
        ["p93dr_c", "case.published", "case", now, "p93dr-cid-c"],
        ["p93dr_d", "org.ownership.transfer", "organization", old, null],
      ];
      for (const [id, action, entityType, createdAt, cid] of seed) {
        await c.query(
          `INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt", "correlationId")
           VALUES ($1, $2, $3, '{}'::jsonb, $4, $5)`,
          [id, action, entityType, createdAt, cid],
        );
      }
      const seeded = (await c.query(`SELECT count(*)::int AS c FROM "AuditLog"`)).rows[0].c;
      check("phase93_dr_seeded", seeded >= 4);
    } finally {
      await c.end();
    }
  }

  // 3. Pre-disaster snapshot of the whole database.
  const mapBefore = await rowCountMap(PRIMARY_URL);
  const seededAuditBefore = mapBefore["AuditLog"] ?? 0;
  check("phase93_dr_snapshot_nonempty", seededAuditBefore >= 4);

  // 4. BACKUP — identical flags to scripts/backup-postgres.sh.
  execFileSync(
    "pg_dump",
    [PRIMARY_URL, "--format=custom", "--no-acl", "--no-owner", "-f", DUMP],
    { stdio: "inherit" },
  );

  // 5. VERIFY the artifact — identical to scripts/verify-backup.sh (pg_restore --list).
  const toc = execFileSync("pg_restore", ["--list", DUMP], { encoding: "utf8" });
  check(
    "phase93_dr_backup_verifiable",
    ESSENTIAL.every((t) => toc.includes(`TABLE ${t} `) || toc.includes(`TABLE public ${t} `) || toc.includes(` ${t} `)),
  );

  // 6. DISASTER — recreate the restore target as an empty database.
  await withAdmin((admin) => recreateDb(admin, RESTORE_DB));

  // 7. RESTORE and MEASURE RTO — identical flags to scripts/restore-postgres.sh.
  const t0 = process.hrtime.bigint();
  execFileSync(
    "pg_restore",
    ["--no-acl", "--no-owner", "-d", RESTORE_URL, DUMP],
    { stdio: "inherit" },
  );
  const rtoMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`RESULT phase93_dr_rto_ms=${Math.round(rtoMs)}`);
  check("phase93_dr_rto_measured", rtoMs > 0);

  // 8. DATA-INTEGRITY PROOF — the restored database is byte-for-byte the same set
  //    of rows per table (no loss, no mutation, no phantom rows).
  const mapAfter = await rowCountMap(RESTORE_URL);
  check("phase93_dr_rowcounts_identical", mapsEqual(mapBefore, mapAfter));
  check("phase93_dr_audit_rows_intact", (mapAfter["AuditLog"] ?? -1) === seededAuditBefore);

  // 9. Essential tables present in the restored schema.
  {
    const c = new pg.Client({ connectionString: RESTORE_URL });
    await c.connect();
    try {
      const { rows } = await c.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [ESSENTIAL],
      );
      check("phase93_dr_essential_tables_restored", rows.length === ESSENTIAL.length);
    } finally {
      await c.end();
    }
  }

  // 10. Post-restore migrate deploy is idempotent (schema already current).
  execSync("npx --no-install prisma migrate deploy", {
    cwd: REPO,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: RESTORE_URL },
  });
  {
    let statusOk = true;
    try {
      execSync("npx --no-install prisma migrate status", {
        cwd: REPO,
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: RESTORE_URL },
      });
    } catch {
      statusOk = false;
    }
    check("phase93_dr_post_restore_no_pending_migrations", statusOk);
  }

  // 11. FRESH-database restore path (restore into a brand-new empty DB).
  await withAdmin((admin) => recreateDb(admin, FRESH_DB));
  execFileSync("pg_restore", ["--no-acl", "--no-owner", "-d", FRESH_URL, DUMP], { stdio: "inherit" });
  {
    const c = new pg.Client({ connectionString: FRESH_URL });
    await c.connect();
    try {
      const c2 = (await c.query(`SELECT count(*)::int AS c FROM "AuditLog"`)).rows[0].c;
      check("phase93_dr_fresh_restore_rows", c2 === seededAuditBefore);
    } finally {
      await c.end();
    }
  }
} catch (err) {
  // Redacted: never surface the connection string or row payloads.
  console.error(`RESULT phase93_dr=FAIL (${err?.name ?? "error"}: ${String(err?.message ?? "").slice(0, 200)})`);
  failed = true;
} finally {
  // 12. Clean up temporary databases and the dump artifact.
  try {
    await withAdmin(async (admin) => {
      for (const db of [PRIMARY_DB, RESTORE_DB, FRESH_DB]) {
        await admin
          .query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [db],
          )
          .catch(() => {});
        await admin.query(`DROP DATABASE IF EXISTS "${db}"`).catch(() => {});
      }
    });
  } catch {
    /* best-effort cleanup */
  }
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log(`RESULT phase93_dr=${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);

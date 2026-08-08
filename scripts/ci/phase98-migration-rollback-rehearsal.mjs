/**
 * PHASE 98 — migration gate + rollback rehearsal (real Docker + pg16).
 *
 * Proves, against a disposable pgvector database:
 *  - the migration gate over the REAL prisma/migrations: additive classification,
 *    new-migration detection, and fail-closed detection of historical migration
 *    mutation;
 *  - an ADDITIVE forward migration keeps the previous app compatible
 *    (APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA — an old-style insert still works);
 *  - rollback-via-restore: an encrypted PRE-migration backup restores the exact
 *    pre-migration integrity (Hermes never runs down-migrations).
 *
 * Never prints row payloads or credentials. Synthetic disposable key only.
 */

import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withDisposablePg } from "./lib/disposable-pg.mjs";
import { evaluateMigrationGate, computeMigrationChecksums } from "../dr/migration-gate.mjs";
import { classifyRollback } from "../dr/release-state.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HBK = join(REPO, "scripts", "dr", "hbk.mjs");
const MIGRATIONS_DIR = join(REPO, "prisma", "migrations");

let failed = false;
const check = (label, cond) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond) failed = true;
};
const hbk = (args) => execFileSync("node", [HBK, ...args], { encoding: "utf8" });
const hbkFails = (args) => {
  try {
    execFileSync("node", [HBK, ...args], { stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
};

function migrationDigest(ctx, db) {
  return ctx
    .psql(`SELECT coalesce(md5(string_agg(h,'' ORDER BY h)),'EMPTY') FROM (SELECT md5(row_to_json(x)::text) h FROM "AuditLog" x) s`, db)
    .trim();
}

async function main() {
  // ── Migration gate over the REAL migrations (no DB needed) ────────────────────
  const target = computeMigrationChecksums(MIGRATIONS_DIR);
  const names = Object.keys(target).sort();
  check("phase98_miggate_has_migrations", names.length > 0);

  // Simulate a release base missing the newest migration → it is detected as NEW.
  const base = { ...target };
  const newest = names[names.length - 1];
  delete base[newest];
  const g1 = evaluateMigrationGate({ migrationsDir: MIGRATIONS_DIR, releaseBaseChecksums: base });
  check("MIGRATION_NEW_DETECTED", g1.newMigrations.includes(newest) && !g1.historicalMutation);

  // Simulate historical mutation → fail closed.
  const mutated = { ...target, [names[0]]: "deadbeef".repeat(8) };
  const g2 = evaluateMigrationGate({ migrationsDir: MIGRATIONS_DIR, releaseBaseChecksums: mutated });
  check("HISTORICAL_MIGRATION_MUTATION_BLOCKED", g2.historicalMutation && g2.deployBlocked);

  // No new migrations → NO_MIGRATION, no pre-migration backup required.
  const g3 = evaluateMigrationGate({ migrationsDir: MIGRATIONS_DIR, releaseBaseChecksums: target });
  check("MIGRATION_NO_MIGRATION", g3.migrationClassification === "NO_MIGRATION" && g3.preMigrationBackupRequired === false);

  const work = mkdtempSync(join(tmpdir(), "hermes-p98-migroll-"));
  const keyFile = join(work, "key.hex");

  await withDisposablePg("migroll", async (ctx) => {
    const DB = "hermes_p98_migroll";
    const RESTORE = "hermes_p98_migroll_restore";
    ctx.psql(`DROP DATABASE IF EXISTS ${DB}`);
    ctx.psql(`CREATE DATABASE ${DB}`);
    execSync("npx --no-install prisma migrate deploy", { cwd: REPO, stdio: "inherit", env: { ...process.env, DATABASE_URL: ctx.urlForDb(DB) } });

    // Baseline seed + pre-migration integrity.
    ctx.psql(`INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt") VALUES ('mr_a','case.updated','case','{}'::jsonb, now())`, DB);
    const before = migrationDigest(ctx, DB);

    // Pre-migration ENCRYPTED backup.
    hbk(["genkey", "--out", keyFile]);
    const dump = ctx.dumpTo(DB, null);
    const plain = join(work, "pre.plain");
    writeFileSync(plain, dump, { mode: 0o600 });
    const art = join(work, "pre.hbk");
    hbk(["encrypt", "--in", plain, "--out", art, "--key-file", keyFile, "--key-id", "migroll", "--type", "postgres", "--created", "2026-08-07T00:00:00.000Z"]);
    rmSync(plain, { force: true });
    check("MIGRATION_PRE_BACKUP", !hbkFails(["verify", "--in", art, "--key-file", keyFile, "--type", "postgres"]));

    // Apply an ADDITIVE forward migration (nullable column — backward compatible).
    ctx.psql(`ALTER TABLE "AuditLog" ADD COLUMN "p98_rollback_probe" text`, DB);
    // New-app validation: column exists.
    const hasCol = ctx.psql(`SELECT count(*)::int FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='p98_rollback_probe'`, DB).trim();
    check("MIGRATION_NEW_SCHEMA_APPLIED", hasCol === "1");
    // Previous-app compatibility: an old-style insert that ignores the new column still works.
    let oldInsertOk = true;
    try {
      ctx.psql(`INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt") VALUES ('mr_b','login.failure','user','{}'::jsonb, now())`, DB);
    } catch {
      oldInsertOk = false;
    }
    check("MIGRATION_ADDITIVE_APP_COMPAT", oldInsertOk);
    check("MIGRATION_ROLLBACK_CLASSIFICATION", classifyRollback({ migrationClassification: "ADDITIVE_COMPATIBLE", appRollbackProven: oldInsertOk }) === "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA");

    // Rollback-via-restore: restore the pre-migration encrypted backup into a fresh DB.
    ctx.psql(`DROP DATABASE IF EXISTS ${RESTORE}`);
    ctx.psql(`CREATE DATABASE ${RESTORE}`);
    const dec = join(work, "pre.dec");
    hbk(["decrypt", "--in", art, "--out", dec, "--key-file", keyFile, "--type", "postgres"]);
    ctx.restoreFrom(RESTORE, readFileSync(dec));
    rmSync(dec, { force: true });
    const restored = migrationDigest(ctx, RESTORE);
    check("MIGRATION_RESTORE_ROLLBACK_INTEGRITY", restored === before);
    // The restored DB must NOT have the post-migration probe column.
    const restoreHasCol = ctx.psql(`SELECT count(*)::int FROM information_schema.columns WHERE table_name='AuditLog' AND column_name='p98_rollback_probe'`, RESTORE).trim();
    check("MIGRATION_RESTORE_IS_PRE_MIGRATION", restoreHasCol === "0");

    for (const d of [DB, RESTORE]) ctx.psql(`DROP DATABASE IF EXISTS ${d}`);
  });

  rmSync(work, { recursive: true, force: true });
  check("MIGRATION_ROLLBACK_GATE", !failed);
  console.log(`RESULT phase98_migration_rollback=${failed ? "FAIL" : "PASS"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`RESULT phase98_migration_rollback=FAIL (${err?.name}: ${String(err?.message ?? err).slice(0, 200)})`);
  process.exit(1);
});

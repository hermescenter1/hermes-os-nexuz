/**
 * PHASE 102 — prove the media migration is APPLIED, from PostgreSQL truth.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * The rehearsal used to prove this with
 *
 *     prisma migrate status | grep -q 20260821000000_phase102_media_video_hub
 *
 * which can never pass. `prisma migrate status` prints migration NAMES only in
 * its pending branch ("the following migrations have not yet been applied"); a
 * database that is up to date prints "Database schema is up to date!" and no
 * names at all. So the grep succeeded only when the migration had NOT been
 * applied — an assertion that is not merely weak, it is inverted. It was caught
 * the first time the workflow ever ran.
 *
 * Human-readable CLI output is not an interface. The authoritative record of
 * what a database has applied is Prisma's own `_prisma_migrations` table, so
 * that is what this script reads.
 *
 * WHAT IT PROVES
 * --------------
 *   - EXACTLY ONE row exists for the Phase 102 migration (a duplicate means the
 *     history is corrupt, not that the migration is "extra applied");
 *   - that row is FINISHED (`finished_at IS NOT NULL`);
 *   - that row is NOT rolled back (`rolled_back_at IS NULL`);
 *   - NO migration anywhere in the table is unfinished or rolled back;
 *   - every migration name in the table is unique;
 *   - the number of completed migrations equals the Phase 102 target count.
 *
 * It deliberately does NOT re-prove ORDERING or set membership: those are the
 * job of `npm run gate:phase102:migrations`, which derives them from git and the
 * immutable ledgers. Two gates, two sources of truth, no overlap to drift.
 *
 * SAFETY
 * ------
 * Read-only: one `SELECT`. It refuses to run against anything that is not a
 * DISPOSABLE rehearsal database (see {@link assertDisposableDatabase}) — this
 * script must never be pointed at Production, and "it was configured correctly"
 * is not a control. The connection string is never printed, logged or included
 * in an error: only the host and database NAME appear, never the credentials.
 *
 * Usage:
 *   node scripts/ci/phase102-applied-migration-check.mjs      # reads DATABASE_URL
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

import {
  EXPECTED_NEW_MIGRATIONS,
  EXPECTED_TARGET_COUNT,
} from "./phase102-migration-integrity.mjs";

/** The migration this release adds, taken from the canonical Phase 102 contract. */
export const PHASE102_MIGRATION = EXPECTED_NEW_MIGRATIONS[0];

/**
 * EVERY migration this release adds. Phase 102 shipped one; release blocker 6
 * appends the composite tenant foreign keys, so the gate must prove both landed
 * rather than only the first. Checking `[0]` while the contract listed two would
 * have let the second fail silently and still report PASS.
 */
export const PHASE102_MIGRATIONS = EXPECTED_NEW_MIGRATIONS;
/** Completed migrations the Phase 102 ERA must report (69 historical + 2). */
export const EXPECTED_COMPLETED_MIGRATIONS = EXPECTED_TARGET_COUNT;

/**
 * Migrations that legitimately land AFTER the Phase 102 target set.
 *
 * The completed-count check below is an equality, deliberately: a database that
 * is missing a migration, or carrying one nobody declared, must fail closed.
 * But an equality against a pinned total also encodes an assumption this
 * repository cannot keep — that nothing will ever ship after Phase 102. The
 * first later phase to reach a real database turns a correct rehearsal red for
 * a reason that has nothing to do with the media hub, and it can only ever be
 * observed against PostgreSQL, so no offline gate catches it first.
 *
 * Naming the later migrations here keeps the equality intact instead of
 * relaxing it to `>=`: a declared migration is subtracted from the total, an
 * UNDECLARED one still fails exactly as before. Every entry must exist under
 * `prisma/migrations/` and sort after the last Phase 102 migration; the
 * regression suite proves both, so this list cannot become a rubber stamp.
 */
export const POST_PHASE102_MIGRATIONS = ["20260823000000_phase106_journal_multilingual_editions"];

/**
 * Hosts a rehearsal database may live on. A rehearsal runs either against the
 * job's own `services:` container or a local disposable one; both are loopback.
 * Anything routable is refused outright.
 */
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Database names that are unambiguously throwaway:
 *   - `hermes_ci`, `hermes_phase102_ci`  — CI service databases
 *   - `hermes_p997_upgrade`, `hermes_p998_…` — disposable rehearsal databases
 *
 * The production database (`hermes_db`) matches neither, so a mis-set
 * `DATABASE_URL` fails closed instead of connecting.
 */
const DISPOSABLE_DB_PATTERNS = [/^hermes_(?:[a-z0-9_]*_)?ci$/, /^hermes_p\d+[a-z0-9_]*$/];

/**
 * Decide whether a connection string names a disposable rehearsal database.
 *
 * Pure, and it NEVER returns the input: the reason carries the host and the
 * database name only, so no caller can accidentally log a password.
 *
 * @param {string|undefined|null} raw
 * @returns {{ ok: boolean, host: string|null, database: string|null, reason: string }}
 */
export function assertDisposableDatabase(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, host: null, database: null, reason: "DATABASE_URL is not set" };
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    // The malformed value itself is not echoed — it may carry a credential.
    return { ok: false, host: null, database: null, reason: "DATABASE_URL is not a parseable URL" };
  }
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) {
    return { ok: false, host: null, database: null, reason: `unsupported protocol "${url.protocol}"` };
  }
  // libpq-style connection parameters can name a DIFFERENT server than the
  // authority does (`?host=`/`hostaddr=` win over the URL's own host in several
  // drivers). A URL that carries one is refused outright rather than validated
  // against a hostname it would not actually connect to.
  for (const key of ["host", "hostaddr"]) {
    if (url.searchParams.has(key)) {
      return { ok: false, host: null, database: null, reason: `DATABASE_URL overrides the server with a "${key}" parameter` };
    }
  }
  const host = url.hostname;
  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    // Malformed percent-encoding. Returning a refusal keeps this function total
    // — a pure guard that throws cannot be relied on to fail CLOSED by callers
    // that only check `.ok`.
    return { ok: false, host, database: null, reason: "DATABASE_URL has a malformed database path" };
  }
  // Host names are case-insensitive (RFC 4343) and `new URL` does not normalise
  // them for a non-special scheme like `postgresql:`. Lowercasing widens nothing
  // — `LOCALHOST` is the same machine as `localhost` — it only stops a casing
  // difference from reading as a different, refused host.
  if (!DISPOSABLE_HOSTS.has(host.toLowerCase())) {
    return { ok: false, host, database, reason: `host "${host}" is not a loopback rehearsal host` };
  }
  if (!DISPOSABLE_DB_PATTERNS.some((re) => re.test(database))) {
    return { ok: false, host, database, reason: `database "${database}" is not a disposable rehearsal database` };
  }
  return { ok: true, host, database, reason: "disposable rehearsal database" };
}

/**
 * @typedef {Object} MigrationRow
 * @property {string} migration_name
 * @property {Date|string|null} finished_at
 * @property {Date|string|null} rolled_back_at
 */

/**
 * Evaluate `_prisma_migrations` rows against the Phase 102 applied contract.
 *
 * Pure over its input so every failure mode — absent, unfinished, rolled back,
 * duplicated, miscounted — is drivable in a test without a database.
 *
 * @param {Object} params
 * @param {MigrationRow[]} params.rows every row of `_prisma_migrations`
 * @param {string} [params.expectedMigration]
 * @param {number} [params.expectedTotal]
 * @param {string[]} [params.allowedLaterMigrations] declared post-Phase-102 migrations
 * @returns {{ ok: boolean, completedCount: number, eraCompletedCount: number, checks: {label: string, ok: boolean, detail: string}[] }}
 */
export function evaluateAppliedMigrations({
  rows,
  expectedMigrations = PHASE102_MIGRATIONS,
  expectedTotal = EXPECTED_COMPLETED_MIGRATIONS,
  allowedLaterMigrations = POST_PHASE102_MIGRATIONS,
}) {
  /** @type {{label: string, ok: boolean, detail: string}[]} */
  const checks = [];
  const add = (label, ok, detail = "") => checks.push({ label, ok, detail });

  const all = Array.isArray(rows) ? rows : [];
  const isFinished = (r) => r.finished_at !== null && r.finished_at !== undefined;
  const isRolledBack = (r) => r.rolled_back_at !== null && r.rolled_back_at !== undefined;
  const isCompleted = (r) => isFinished(r) && !isRolledBack(r);

  // Aggregated across EVERY expected migration. The labels are unchanged so the
  // CI contract and its regression suite still read the same, but the detail
  // names exactly which migration failed — a per-migration label set would grow
  // with the contract and make a missing check invisible.
  const notUnique = [];
  const unfinished = [];
  const rolledBack = [];

  for (const name of expectedMigrations) {
    const matching = all.filter((r) => r.migration_name === name);
    if (matching.length !== 1) {
      notUnique.push(`${name} (${matching.length} rows)`);
      // A row that is absent or duplicated cannot be inspected further, and
      // reporting it as "finished" would be worse than reporting it twice.
      unfinished.push(`${name} (no unique row)`);
      rolledBack.push(`${name} (no unique row)`);
      continue;
    }
    const row = matching[0];
    if (!isFinished(row)) unfinished.push(`${name} (finished_at is NULL)`);
    if (isRolledBack(row)) rolledBack.push(`${name} (rolled_back_at is set)`);
  }

  add(
    "PHASE102_MIGRATION_ROW_UNIQUE",
    notUnique.length === 0,
    `expected exactly one _prisma_migrations row each for ${expectedMigrations.length} migration(s); wrong: ${notUnique.join(", ")}`,
  );
  add("PHASE102_MIGRATION_FINISHED", unfinished.length === 0, unfinished.join(", "));
  add("PHASE102_MIGRATION_NOT_ROLLED_BACK", rolledBack.length === 0, rolledBack.join(", "));

  const broken = all.filter((r) => !isCompleted(r)).map((r) => r.migration_name);
  add(
    "PHASE102_NO_FAILED_MIGRATION",
    broken.length === 0,
    `${broken.length} migration(s) unfinished or rolled back: ${broken.slice(0, 8).join(", ")}`,
  );

  const names = all.map((r) => r.migration_name);
  const duplicated = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  add(
    "PHASE102_MIGRATION_NAMES_UNIQUE",
    duplicated.length === 0,
    `duplicate migration name(s): ${duplicated.slice(0, 8).join(", ")}`,
  );

  // The Phase 102 ERA count, not the raw total: declared later-phase migrations
  // are subtracted, so the equality still asserts "exactly the Phase 102 target
  // set is applied, nothing missing, nothing undeclared". A row nobody declared
  // is not subtracted and therefore still fails — which is the reason this stays
  // an equality rather than becoming `>=`.
  const completedRows = all.filter(isCompleted);
  const completedCount = completedRows.length;
  const declaredLater = new Set(Array.isArray(allowedLaterMigrations) ? allowedLaterMigrations : []);
  const laterCompleted = completedRows.filter((r) => declaredLater.has(r.migration_name));
  const eraCompletedCount = completedCount - laterCompleted.length;
  add(
    "PHASE102_COMPLETED_MIGRATION_COUNT",
    eraCompletedCount === expectedTotal,
    `expected ${expectedTotal} completed Phase 102-era migrations, database reports ${eraCompletedCount}` +
      ` (${completedCount} completed in total, ${laterCompleted.length} declared later-phase)`,
  );

  return { ok: checks.every((c) => c.ok), completedCount, eraCompletedCount, checks };
}

/** Every row of the applied-migration ledger. Read-only, no interpolation. */
const APPLIED_MIGRATIONS_SQL =
  'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"';

async function main() {
  let failed = false;
  const emit = (label, ok, detail) => {
    console.log(`RESULT ${label}=${ok ? "PASS" : "FAIL"}`);
    if (!ok && detail) console.log(`  - ${String(detail).slice(0, 300)}`);
    if (!ok) failed = true;
  };

  const target = assertDisposableDatabase(process.env.DATABASE_URL);
  emit("PHASE102_DISPOSABLE_DATABASE", target.ok, target.reason);
  if (!target.ok) return finish(true);
  console.log(`[phase102-applied] host=${target.host} database=${target.database}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  /** @type {MigrationRow[]} */
  let rows = [];
  try {
    await client.connect();
    const result = await client.query(APPLIED_MIGRATIONS_SQL);
    rows = result.rows;
  } catch (err) {
    // A driver message can carry the connection string; only the class of
    // failure is reported.
    emit("PHASE102_MIGRATION_TABLE_READABLE", false, `cannot read _prisma_migrations: ${String(err?.code ?? err?.name ?? "query failed")}`);
    await client.end().catch(() => {});
    return finish(true);
  }
  await client.end().catch(() => {});
  emit("PHASE102_MIGRATION_TABLE_READABLE", true);

  const verdict = evaluateAppliedMigrations({ rows });
  for (const c of verdict.checks) emit(c.label, c.ok, c.detail);
  console.log(`RESULT PHASE102_COMPLETED_MIGRATIONS=${verdict.completedCount}`);
  console.log(`RESULT PHASE102_MIGRATION_VERIFIED=${PHASE102_MIGRATIONS.join(",")}`);

  return finish(failed);

  function finish(bad) {
    console.log(`RESULT phase102_applied_migration_check=${bad ? "FAIL" : "PASS"}`);
    console.log("RESULT phase102_applied_migration_check_production_contacted=False");
    process.exit(bad ? 1 : 0);
  }
}

// Importing must not open a connection or exit the runner: the regression suite
// drives the pure evaluators directly.
const invokedDirectly =
  typeof process.argv[1] === "string" && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`RESULT phase102_applied_migration_check=FAIL (${String(err?.code ?? err?.name ?? "unexpected error")})`);
    process.exit(1);
  });
}

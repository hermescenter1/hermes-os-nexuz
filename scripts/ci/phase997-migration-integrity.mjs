/**
 * PHASE 99.7 — machine-verifiable migration integrity gate.
 *
 * The deployed Production database was migrated at the Phase 94 baseline commit
 * (911a2d7d…, 49 migrations). The release candidate this phase prepares is the
 * reconciled Phase 99.6 main (cbfa2923…, 69 migrations). Everything an operator
 * is asked to believe about that gap must be PROVEN from the repository, not
 * asserted in a runbook:
 *
 *   - the migration count really goes 49 → 69;
 *   - exactly 20 migration directories are ADDED;
 *   - not one historical migration is modified, deleted or renamed;
 *   - every migration's identity (SHA-256 of its `migration.sql`) is recorded,
 *     so a later mutation is detectable rather than arguable;
 *   - the apply order is deterministic — Prisma applies migrations in
 *     lexicographic directory order, so the names must be unique, correctly
 *     shaped and strictly increasing.
 *
 * Any historical mutation fails closed. So does an unreachable baseline commit:
 * an integrity gate that cannot read its baseline has proven nothing, and
 * "could not check" must never render as "passed".
 *
 * HISTORICAL CONTRACT — Phase 99.7 is completed evidence of the 911a2d7 -> cbfa292
 * production transition. The 49/69/20 figures and both SHAs are immutable; they
 * must NEVER be rewritten to describe a later release. Therefore the 69-set and
 * every checksum in the ledger are read from the PINNED TARGET_SHA via git, not
 * from the working tree, so a later phase that appends migration #70 does not
 * (and must not) change this gate's verdict. The working tree is checked only
 * for PRESERVATION: all 69 historical migrations must still exist byte-identical
 * (modulo line endings), and anything beyond them must be a strictly append-only
 * suffix. A later release ships its own contract (see
 * scripts/ci/phase102-migration-integrity.mjs) instead of mutating this one.
 *
 * Read-only: `git show` + the working tree. No database, no network, no
 * Production contact.
 *
 * Usage:
 *   node scripts/ci/phase997-migration-integrity.mjs            # verify + compare ledger
 *   node scripts/ci/phase997-migration-integrity.mjs --write    # regenerate the ledger from TARGET_SHA (refuses while any check fails)
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateMigrationGate } from "../dr/migration-gate.mjs";
import { canonicalSha256 } from "../dr/canonical-json.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(REPO, "prisma", "migrations");
const LEDGER = join(REPO, "docs", "release", "phase99.7-migration-ledger.json");

/** The deployed Production baseline (Phase 94 migration state). */
export const BASELINE_SHA = "911a2d7d2c92e275deb39ad24f298f9b4ffaa60f";
/** The reconciled Phase 99.6 release target. */
export const TARGET_SHA = "cbfa2923318827ee42614c07f2e3861a3db8ed99";
export const EXPECTED_BASELINE_COUNT = 49;
export const EXPECTED_TARGET_COUNT = 69;
export const EXPECTED_DELTA = 20;

/** Prisma migration directory naming: a 14-digit timestamp then a snake_case label. */
const MIGRATION_NAME_RE = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/;

const WRITE = process.argv.includes("--write");

let failed = false;
const check = (label, cond, detail) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond && detail) console.log(`  - ${detail}`);
  if (!cond) failed = true;
};

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Identity digest of one migration's SQL, computed over LINE-ENDING-NORMALISED
 * bytes.
 *
 * This normalisation is load-bearing, not cosmetic. `git show <sha>:<path>`
 * emits the stored blob (LF), while a Windows checkout with `core.autocrlf=true`
 * materialises the same blob as CRLF in the working tree. Hashing the two forms
 * directly reports every historical migration as "mutated" — a false positive
 * that would make this gate cry wolf on any Windows checkout while the actual
 * git history is provably append-only. Normalising both sides makes the identity
 * a property of the migration's CONTENT, which is what "was this migration
 * changed?" actually means, and matches the LF form the Linux production host
 * and CI runners apply.
 *
 * @param {string} sql
 * @returns {string} lowercase hex sha256
 */
export function migrationIdentity(sql) {
  return createHash("sha256").update(sql.split("\r\n").join("\n"), "utf8").digest("hex");
}

/**
 * Read the migration checksum map of an arbitrary commit straight out of git,
 * so the baseline never depends on a checkout of that commit.
 *
 * @param {string} sha
 * @returns {Record<string,string>} migration directory name -> content identity
 */
export function checksumsAtCommit(sha) {
  // `-r` recurses into trees; the migration.sql blobs are one level down.
  const listing = git(["ls-tree", "-r", "--name-only", sha, "prisma/migrations/"]);
  /** @type {Record<string,string>} */
  const out = {};
  for (const line of listing.split("\n")) {
    const path = line.trim();
    const m = /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(path);
    if (!m) continue;
    out[m[1]] = migrationIdentity(git(["show", `${sha}:${path}`]));
  }
  return out;
}

/**
 * Read the migration checksum map of the working tree, using the same
 * normalised identity as `checksumsAtCommit` so the two are comparable.
 *
 * @param {string} migrationsDir
 * @returns {Record<string,string>}
 */
export function checksumsInWorkingTree(migrationsDir) {
  /** @type {Record<string,string>} */
  const out = {};
  let entries;
  try {
    entries = readdirSync(migrationsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const sqlPath = join(migrationsDir, entry, "migration.sql");
    try {
      if (!statSync(sqlPath).isFile()) continue;
    } catch {
      continue; // a directory without migration.sql is not a migration
    }
    out[entry] = migrationIdentity(readFileSync(sqlPath, "utf8"));
  }
  return out;
}

/**
 * Prove that a migration name set applies in a deterministic, unambiguous order.
 *
 * @param {string[]} names
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyDeterministicOrdering(names) {
  const problems = [];
  const sorted = [...names].sort();

  const seen = new Set();
  for (const n of sorted) {
    if (seen.has(n)) problems.push(`duplicate migration name: ${n}`);
    seen.add(n);
    if (!MIGRATION_NAME_RE.test(n)) problems.push(`migration name is not deterministically shaped: ${n}`);
  }
  for (let i = 1; i < sorted.length; i += 1) {
    // Strictly increasing under the same ordering Prisma uses.
    if (!(sorted[i - 1] < sorted[i])) problems.push(`non-increasing order at ${sorted[i - 1]} -> ${sorted[i]}`);
  }
  // The timestamp prefixes must also be non-decreasing, so lexicographic order
  // and chronological intent agree.
  const stamps = sorted.map((n) => n.slice(0, 14));
  for (let i = 1; i < stamps.length; i += 1) {
    if (stamps[i - 1] > stamps[i]) problems.push(`timestamp order disagrees with lexicographic order at ${sorted[i]}`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Prove that a pinned historical migration set is PRESERVED by the current
 * working tree: every historical migration still exists with an identical
 * normalised checksum (no mutation, no deletion, no rename), and any additional
 * migration is a strictly append-only suffix — it must sort AFTER the last
 * historical migration, because `prisma migrate deploy` cannot insert a
 * migration before one the deployed database has already applied.
 *
 * Pure over its inputs so mutation/regression tests can drive every failure
 * mode with synthetic maps.
 *
 * @param {Record<string,string>} historicalChecksums pinned set (from a commit)
 * @param {Record<string,string>} currentChecksums working-tree set
 */
export function verifyHistoricalPreservation(historicalChecksums, currentChecksums) {
  const historicalNames = Object.keys(historicalChecksums).sort();
  const currentNames = Object.keys(currentChecksums).sort();
  const missing = historicalNames.filter((n) => !(n in currentChecksums));
  const mutated = historicalNames.filter(
    (n) => n in currentChecksums && currentChecksums[n] !== historicalChecksums[n],
  );
  const lastHistorical = historicalNames[historicalNames.length - 1] ?? "";
  const futureMigrations = currentNames.filter((n) => !(n in historicalChecksums));
  const interleaved = futureMigrations.filter((n) => n <= lastHistorical);
  return {
    ok: missing.length === 0 && mutated.length === 0 && interleaved.length === 0,
    missing,
    mutated,
    futureMigrations,
    interleaved,
    lastHistorical,
  };
}

function main() {
  // ── Baseline (fail closed if unreachable) ─────────────────────────────────
  /** @type {Record<string,string>} */
  let baseline;
  try {
    baseline = checksumsAtCommit(BASELINE_SHA);
  } catch (err) {
    check("MIGRATION_BASELINE_REACHABLE", false, `cannot read ${BASELINE_SHA.slice(0, 12)} — fetch full history (fetch-depth: 0): ${String(err?.message ?? err).slice(0, 160)}`);
    finish();
    return;
  }
  check("MIGRATION_BASELINE_REACHABLE", true);

  // ── Pinned historical target (fail closed if unreachable) ─────────────────
  // The 69-set is a property of TARGET_SHA, not of whatever the working tree
  // currently holds — later phases may legitimately append migration #70+.
  /** @type {Record<string,string>} */
  let target;
  try {
    target = checksumsAtCommit(TARGET_SHA);
  } catch (err) {
    check("MIGRATION_TARGET_REACHABLE", false, `cannot read ${TARGET_SHA.slice(0, 12)} — fetch full history (fetch-depth: 0): ${String(err?.message ?? err).slice(0, 160)}`);
    finish();
    return;
  }
  check("MIGRATION_TARGET_REACHABLE", true);

  const baselineNames = Object.keys(baseline).sort();
  const targetNames = Object.keys(target).sort();

  check(
    "MIGRATION_BASELINE_COUNT",
    baselineNames.length === EXPECTED_BASELINE_COUNT,
    `expected ${EXPECTED_BASELINE_COUNT}, found ${baselineNames.length}`,
  );
  check(
    "MIGRATION_TARGET_COUNT",
    targetNames.length === EXPECTED_TARGET_COUNT,
    `expected ${EXPECTED_TARGET_COUNT} at ${TARGET_SHA.slice(0, 12)}, found ${targetNames.length}`,
  );

  // ── The gate itself (baseline commit -> pinned target commit) ─────────────
  const gate = evaluateMigrationGate({
    migrationsDir: MIGRATIONS_DIR,
    releaseBaseChecksums: baseline,
    // Both sides come from git through the same normalised identity function
    // (see `migrationIdentity`); nothing here depends on the working tree.
    targetChecksums: target,
    readMigrationSql: (name) => git(["show", `${TARGET_SHA}:prisma/migrations/${name}/migration.sql`]),
  });

  check(
    "MIGRATION_DELTA_EXACTLY_20",
    gate.newMigrations.length === EXPECTED_DELTA,
    `expected ${EXPECTED_DELTA} new migrations, found ${gate.newMigrations.length}`,
  );
  check(
    "HISTORICAL_MIGRATION_MUTATION_ZERO",
    gate.historicalMutation === false && gate.mutatedMigrations.length === 0 && gate.missingMigrations.length === 0,
    `mutated=[${gate.mutatedMigrations.join(", ")}] missing=[${gate.missingMigrations.join(", ")}]`,
  );
  // A rename shows up as one missing + one new; assert it separately so the
  // failure message names the real problem instead of a count mismatch.
  check(
    "HISTORICAL_MIGRATION_RENAME_ZERO",
    baselineNames.every((n) => targetNames.includes(n)),
    `baseline names absent from target: ${baselineNames.filter((n) => !targetNames.includes(n)).join(", ")}`,
  );
  check("MIGRATION_DEPLOY_NOT_BLOCKED", gate.deployBlocked === false, gate.reasons.join(" | "));
  check(
    "MIGRATION_PRE_BACKUP_REQUIRED",
    gate.preMigrationBackupRequired === true,
    "a 20-migration release must require a pre-migration backup",
  );

  const ordering = verifyDeterministicOrdering(targetNames);
  check("MIGRATION_ORDERING_DETERMINISTIC", ordering.ok, ordering.problems.join(" | "));

  // The new migrations must all sort AFTER every baseline migration, otherwise
  // `prisma migrate deploy` would want to insert a migration before one that is
  // already applied on the deployed database.
  const lastBaseline = baselineNames[baselineNames.length - 1];
  const interleaved = gate.newMigrations.filter((n) => n < lastBaseline);
  check(
    "NEW_MIGRATIONS_APPEND_ONLY",
    interleaved.length === 0,
    `new migrations sorting before the last applied baseline migration (${lastBaseline}): ${interleaved.join(", ")}`,
  );

  // ── Working-tree preservation of the historical 69-set ────────────────────
  // Later releases may append migrations, but they may never touch history:
  // every one of the 69 must still exist with an identical checksum, and any
  // extra migration must sort strictly after the last historical one.
  const current = checksumsInWorkingTree(MIGRATIONS_DIR);
  const preservation = verifyHistoricalPreservation(target, current);
  check(
    "HISTORICAL_SET_PRESENT_IN_TREE",
    preservation.missing.length === 0,
    `historical migrations deleted or renamed in the working tree: ${preservation.missing.join(", ")}`,
  );
  check(
    "HISTORICAL_SET_UNMUTATED_IN_TREE",
    preservation.mutated.length === 0,
    `historical migrations mutated in the working tree: ${preservation.mutated.join(", ")}`,
  );
  check(
    "FUTURE_MIGRATIONS_APPEND_ONLY",
    preservation.interleaved.length === 0,
    `migrations sorting before or among the historical set (last historical: ${preservation.lastHistorical}): ${preservation.interleaved.join(", ")}`,
  );
  const currentOrdering = verifyDeterministicOrdering(Object.keys(current).sort());
  check("WORKING_TREE_ORDERING_DETERMINISTIC", currentOrdering.ok, currentOrdering.problems.join(" | "));

  // ── Durable identity ledger ────────────────────────────────────────────────
  // Derived EXCLUSIVELY from the pinned commits above — `--write` regenerates
  // the same 69-entry ledger no matter how many migrations the working tree has
  // accumulated since, so it can never absorb a later release's migrations.
  const ledger = {
    phase: "99.7",
    baselineSha: BASELINE_SHA,
    targetSha: TARGET_SHA,
    baselineMigrationCount: baselineNames.length,
    targetMigrationCount: targetNames.length,
    newMigrationCount: gate.newMigrations.length,
    historicalMutationCount: gate.mutatedMigrations.length + gate.missingMigrations.length,
    migrationClassification: gate.migrationClassification,
    preMigrationBackupRequired: gate.preMigrationBackupRequired,
    newMigrations: gate.newMigrations,
    // Full identity of the applied set, so any later mutation is detectable.
    migrationChecksums: Object.fromEntries(targetNames.map((n) => [n, target[n]])),
  };
  const ledgerWithHash = { ...ledger, ledgerSha256: canonicalSha256(ledger) };
  const serialized = `${JSON.stringify(ledgerWithHash, null, 2)}\n`;

  if (WRITE) {
    if (failed) {
      // A ledger written while any invariant fails would launder the failure
      // into "recorded evidence" — refuse.
      check("MIGRATION_LEDGER_WRITE_ALLOWED", false, "refusing --write while integrity checks fail");
    } else {
      writeFileSync(LEDGER, serialized, "utf8");
      console.log(`RESULT MIGRATION_LEDGER=WRITTEN (${LEDGER})`);
    }
  } else {
    let onDisk = null;
    try {
      onDisk = readFileSync(LEDGER, "utf8");
    } catch {
      /* handled below */
    }
    // Compare parsed content, not bytes, so a CRLF checkout is not a failure.
    let matches = false;
    try {
      matches = onDisk !== null && canonicalSha256(JSON.parse(onDisk)) === canonicalSha256(ledgerWithHash);
    } catch {
      matches = false;
    }
    check(
      "MIGRATION_LEDGER_CURRENT",
      matches,
      onDisk === null ? "ledger missing — run with --write" : "ledger is stale — run with --write",
    );
  }

  finish();
}

function finish() {
  console.log(`RESULT phase997_migration_integrity=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase997_migration_integrity_production_contacted=False");
  process.exit(failed ? 1 : 0);
}

// Only run the gate when this file is the process entry point. Other Phase 99.7
// scripts import BASELINE_SHA / the expected counts from here so the baseline is
// declared exactly once; importing must not run (or exit) the gate.
const invokedDirectly =
  typeof process.argv[1] === "string" && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main();

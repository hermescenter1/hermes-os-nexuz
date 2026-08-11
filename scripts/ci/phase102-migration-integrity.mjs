/**
 * PHASE 102 — machine-verifiable migration integrity gate.
 *
 * The production/deployed baseline for this release is the Phase 99.7 target:
 * the reconciled Phase 99.6 main (cbfa2923…, 69 migrations). Phase 102 ships
 * EXACTLY ONE new migration — the Media & Video Hub schema — so the contract
 * this gate proves from the repository is:
 *
 *   - the migration count goes 69 -> 70;
 *   - the single ADDED migration is exactly
 *     `20260821000000_phase102_media_video_hub`;
 *   - not one of the 69 historical migrations is modified, deleted or renamed;
 *   - the new migration sorts strictly AFTER every historical migration
 *     (append-only — Prisma applies migrations in lexicographic order and the
 *     deployed database has already applied the historical set);
 *   - the new migration classifies as FORWARD_ONLY_REQUIRES_BACKUP, so the
 *     deploy pipeline's mandatory pre-migration backup is engaged;
 *   - provenance is bound to the STABLE commit that originally introduced the
 *     migration (derived from git history, never pinned to a transient merge
 *     HEAD) plus a deterministic digest of the full 70-migration identity set.
 *
 * This is a SEPARATE contract from Phase 99.7. The Phase 99.7 ledger
 * (docs/release/phase99.7-migration-ledger.json) is immutable historical
 * evidence of the 911a2d7 -> cbfa292 transition and must never absorb Phase 102
 * figures; this gate writes its own ledger instead.
 *
 * Any historical mutation fails closed. So does an unreachable baseline commit
 * or unresolvable provenance: "could not check" must never render as "passed".
 *
 * Read-only: `git show` / `git log` + the working tree. No database, no
 * network, no Production contact.
 *
 * Usage:
 *   node scripts/ci/phase102-migration-integrity.mjs            # verify + compare ledger
 *   node scripts/ci/phase102-migration-integrity.mjs --write    # regenerate the ledger (refuses while any check fails)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateMigrationGate } from "../dr/migration-gate.mjs";
import { canonicalSha256 } from "../dr/canonical-json.mjs";
import {
  TARGET_SHA as PHASE997_TARGET_SHA,
  checksumsAtCommit,
  checksumsInWorkingTree,
  migrationIdentity,
  verifyDeterministicOrdering,
  verifyHistoricalPreservation,
} from "./phase997-migration-integrity.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(REPO, "prisma", "migrations");
const LEDGER = join(REPO, "docs", "release", "phase102-migration-ledger.json");

/**
 * The production/deployed baseline: the Phase 99.7 cutover target. Pinned as a
 * literal here so this contract stands alone, and asserted equal to the Phase
 * 99.7 constant so the two contracts can never silently diverge.
 */
export const BASELINE_SHA = "cbfa2923318827ee42614c07f2e3861a3db8ed99";
export const EXPECTED_BASELINE_COUNT = 69;
export const EXPECTED_TARGET_COUNT = 71;
export const EXPECTED_DELTA = 2;
export const EXPECTED_NEW_MIGRATIONS = [
  "20260821000000_phase102_media_video_hub",
  // Release blocker 6: composite tenant foreign keys. Additive and append-only —
  // it adds constraints and changes no data, and refuses to run at all while a
  // cross-tenant row exists. Both numbers above are DERIVED from the real
  // migration set, not assumed: the Phase 99.7 target cbfa292 carries 69
  // directories and the working tree carries 71, so the delta is 2.
  "20260822000000_phase102_tenant_composite_foreign_keys",
];
export const EXPECTED_CLASSIFICATION = "FORWARD_ONLY_REQUIRES_BACKUP";

const WRITE = process.argv.includes("--write");

let failed = false;
const check = (label, cond, detail) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond && detail) console.log(`  - ${detail}`);
  if (!cond) failed = true;
};

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * The STABLE commit that originally introduced a migration: the oldest commit
 * in which its `migration.sql` was ADDED. Deliberately not a merge HEAD — merge
 * commits are transient (a rebase or re-merge changes them) while the authoring
 * commit is the provenance a release contract can be bound to.
 *
 * @param {string} name migration directory name
 * @returns {string|null} 40-hex commit sha, or null if history cannot resolve it
 */
export function migrationSourceCommit(name) {
  const out = git(["log", "--diff-filter=A", "--format=%H", "--", `prisma/migrations/${name}/migration.sql`]);
  const shas = out.split("\n").map((s) => s.trim()).filter(Boolean);
  if (shas.length === 0) return null;
  // `git log` lists newest first; the ORIGINAL introduction is the oldest.
  return shas[shas.length - 1];
}

/**
 * Deterministic identity digest of a full migration set: the canonical SHA-256
 * of the sorted { name -> normalised checksum } map. Two trees with the same
 * migrations in the same shape produce the same digest on any OS.
 *
 * @param {Record<string,string>} checksums
 * @returns {string}
 */
export function migrationSetDigest(checksums) {
  const sorted = Object.fromEntries(Object.keys(checksums).sort().map((n) => [n, checksums[n]]));
  return canonicalSha256(sorted);
}

function main() {
  // The two contracts describe one continuous history: Phase 102's baseline IS
  // the Phase 99.7 target. If someone edits either pin the chain is broken.
  check(
    "PHASE102_BASELINE_IS_PHASE997_TARGET",
    BASELINE_SHA === PHASE997_TARGET_SHA,
    `phase102 baseline ${BASELINE_SHA.slice(0, 12)} != phase997 target ${PHASE997_TARGET_SHA.slice(0, 12)}`,
  );

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

  const target = checksumsInWorkingTree(MIGRATIONS_DIR);
  const baselineNames = Object.keys(baseline).sort();
  const targetNames = Object.keys(target).sort();

  check(
    "MIGRATION_BASELINE_COUNT",
    baselineNames.length === EXPECTED_BASELINE_COUNT,
    `expected ${EXPECTED_BASELINE_COUNT} at ${BASELINE_SHA.slice(0, 12)}, found ${baselineNames.length}`,
  );
  check(
    "MIGRATION_TARGET_COUNT",
    targetNames.length === EXPECTED_TARGET_COUNT,
    `expected ${EXPECTED_TARGET_COUNT}, found ${targetNames.length}`,
  );

  // ── The gate itself (deployed baseline -> working tree) ───────────────────
  const gate = evaluateMigrationGate({
    migrationsDir: MIGRATIONS_DIR,
    releaseBaseChecksums: baseline,
    // Pass the normalised target explicitly so both sides of the comparison use
    // the same identity function (see `migrationIdentity` in the Phase 99.7 gate).
    targetChecksums: target,
  });

  check(
    // The name carries the number so a silent widening of the contract is
    // visible in the CI log, not only in this file.
    `MIGRATION_DELTA_EXACTLY_${EXPECTED_DELTA}`,
    gate.newMigrations.length === EXPECTED_DELTA,
    `expected ${EXPECTED_DELTA} new migrations, found ${gate.newMigrations.length}: ${gate.newMigrations.join(", ")}`,
  );
  check(
    "NEW_MIGRATION_SET_EXACT",
    JSON.stringify(gate.newMigrations) === JSON.stringify(EXPECTED_NEW_MIGRATIONS),
    `expected exactly [${EXPECTED_NEW_MIGRATIONS.join(", ")}], found [${gate.newMigrations.join(", ")}]`,
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
    "MIGRATION_CLASSIFICATION_PINNED",
    gate.migrationClassification === EXPECTED_CLASSIFICATION,
    `expected ${EXPECTED_CLASSIFICATION}, classified ${gate.migrationClassification}`,
  );
  check(
    "MIGRATION_PRE_BACKUP_REQUIRED",
    gate.preMigrationBackupRequired === true,
    "a migration-bearing release must require a pre-migration backup",
  );

  const preservation = verifyHistoricalPreservation(baseline, target);
  check(
    "NEW_MIGRATIONS_APPEND_ONLY",
    preservation.interleaved.length === 0,
    `migrations sorting before or among the historical set (last historical: ${preservation.lastHistorical}): ${preservation.interleaved.join(", ")}`,
  );

  const ordering = verifyDeterministicOrdering(targetNames);
  check("MIGRATION_ORDERING_DETERMINISTIC", ordering.ok, ordering.problems.join(" | "));

  // ── Provenance (stable source commit, never a transient merge HEAD) ───────
  /** @type {Record<string,string>} */
  const sourceCommits = {};
  for (const name of EXPECTED_NEW_MIGRATIONS) {
    let source = null;
    let bound = false;
    try {
      source = migrationSourceCommit(name);
      if (source !== null) {
        // The migration at its introducing commit must be byte-identical
        // (modulo line endings) to the migration this release ships.
        const atSource = migrationIdentity(git(["show", `${source}:prisma/migrations/${name}/migration.sql`]));
        bound = atSource === target[name];
      }
    } catch {
      source = null;
    }
    check(
      "MIGRATION_SOURCE_COMMIT_RESOLVED",
      source !== null && /^[0-9a-f]{40}$/.test(source),
      `git history cannot resolve the commit that introduced ${name} — fetch full history (fetch-depth: 0)`,
    );
    check(
      "MIGRATION_SOURCE_CONTENT_BOUND",
      bound === true,
      `the migration shipped by this release does not match ${name} at its introducing commit ${source ? source.slice(0, 12) : "?"}`,
    );
    if (source !== null) {
      sourceCommits[name] = source;
      console.log(`RESULT PHASE102_MIGRATION_SOURCE_SHA=${source}`);
    }
  }

  const setDigest = migrationSetDigest(target);
  console.log(`RESULT PHASE102_MIGRATION_SET_DIGEST=${setDigest}`);

  // ── Durable identity ledger (separate from the Phase 99.7 ledger) ─────────
  const ledger = {
    phase: "102",
    baselineSha: BASELINE_SHA,
    baselineMigrationCount: baselineNames.length,
    targetMigrationCount: targetNames.length,
    newMigrationCount: gate.newMigrations.length,
    historicalMutationCount: gate.mutatedMigrations.length + gate.missingMigrations.length,
    migrationClassification: gate.migrationClassification,
    preMigrationBackupRequired: gate.preMigrationBackupRequired,
    newMigrations: gate.newMigrations,
    // Provenance: the stable authoring commit per new migration, plus a
    // deterministic digest of the full 70-migration identity set.
    sourceCommits,
    migrationSetSha256: setDigest,
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
  console.log(`RESULT phase102_migration_integrity=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase102_migration_integrity_production_contacted=False");
  process.exit(failed ? 1 : 0);
}

// Only run the gate when this file is the process entry point, so tests and
// sibling scripts can import the constants/helpers without running (or exiting)
// the gate.
const invokedDirectly =
  typeof process.argv[1] === "string" && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main();

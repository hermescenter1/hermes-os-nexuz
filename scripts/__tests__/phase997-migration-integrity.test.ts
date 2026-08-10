/**
 * PHASE 99.7 — migration integrity invariants.
 *
 * The deployed database sits at the Phase 94 baseline; the release target is the
 * reconciled Phase 99.6 main. These tests pin the properties an operator is
 * being asked to trust — the delta is exactly 20 additive migrations, nothing
 * historical moved, and the apply order is unambiguous — so a future change that
 * breaks one of them fails here rather than on the production host.
 *
 * The full 49 -> 69 proof (which needs git history) runs in
 * `scripts/ci/phase997-migration-integrity.mjs`; this suite verifies the pure
 * helpers plus the checked-in ledger those helpers produced.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { migrationIdentity, verifyDeterministicOrdering, EXPECTED_TARGET_COUNT, EXPECTED_DELTA, EXPECTED_BASELINE_COUNT, BASELINE_SHA, TARGET_SHA } from "../ci/phase997-migration-integrity.mjs";

const REPO = process.cwd();
const MIGRATIONS_DIR = join(REPO, "prisma", "migrations");
const LEDGER_PATH = join(REPO, "docs", "release", "phase99.7-migration-ledger.json");

const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));

/** Migration directory names present in the working tree. */
const migrationNames = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => {
    try {
      return statSync(join(MIGRATIONS_DIR, name, "migration.sql")).isFile();
    } catch {
      return false;
    }
  })
  .sort();

describe("PHASE997_MIGRATION_IDENTITY", () => {
  it("is line-ending independent, so a CRLF checkout is not a false mutation", () => {
    const lf = "CREATE TABLE a (id text);\nALTER TABLE a ADD b text;\n";
    const crlf = lf.split("\n").join("\r\n");
    expect(migrationIdentity(crlf)).toBe(migrationIdentity(lf));
  });

  it("still distinguishes a genuine content change", () => {
    expect(migrationIdentity("CREATE TABLE a (id text);\n")).not.toBe(migrationIdentity("DROP TABLE a;\n"));
  });
});

describe("PHASE997_MIGRATION_ORDERING", () => {
  it("the shipped migration set applies in a deterministic order", () => {
    const r = verifyDeterministicOrdering(migrationNames);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects a duplicate migration name", () => {
    const r = verifyDeterministicOrdering(["20260101000000_a", "20260101000000_a"]);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("duplicate");
  });

  it("rejects a migration name that is not deterministically shaped", () => {
    for (const bad of ["not_a_timestamp", "2026_phase1", "20260101000000_Phase_Upper", "20260101000000_"]) {
      expect(verifyDeterministicOrdering([bad]).ok).toBe(false);
    }
  });

  it("agrees with chronological intent for same-day migrations", () => {
    // Fixed-width 14-digit stamps make lexicographic and chronological order
    // identical; the checker asserts that agreement rather than assuming it.
    const r = verifyDeterministicOrdering(["20260820000000_phase97_a", "20260820000001_phase97_b", "20260820000010_phase97_c"]);
    expect(r.ok).toBe(true);
  });
});

describe("PHASE997_MIGRATION_LEDGER", () => {
  it("records the exact baseline and target this phase reconciles", () => {
    expect(ledger.baselineSha).toBe(BASELINE_SHA);
    expect(ledger.targetSha).toBe(TARGET_SHA);
    expect(BASELINE_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(TARGET_SHA).toMatch(/^[0-9a-f]{40}$/);
  });

  it("asserts a 49 -> 69 additive delta with zero historical mutation", () => {
    expect(ledger.baselineMigrationCount).toBe(EXPECTED_BASELINE_COUNT);
    expect(ledger.targetMigrationCount).toBe(EXPECTED_TARGET_COUNT);
    expect(ledger.newMigrationCount).toBe(EXPECTED_DELTA);
    expect(ledger.historicalMutationCount).toBe(0);
    expect(ledger.baselineMigrationCount + ledger.newMigrationCount).toBe(ledger.targetMigrationCount);
  });

  it("requires a pre-migration backup for this release", () => {
    // 20 migrations ship; the classification must never be NO_MIGRATION and the
    // backup must be mandatory, because that is what gates the cutover.
    expect(ledger.migrationClassification).not.toBe("NO_MIGRATION");
    expect(ledger.preMigrationBackupRequired).toBe(true);
  });

  it("covers exactly the migration set present in the repository", () => {
    expect(Object.keys(ledger.migrationChecksums).sort()).toEqual(migrationNames);
    expect(migrationNames.length).toBe(EXPECTED_TARGET_COUNT);
  });

  it("every recorded checksum still matches the migration on disk", () => {
    for (const name of migrationNames) {
      const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      expect(ledger.migrationChecksums[name], `checksum drift in ${name}`).toBe(migrationIdentity(sql));
    }
  });

  it("the new migrations all sort after every baseline migration", () => {
    const newest = ledger.newMigrations as string[];
    const baselineNames = migrationNames.filter((n) => !newest.includes(n));
    expect(baselineNames.length).toBe(EXPECTED_BASELINE_COUNT);
    const lastBaseline = baselineNames[baselineNames.length - 1];
    for (const n of newest) expect(n > lastBaseline, `${n} sorts before applied baseline ${lastBaseline}`).toBe(true);
  });
});

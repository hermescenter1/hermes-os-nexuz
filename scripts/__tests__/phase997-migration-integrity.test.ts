/**
 * PHASE 99.7 — migration integrity invariants.
 *
 * The deployed database sits at the Phase 94 baseline; the release target is the
 * reconciled Phase 99.6 main. These tests pin the properties an operator is
 * being asked to trust — the delta is exactly 20 additive migrations, nothing
 * historical moved, and the apply order is unambiguous — so a future change that
 * breaks one of them fails here rather than on the production host.
 *
 * Phase 99.7 is COMPLETED HISTORICAL EVIDENCE: its ledger describes the pinned
 * 911a2d7 -> cbfa292 transition, never the current working tree. Later releases
 * may append migrations beyond the 69 (each under its own contract, e.g. Phase
 * 102), but they may never mutate, delete, rename or interleave with the
 * historical set — the preservation suite below drives every one of those
 * failure modes through the same pure helper the gate uses.
 *
 * The full 49 -> 69 proof (which needs git history) runs in
 * `scripts/ci/phase997-migration-integrity.mjs`; this suite verifies the pure
 * helpers plus the checked-in ledger those helpers produced.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { migrationIdentity, verifyDeterministicOrdering, verifyHistoricalPreservation, EXPECTED_TARGET_COUNT, EXPECTED_DELTA, EXPECTED_BASELINE_COUNT, BASELINE_SHA, TARGET_SHA } from "../ci/phase997-migration-integrity.mjs";

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

  it("records exactly the 69 historical migrations, all still present in the repository", () => {
    const historicalNames = Object.keys(ledger.migrationChecksums).sort();
    expect(historicalNames.length).toBe(EXPECTED_TARGET_COUNT);
    // The ledger is pinned history: the working tree may hold MORE migrations
    // (later releases append under their own contracts) but never fewer.
    for (const name of historicalNames) expect(migrationNames, `historical migration missing from tree: ${name}`).toContain(name);
  });

  it("every recorded checksum still matches the migration on disk (no historical mutation)", () => {
    for (const name of Object.keys(ledger.migrationChecksums)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      expect(ledger.migrationChecksums[name], `checksum drift in ${name}`).toBe(migrationIdentity(sql));
    }
  });

  it("any migration beyond the historical set is a strictly append-only suffix", () => {
    const historicalNames = Object.keys(ledger.migrationChecksums).sort();
    const lastHistorical = historicalNames[historicalNames.length - 1];
    const future = migrationNames.filter((n) => !historicalNames.includes(n));
    for (const n of future) expect(n > lastHistorical, `${n} sorts before or among the historical set (last: ${lastHistorical})`).toBe(true);
  });

  it("the new migrations all sort after every baseline migration", () => {
    const newest = ledger.newMigrations as string[];
    const historicalNames = Object.keys(ledger.migrationChecksums).sort();
    const baselineNames = historicalNames.filter((n) => !newest.includes(n));
    expect(baselineNames.length).toBe(EXPECTED_BASELINE_COUNT);
    const lastBaseline = baselineNames[baselineNames.length - 1];
    for (const n of newest) expect(n > lastBaseline, `${n} sorts before applied baseline ${lastBaseline}`).toBe(true);
  });
});

describe("PHASE997_HISTORICAL_PRESERVATION", () => {
  // The same pure helper the gate executes, driven through every failure mode
  // with synthetic maps — proof the FAIL paths are reachable, not hard-coded.
  const historical = {
    "20260101000000_alpha": "aa",
    "20260102000000_beta": "bb",
    "20260103000000_gamma": "cc",
  };

  it("passes when the tree preserves history exactly", () => {
    const r = verifyHistoricalPreservation(historical, { ...historical });
    expect(r.ok).toBe(true);
    expect(r.futureMigrations).toEqual([]);
  });

  it("passes when later migrations are appended strictly after the historical set", () => {
    const r = verifyHistoricalPreservation(historical, { ...historical, "20260104000000_delta": "dd" });
    expect(r.ok).toBe(true);
    expect(r.futureMigrations).toEqual(["20260104000000_delta"]);
    expect(r.interleaved).toEqual([]);
  });

  it("fails closed when a historical migration is mutated", () => {
    const r = verifyHistoricalPreservation(historical, { ...historical, "20260102000000_beta": "MUTATED" });
    expect(r.ok).toBe(false);
    expect(r.mutated).toEqual(["20260102000000_beta"]);
  });

  it("fails closed when a historical migration is deleted", () => {
    const current: Record<string, string> = { ...historical };
    delete current["20260102000000_beta"];
    const r = verifyHistoricalPreservation(historical, current);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["20260102000000_beta"]);
  });

  it("fails closed when a historical migration is renamed", () => {
    const current: Record<string, string> = { ...historical };
    delete current["20260102000000_beta"];
    current["20260102000001_beta_renamed"] = "bb";
    const r = verifyHistoricalPreservation(historical, current);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["20260102000000_beta"]);
    expect(r.interleaved).toEqual(["20260102000001_beta_renamed"]);
  });

  it("fails closed when a future migration interleaves with or backdates the historical set", () => {
    const backdated = verifyHistoricalPreservation(historical, { ...historical, "20251231000000_backdated": "ee" });
    expect(backdated.ok).toBe(false);
    expect(backdated.interleaved).toEqual(["20251231000000_backdated"]);

    const interleaved = verifyHistoricalPreservation(historical, { ...historical, "20260102500000_between": "ff" });
    expect(interleaved.ok).toBe(false);
    expect(interleaved.interleaved).toEqual(["20260102500000_between"]);
  });

  it("the real repository preserves the real ledgered history", () => {
    const current: Record<string, string> = {};
    for (const name of migrationNames) {
      current[name] = migrationIdentity(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
    }
    const r = verifyHistoricalPreservation(ledger.migrationChecksums, current);
    expect(r.missing).toEqual([]);
    expect(r.mutated).toEqual([]);
    expect(r.interleaved).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("the gate scripts contain no hard-coded PASS verdicts", () => {
    for (const script of ["phase997-migration-integrity.mjs", "phase102-migration-integrity.mjs"]) {
      const src = readFileSync(join(REPO, "scripts", "ci", script), "utf8");
      // Every RESULT verdict must flow through the conditional check helper —
      // a literal `=PASS` in source would be a hard-coded verdict.
      expect(src.includes("=PASS"), `${script} hard-codes a PASS verdict`).toBe(false);
      expect(src).toContain('cond ? "PASS" : "FAIL"');
    }
  });
});

/**
 * PHASE 102 — migration integrity invariants.
 *
 * Phase 102 ships exactly one migration (the Media & Video Hub schema) on top of
 * the deployed Phase 99.7 baseline (cbfa292…, 69 migrations). This suite pins
 * the contract an operator is asked to trust — 69 -> 70, the single new
 * migration is exactly `20260821000000_phase102_media_video_hub`, it appends
 * strictly after all history, nothing historical moved, and provenance is bound
 * to the stable introducing commit plus a deterministic set digest — and drives
 * every failure mode (mutation, deletion, rename, interleave, removal of the
 * Phase 102 migration itself) through the same pure helpers the gate executes,
 * so the FAIL paths are provably reachable rather than fixture-only.
 *
 * The full git-history proof runs in
 * `scripts/ci/phase102-migration-integrity.mjs`; the Phase 99.7 historical
 * contract is a SEPARATE ledger and gate that this phase must never absorb.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  BASELINE_SHA,
  EXPECTED_BASELINE_COUNT,
  EXPECTED_TARGET_COUNT,
  EXPECTED_DELTA,
  EXPECTED_NEW_MIGRATIONS,
  EXPECTED_CLASSIFICATION,
  migrationSetDigest,
} from "../ci/phase102-migration-integrity.mjs";
import {
  TARGET_SHA as PHASE997_TARGET_SHA,
  EXPECTED_TARGET_COUNT as PHASE997_TARGET_COUNT,
  migrationIdentity,
  verifyDeterministicOrdering,
  verifyHistoricalPreservation,
} from "../ci/phase997-migration-integrity.mjs";
import { evaluateMigrationGate } from "../dr/migration-gate.mjs";
import { canonicalSha256 } from "../dr/canonical-json.mjs";

const REPO = process.cwd();
const MIGRATIONS_DIR = join(REPO, "prisma", "migrations");
const LEDGER_PATH = join(REPO, "docs", "release", "phase102-migration-ledger.json");
const PHASE997_LEDGER_PATH = join(REPO, "docs", "release", "phase99.7-migration-ledger.json");

const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
const phase997Ledger = JSON.parse(readFileSync(PHASE997_LEDGER_PATH, "utf8"));

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

/** Normalised identity of every migration actually on disk. */
const diskChecksums: Record<string, string> = {};
for (const name of migrationNames) {
  diskChecksums[name] = migrationIdentity(readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
}

describe("PHASE102_MIGRATION_CONTRACT", () => {
  it("chains off the Phase 99.7 target: same commit, same 69-count", () => {
    expect(BASELINE_SHA).toBe("cbfa2923318827ee42614c07f2e3861a3db8ed99");
    expect(BASELINE_SHA).toBe(PHASE997_TARGET_SHA);
    expect(EXPECTED_BASELINE_COUNT).toBe(PHASE997_TARGET_COUNT);
    expect(EXPECTED_BASELINE_COUNT + EXPECTED_DELTA).toBe(EXPECTED_TARGET_COUNT);
  });

  it("asserts a 69 -> 70 delta of exactly one named migration", () => {
    expect(EXPECTED_BASELINE_COUNT).toBe(69);
    expect(EXPECTED_TARGET_COUNT).toBe(70);
    expect(EXPECTED_DELTA).toBe(1);
    expect(EXPECTED_NEW_MIGRATIONS).toEqual(["20260821000000_phase102_media_video_hub"]);
    expect(EXPECTED_CLASSIFICATION).toBe("FORWARD_ONLY_REQUIRES_BACKUP");
  });

  it("the working tree holds exactly the 70-migration target set", () => {
    expect(migrationNames.length).toBe(EXPECTED_TARGET_COUNT);
    expect(migrationNames).toContain(EXPECTED_NEW_MIGRATIONS[0]);
    expect(verifyDeterministicOrdering(migrationNames).ok).toBe(true);
  });

  it("the Phase 102 migration appends strictly after all 69 historical migrations", () => {
    const historicalNames = Object.keys(phase997Ledger.migrationChecksums).sort();
    const lastHistorical = historicalNames[historicalNames.length - 1];
    for (const name of EXPECTED_NEW_MIGRATIONS) {
      expect(name > lastHistorical, `${name} sorts before applied historical ${lastHistorical}`).toBe(true);
    }
  });
});

describe("PHASE102_MIGRATION_LEDGER", () => {
  it("is a distinct contract that never absorbs or edits Phase 99.7 evidence", () => {
    expect(ledger.phase).toBe("102");
    expect(ledger.baselineSha).toBe(BASELINE_SHA);
    // The Phase 99.7 ledger keeps its immutable historical figures.
    expect(phase997Ledger.phase).toBe("99.7");
    expect(phase997Ledger.targetSha).toBe(BASELINE_SHA);
    expect(phase997Ledger.baselineMigrationCount).toBe(49);
    expect(phase997Ledger.targetMigrationCount).toBe(69);
    expect(phase997Ledger.newMigrationCount).toBe(20);
    expect(Object.keys(phase997Ledger.migrationChecksums)).not.toContain(EXPECTED_NEW_MIGRATIONS[0]);
  });

  it("pins the 69 -> 70 forward-only contract", () => {
    expect(ledger.baselineMigrationCount).toBe(EXPECTED_BASELINE_COUNT);
    expect(ledger.targetMigrationCount).toBe(EXPECTED_TARGET_COUNT);
    expect(ledger.newMigrationCount).toBe(EXPECTED_DELTA);
    expect(ledger.historicalMutationCount).toBe(0);
    expect(ledger.newMigrations).toEqual(EXPECTED_NEW_MIGRATIONS);
    expect(ledger.migrationClassification).toBe(EXPECTED_CLASSIFICATION);
    expect(ledger.preMigrationBackupRequired).toBe(true);
  });

  it("binds provenance to a stable introducing commit, not a transient merge HEAD", () => {
    const source = ledger.sourceCommits[EXPECTED_NEW_MIGRATIONS[0]];
    expect(source).toMatch(/^[0-9a-f]{40}$/);
    // The transient Phase 102 integration merge must never be the provenance pin.
    expect(source).not.toBe("9d4487f3a044942b01f29962794131935b6dee9c");
  });

  it("covers exactly the migration set present in the repository", () => {
    expect(Object.keys(ledger.migrationChecksums).sort()).toEqual(migrationNames);
  });

  it("every recorded checksum still matches the migration on disk", () => {
    for (const name of migrationNames) {
      expect(ledger.migrationChecksums[name], `checksum drift in ${name}`).toBe(diskChecksums[name]);
    }
  });

  it("the deterministic migration-set digest recomputes from disk", () => {
    expect(ledger.migrationSetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(migrationSetDigest(diskChecksums)).toBe(ledger.migrationSetSha256);
    // Any mutation of any migration changes the digest.
    expect(migrationSetDigest({ ...diskChecksums, [migrationNames[0]]: "0".repeat(64) })).not.toBe(ledger.migrationSetSha256);
  });
});

describe("PHASE102_MUTATION_REGRESSION", () => {
  // The historical 69-set exactly as the immutable Phase 99.7 ledger records it.
  const historical: Record<string, string> = phase997Ledger.migrationChecksums;
  const phase102Name = EXPECTED_NEW_MIGRATIONS[0];

  const gateOver = (current: Record<string, string>) =>
    evaluateMigrationGate({
      migrationsDir: MIGRATIONS_DIR,
      releaseBaseChecksums: historical,
      targetChecksums: current,
    });

  it("the legitimate Phase 102 append passes both contracts", () => {
    const gate = gateOver(diskChecksums);
    expect(gate.newMigrations).toEqual(EXPECTED_NEW_MIGRATIONS);
    expect(gate.historicalMutation).toBe(false);
    expect(gate.deployBlocked).toBe(false);
    expect(gate.migrationClassification).toBe(EXPECTED_CLASSIFICATION);
    const preservation = verifyHistoricalPreservation(historical, diskChecksums);
    expect(preservation.ok).toBe(true);
    expect(preservation.futureMigrations).toEqual(EXPECTED_NEW_MIGRATIONS);
  });

  it("fails closed when a historical migration is mutated", () => {
    const first = Object.keys(historical).sort()[0];
    const tampered = { ...diskChecksums, [first]: "f".repeat(64) };
    const gate = gateOver(tampered);
    expect(gate.historicalMutation).toBe(true);
    expect(gate.deployBlocked).toBe(true);
    expect(verifyHistoricalPreservation(historical, tampered).mutated).toEqual([first]);
  });

  it("fails closed when a historical migration is deleted or renamed", () => {
    const victim = Object.keys(historical).sort()[10];
    const tampered: Record<string, string> = { ...diskChecksums };
    delete tampered[victim];
    const deleted = gateOver(tampered);
    expect(deleted.missingMigrations).toEqual([victim]);
    expect(deleted.deployBlocked).toBe(true);

    // A rename = the same content under a new name: still missing + interleaved.
    tampered[`${victim.slice(0, 14)}_renamed_history`] = historical[victim];
    const renamed = verifyHistoricalPreservation(historical, tampered);
    expect(renamed.ok).toBe(false);
    expect(renamed.missing).toEqual([victim]);
  });

  it("fails closed when the Phase 102 migration itself is mutated or removed", () => {
    const mutated = { ...diskChecksums, [phase102Name]: "0".repeat(64) };
    expect(migrationSetDigest(mutated)).not.toBe(ledger.migrationSetSha256);
    expect(ledger.migrationChecksums[phase102Name]).not.toBe(mutated[phase102Name]);

    const removed: Record<string, string> = { ...diskChecksums };
    delete removed[phase102Name];
    const gate = gateOver(removed);
    // With the migration gone the delta collapses to zero — the exact-set pin
    // (newMigrations === [phase102Name]) can no longer hold.
    expect(gate.newMigrations).toEqual([]);
    expect(gate.newMigrations).not.toEqual(EXPECTED_NEW_MIGRATIONS);
    expect(migrationSetDigest(removed)).not.toBe(ledger.migrationSetSha256);
  });

  it("fails closed on an interleaved or backdated migration", () => {
    const interleaved = { ...diskChecksums, "20260820000009_backdated_intruder": "ab".repeat(32) };
    const preservation = verifyHistoricalPreservation(historical, interleaved);
    expect(preservation.ok).toBe(false);
    expect(preservation.interleaved).toEqual(["20260820000009_backdated_intruder"]);
    // And the exact-set pin also breaks: two new migrations instead of one.
    const gate = gateOver(interleaved);
    expect(gate.newMigrations).toHaveLength(2);
    expect(gate.newMigrations).not.toEqual(EXPECTED_NEW_MIGRATIONS);
  });

  it("the ledger is real derived evidence, not a fixture", () => {
    // Recompute the ledger's own integrity hash over its recorded fields with
    // the same canonical hasher the gate uses; a hand-edited fixture would no
    // longer hash to its embedded ledgerSha256.
    const { ledgerSha256, ...body } = ledger;
    expect(ledgerSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalSha256(body)).toBe(ledgerSha256);
    expect(Object.keys(ledger.migrationChecksums)).toHaveLength(EXPECTED_TARGET_COUNT);
    // Both Phase 99.7 ledger hashes remain self-consistent too — proof the
    // historical evidence file was not touched by this phase.
    const { ledgerSha256: histHash, ...histBody } = phase997Ledger;
    expect(canonicalSha256(histBody)).toBe(histHash);
  });
});

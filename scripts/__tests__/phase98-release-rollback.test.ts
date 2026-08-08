import { describe, it, expect } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  RELEASE_STATES,
  classifyRollback,
  nextState,
  postCutoverFailure,
  requirePreviousGood,
  isTerminal,
} from "../dr/release-state.mjs";
import {
  buildJournalEntry,
  journalEntrySha256,
  appendJournalAtomic,
  readJournal,
} from "../dr/release-journal.mjs";

/**
 * PHASE 98 — release rollout state machine + rollback classification + local
 * release journal (pure, deterministic).
 */

describe("classifyRollback", () => {
  it("NO_MIGRATION is always safe (no schema change to be incompatible with)", () => {
    expect(
      classifyRollback({ migrationClassification: "NO_MIGRATION", appRollbackProven: false }),
    ).toBe("APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA");
    expect(
      classifyRollback({ migrationClassification: "NO_MIGRATION", appRollbackProven: true }),
    ).toBe("APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA");
  });

  it("BREAKING_OR_UNKNOWN is always blocked, regardless of appRollbackProven", () => {
    expect(
      classifyRollback({ migrationClassification: "BREAKING_OR_UNKNOWN", appRollbackProven: true }),
    ).toBe("RELEASE_ROLLBACK_BLOCKED");
    expect(
      classifyRollback({ migrationClassification: "BREAKING_OR_UNKNOWN", appRollbackProven: false }),
    ).toBe("RELEASE_ROLLBACK_BLOCKED");
  });

  it("ADDITIVE_COMPATIBLE: proven app rollback is safe, unproven requires DB restore", () => {
    expect(
      classifyRollback({ migrationClassification: "ADDITIVE_COMPATIBLE", appRollbackProven: true }),
    ).toBe("APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA");
    expect(
      classifyRollback({ migrationClassification: "ADDITIVE_COMPATIBLE", appRollbackProven: false }),
    ).toBe("APP_ROLLBACK_REQUIRES_DB_RESTORE");
  });

  it("FORWARD_ONLY_REQUIRES_BACKUP follows the same proven/unproven rule as ADDITIVE_COMPATIBLE", () => {
    expect(
      classifyRollback({ migrationClassification: "FORWARD_ONLY_REQUIRES_BACKUP", appRollbackProven: true }),
    ).toBe("APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA");
    expect(
      classifyRollback({ migrationClassification: "FORWARD_ONLY_REQUIRES_BACKUP", appRollbackProven: false }),
    ).toBe("APP_ROLLBACK_REQUIRES_DB_RESTORE");
  });
});

describe("release state machine — nextState", () => {
  it("RELEASE_STATES lists the exact expected states", () => {
    expect(RELEASE_STATES).toEqual([
      "INIT",
      "CANDIDATE_BUILT",
      "CANDIDATE_HEALTHY",
      "MIGRATED",
      "CUTOVER",
      "SOAK",
      "RETIRED_PREVIOUS",
      "ROLLED_BACK",
      "FAILED",
    ]);
  });

  it("happy path: INIT -> ... -> RETIRED_PREVIOUS (with a real migration)", () => {
    let s = "INIT";
    s = nextState(s, "build");
    expect(s).toBe("CANDIDATE_BUILT");
    s = nextState(s, "health_ok");
    expect(s).toBe("CANDIDATE_HEALTHY");
    s = nextState(s, "migrate");
    expect(s).toBe("MIGRATED");
    s = nextState(s, "cutover");
    expect(s).toBe("CUTOVER");
    s = nextState(s, "health_ok");
    expect(s).toBe("SOAK");
    s = nextState(s, "soak_ok");
    expect(s).toBe("RETIRED_PREVIOUS");
    expect(isTerminal(s)).toBe(true);
  });

  it("happy path with NO_MIGRATION: migrate_skip goes straight to CUTOVER", () => {
    let s = "INIT";
    s = nextState(s, "build");
    s = nextState(s, "health_ok");
    s = nextState(s, "migrate_skip");
    expect(s).toBe("CUTOVER");
  });

  it("candidate health_fail rolls back before cutover, previous good remains active", () => {
    let s = "INIT";
    s = nextState(s, "build");
    s = nextState(s, "health_fail");
    expect(s).toBe("ROLLED_BACK");
    expect(isTerminal(s)).toBe(true);
  });

  it("migrate_fail and cutover_fail also roll back pre-cutover", () => {
    let s = nextState(nextState("INIT", "build"), "health_ok");
    expect(nextState(s, "migrate_fail")).toBe("ROLLED_BACK");

    const migrated = nextState(s, "migrate");
    expect(nextState(migrated, "cutover_fail")).toBe("ROLLED_BACK");
  });

  it("FAILED_RELEASE_LEFT_ACTIVE=0: after any failure, terminal state is ROLLED_BACK or FAILED, never mid-cutover", () => {
    const outcomes: string[] = [];

    // Pre-cutover failure.
    outcomes.push(nextState(nextState("INIT", "build"), "health_fail"));

    // Post-cutover failure (health_fail after CUTOVER) escalated via postCutoverFailure.
    outcomes.push(postCutoverFailure("APP_ROLLBACK_REQUIRES_DB_RESTORE"));
    outcomes.push(postCutoverFailure("RELEASE_ROLLBACK_BLOCKED"));
    outcomes.push(postCutoverFailure("APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA"));

    for (const o of outcomes) {
      expect(["ROLLED_BACK", "FAILED"]).toContain(o);
      expect(isTerminal(o)).toBe(true);
      // Must never be left "mid-cutover" (CUTOVER/MIGRATED/SOAK are not terminal).
      expect(o).not.toBe("CUTOVER");
      expect(o).not.toBe("MIGRATED");
      expect(o).not.toBe("SOAK");
    }
  });

  it("illegal transitions throw", () => {
    expect(() => nextState("INIT", "cutover")).toThrow();
    expect(() => nextState("CANDIDATE_BUILT", "cutover")).toThrow();
    expect(() => nextState("SOAK", "build")).toThrow();
    expect(() => nextState("nonexistent-state", "build")).toThrow();
  });

  it("terminal states throw on any further event", () => {
    expect(() => nextState("ROLLED_BACK", "build")).toThrow();
    expect(() => nextState("RETIRED_PREVIOUS", "soak_ok")).toThrow();
    expect(() => nextState("FAILED", "health_ok")).toThrow();
  });

  it("isTerminal correctly classifies every state", () => {
    const terminal = new Set(["ROLLED_BACK", "RETIRED_PREVIOUS", "FAILED"]);
    for (const state of RELEASE_STATES) {
      expect(isTerminal(state)).toBe(terminal.has(state));
    }
  });
});

describe("postCutoverFailure", () => {
  it("returns ROLLED_BACK only when classification is APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA", () => {
    expect(postCutoverFailure("APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA")).toBe("ROLLED_BACK");
  });

  it("returns FAILED for every other classification (DB restore / blocked = incident, not auto-rollback)", () => {
    expect(postCutoverFailure("APP_ROLLBACK_REQUIRES_DB_RESTORE")).toBe("FAILED");
    expect(postCutoverFailure("RELEASE_ROLLBACK_BLOCKED")).toBe("FAILED");
  });
});

describe("requirePreviousGood", () => {
  it("throws when missing", () => {
    expect(() => requirePreviousGood(undefined)).toThrow(/UNKNOWN_PREVIOUS_GOOD_RELEASE/);
    expect(() => requirePreviousGood(null)).toThrow(/UNKNOWN_PREVIOUS_GOOD_RELEASE/);
    expect(() => requirePreviousGood("")).toThrow(/UNKNOWN_PREVIOUS_GOOD_RELEASE/);
  });

  it("throws on a short sha", () => {
    expect(() => requirePreviousGood("abc123")).toThrow(/UNKNOWN_PREVIOUS_GOOD_RELEASE/);
  });

  it("throws on an uppercase sha", () => {
    const upper = "A".repeat(40);
    expect(() => requirePreviousGood(upper)).toThrow(/UNKNOWN_PREVIOUS_GOOD_RELEASE/);
  });

  it("passes on a valid 40-char lowercase hex sha", () => {
    const valid = "0123456789abcdef0123456789abcdef01234567";
    expect(valid.length).toBe(40);
    expect(() => requirePreviousGood(valid)).not.toThrow();
  });
});

describe("release journal — append-only, atomic, round-trips, no secrets", () => {
  const journalPath = join(tmpdir(), `hermes-phase98-release-journal-${process.pid}-${Date.now()}.json`);

  it("appendJournalAtomic then readJournal round-trips entries", () => {
    try {
      rmSync(journalPath, { force: true });

      const entryA = buildJournalEntry({
        releaseId: "rel-1",
        targetGitSha: "a".repeat(40),
        previousGoodGitSha: "b".repeat(40),
        manifestHash: "c".repeat(64),
        strategy: "blue-green",
        migrationClassification: "NO_MIGRATION",
        result: "SUCCESS",
      });
      appendJournalAtomic(journalPath, entryA);

      const entryB = buildJournalEntry({
        releaseId: "rel-2",
        targetGitSha: "d".repeat(40),
        previousGoodGitSha: "a".repeat(40),
        result: "ROLLED_BACK",
      });
      appendJournalAtomic(journalPath, entryB);

      const all = readJournal(journalPath);
      expect(all).toHaveLength(2);
      expect(all[0].releaseId).toBe("rel-1");
      expect(all[0].strategy).toBe("blue-green");
      expect(all[0].cutoverAt).toBeNull(); // defaulted, not omitted
      expect(all[1].releaseId).toBe("rel-2");
      expect(all[1].result).toBe("ROLLED_BACK");

      // File permissions best-effort 0o600 on POSIX; just verify the file is readable JSON.
      const raw = readFileSync(journalPath, "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
    } finally {
      rmSync(journalPath, { force: true });
    }
  });

  it("readJournal returns an empty array for a nonexistent file", () => {
    const missingPath = join(tmpdir(), `hermes-phase98-release-journal-missing-${process.pid}-${Date.now()}.json`);
    rmSync(missingPath, { force: true });
    expect(readJournal(missingPath)).toEqual([]);
  });

  it("journalEntrySha256 is deterministic regardless of field insertion order", () => {
    const e1 = buildJournalEntry({ releaseId: "rel-x", targetGitSha: "e".repeat(40), result: "SUCCESS" });
    // Build the same logical entry with fields specified in a different order.
    const e2 = buildJournalEntry({ result: "SUCCESS", targetGitSha: "e".repeat(40), releaseId: "rel-x" });
    expect(journalEntrySha256(e1)).toBe(journalEntrySha256(e2));

    const e3 = buildJournalEntry({ releaseId: "rel-x", targetGitSha: "f".repeat(40), result: "SUCCESS" });
    expect(journalEntrySha256(e1)).not.toBe(journalEntrySha256(e3));
  });

  it("journal entries never contain secret-shaped field names", () => {
    const entry = buildJournalEntry({ releaseId: "rel-1", targetGitSha: "a".repeat(40) });
    const keys = Object.keys(entry);
    for (const k of keys) {
      expect(k).not.toMatch(/password|secret|token|privatekey/i);
    }
  });
});

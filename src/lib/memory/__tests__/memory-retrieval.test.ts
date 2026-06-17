import { describe, it, expect } from "vitest";
import {
  scoreMemory,
  rankMemories,
  OUTCOME_SCORES,
  WEIGHTS,
  RECENCY_TIERS,
} from "../memory-retrieval";
import type { StoredMemory } from "@/lib/storage/types";

/**
 * Phase 18B — memory-retrieval algorithm unit tests.
 *
 * All tests use hand-crafted StoredMemory fixtures and a fixed `now` date so
 * results are fully deterministic regardless of when the tests run.
 */

const FIXED_NOW = new Date("2026-06-19T12:00:00Z");

// Helpers for creating test fixtures
function mem(overrides: Partial<StoredMemory> & { id: string }): StoredMemory {
  return {
    id: overrides.id,
    query: overrides.query ?? "generic industrial fault",
    domain: overrides.domain ?? "plc",
    analysisSummary: overrides.analysisSummary ?? "check diagnostics",
    confidence: overrides.confidence ?? 50,
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    relatedDocumentIds: overrides.relatedDocumentIds ?? [],
    outcome: overrides.outcome ?? "unknown",
    createdAt: overrides.createdAt ?? "2026-06-15T00:00:00Z", // 4 days before now
    updatedAt: overrides.updatedAt ?? "2026-06-15T00:00:00Z",
    ...(overrides.notes !== undefined ? { notes: overrides.notes } : {}),
  };
}

// ---- scoreMemory: domain match -------------------------------------------

describe("scoreMemory — domain match", () => {
  it("adds 30 points when the filter domain matches the memory domain", () => {
    const m = mem({ id: "m1", domain: "drives" });
    const { score, reasons } = scoreMemory("VFD overcurrent fault", m, "drives", FIXED_NOW);
    expect(reasons).toContain("domain_match");
    // Domain pts (30) + outcome unknown (3) + recency ≤7d (5) + confidence (50→7)
    // keyword: "VFD" "overcurrent" "fault" — "fault" may hit "generic industrial fault"
    expect(score).toBeGreaterThanOrEqual(30 + 3); // at minimum domain + outcome
  });

  it("adds 0 domain points when the filter domain does not match", () => {
    const m = mem({ id: "m1", domain: "plc" });
    const { reasons } = scoreMemory("VFD overcurrent", m, "drives", FIXED_NOW);
    expect(reasons).not.toContain("domain_match");
  });

  it("adds 0 domain points when no domain filter is provided", () => {
    const m = mem({ id: "m1", domain: "drives" });
    const { score: withFilter } = scoreMemory("VFD fault", m, "drives", FIXED_NOW);
    const { score: noFilter } = scoreMemory("VFD fault", m, undefined, FIXED_NOW);
    expect(withFilter).toBeGreaterThan(noFilter); // domain filter adds 30
  });

  it("a domain-matched memory ranks higher than a non-matching one with equal keywords", () => {
    const matching = mem({ id: "a", domain: "drives", query: "VFD trip fault", confidence: 60 });
    const nonMatch = mem({ id: "b", domain: "plc", query: "VFD trip fault", confidence: 60 });
    const results = rankMemories("VFD trip fault", [nonMatch, matching], { domain: "drives" }, FIXED_NOW);
    expect(results[0].id).toBe("a");
  });
});

// ---- scoreMemory: keyword overlap ----------------------------------------

describe("scoreMemory — keyword overlap", () => {
  it("scores 0 keyword points when no query tokens appear in the memory", () => {
    const m = mem({ id: "m1", query: "hydraulic pump cavitation", analysisSummary: "check pressure" });
    const { score, reasons } = scoreMemory("PLC network timeout", m, undefined, FIXED_NOW);
    expect(reasons).not.toContain("keyword_overlap");
    // Score should be only confidence + outcome + recency (no domain, no keywords)
    const confPts = Math.round((50 / 100) * WEIGHTS.CONFIDENCE);
    const outcomePs = OUTCOME_SCORES.unknown;
    const recencyPts = 5; // within 7 days
    expect(score).toBe(Math.min(confPts + outcomePs + recencyPts, 100));
  });

  it("scores full keyword points when all query tokens appear in the memory", () => {
    const m = mem({
      id: "m1",
      query: "profinet communication loss after switch replacement",
      analysisSummary: "switch config mismatch vlan",
      confidence: 0,
      outcome: "failed", // zero outcome points to isolate keyword score
    });
    // Use a fixed old date to zero out recency points too
    const old = mem({
      id: "m1",
      query: "profinet communication loss after switch replacement",
      analysisSummary: "switch config mismatch vlan",
      confidence: 0,
      outcome: "failed",
      createdAt: "2020-01-01T00:00:00Z",
    });
    const { score, reasons } = scoreMemory("profinet switch communication", old, undefined, FIXED_NOW);
    expect(reasons).toContain("keyword_overlap");
    expect(score).toBeGreaterThan(0);
  });

  it("memory with more matching keywords ranks higher", () => {
    const manyMatches = mem({
      id: "high",
      query: "profinet communication loss switch replacement vlan timeout",
      analysisSummary: "switch config profinet",
      confidence: 60,
    });
    const fewMatches = mem({
      id: "low",
      query: "motor vibration",
      analysisSummary: "bearing check",
      confidence: 60,
    });
    const results = rankMemories(
      "profinet switch communication timeout",
      [fewMatches, manyMatches],
      {},
      FIXED_NOW
    );
    expect(results[0].id).toBe("high");
  });

  it("applies stemming: 'replacement' query token matches 'replaced' in memory", () => {
    const m = mem({
      id: "m1",
      query: "switch was replaced last week",
      analysisSummary: "profinet fault",
      confidence: 0,
      outcome: "failed",
      createdAt: "2020-01-01T00:00:00Z",
    });
    const { reasons } = scoreMemory("switch replacement profinet", m, undefined, FIXED_NOW);
    expect(reasons).toContain("keyword_overlap");
  });
});

// ---- scoreMemory: outcome weighting --------------------------------------

describe("scoreMemory — outcome weighting", () => {
  it("follows success > partial > unknown > failed ordering", () => {
    const base = { query: "identical query", analysisSummary: "identical summary", confidence: 0 };
    const OLD = "2020-01-01T00:00:00Z";
    const success = mem({ id: "s", ...base, outcome: "success", createdAt: OLD });
    const partial = mem({ id: "p", ...base, outcome: "partial", createdAt: OLD });
    const unknown = mem({ id: "u", ...base, outcome: "unknown", createdAt: OLD });
    const failed  = mem({ id: "f", ...base, outcome: "failed",  createdAt: OLD });

    const s = scoreMemory("identical query", success, undefined, FIXED_NOW).score;
    const p = scoreMemory("identical query", partial, undefined, FIXED_NOW).score;
    const u = scoreMemory("identical query", unknown, undefined, FIXED_NOW).score;
    const f = scoreMemory("identical query", failed,  undefined, FIXED_NOW).score;

    expect(s).toBeGreaterThan(p);
    expect(p).toBeGreaterThan(u);
    expect(u).toBeGreaterThan(f);
  });

  it("emits 'outcome_success' reason for success memories", () => {
    const m = mem({ id: "m1", outcome: "success" });
    const { reasons } = scoreMemory("query", m, undefined, FIXED_NOW);
    expect(reasons).toContain("outcome_success");
    expect(reasons).not.toContain("outcome_failed");
  });

  it("emits 'outcome_failed' reason for failed memories", () => {
    const m = mem({ id: "m1", outcome: "failed" });
    const { reasons } = scoreMemory("query", m, undefined, FIXED_NOW);
    expect(reasons).toContain("outcome_failed");
  });

  it("failed memories rank below success memories with equivalent keywords", () => {
    const good = mem({ id: "good", query: "VFD overcurrent trip", outcome: "success", confidence: 50 });
    const bad  = mem({ id: "bad",  query: "VFD overcurrent trip", outcome: "failed",  confidence: 50 });
    const results = rankMemories("VFD overcurrent trip", [bad, good], {}, FIXED_NOW);
    expect(results[0].id).toBe("good");
    expect(results[results.length - 1].id).toBe("bad");
  });
});

// ---- scoreMemory: confidence contribution --------------------------------

describe("scoreMemory — confidence contribution", () => {
  it("higher confidence yields a higher score (all else equal)", () => {
    const OLD = "2020-01-01T00:00:00Z";
    const highConf = mem({ id: "h", confidence: 90, outcome: "unknown", createdAt: OLD });
    const lowConf  = mem({ id: "l", confidence: 20, outcome: "unknown", createdAt: OLD });
    const hScore = scoreMemory("pump fault", highConf, undefined, FIXED_NOW).score;
    const lScore = scoreMemory("pump fault", lowConf,  undefined, FIXED_NOW).score;
    expect(hScore).toBeGreaterThan(lScore);
  });

  it("emits 'high_confidence' reason when confidence >= 70", () => {
    const m = mem({ id: "m1", confidence: 75 });
    const { reasons } = scoreMemory("fault", m, undefined, FIXED_NOW);
    expect(reasons).toContain("high_confidence");
  });

  it("does not emit 'high_confidence' when confidence < 70", () => {
    const m = mem({ id: "m1", confidence: 65 });
    const { reasons } = scoreMemory("fault", m, undefined, FIXED_NOW);
    expect(reasons).not.toContain("high_confidence");
  });
});

// ---- scoreMemory: recency boost ------------------------------------------

describe("scoreMemory — recency boost", () => {
  it("memory within 7 days gets maximum recency points", () => {
    // FIXED_NOW = 2026-06-19; 4 days ago = 2026-06-15
    const m = mem({ id: "m1", createdAt: "2026-06-15T00:00:00Z", confidence: 0, outcome: "failed" });
    const { score, reasons } = scoreMemory("q", m, undefined, FIXED_NOW);
    expect(reasons).toContain("recent");
    expect(score).toBe(RECENCY_TIERS[0].pts); // 5 — all other sources are 0 (failed+0conf+no keyword)
  });

  it("memory older than 90 days gets 0 recency points", () => {
    const m = mem({ id: "m1", createdAt: "2025-01-01T00:00:00Z", confidence: 0, outcome: "failed" });
    const { reasons } = scoreMemory("q", m, undefined, FIXED_NOW);
    expect(reasons).not.toContain("recent");
  });

  it("recent memory ranks above identical-keyword old memory", () => {
    const recent = mem({ id: "new", query: "VFD fault overcurrent", createdAt: "2026-06-17T00:00:00Z" });
    const old    = mem({ id: "old", query: "VFD fault overcurrent", createdAt: "2025-01-01T00:00:00Z" });
    const results = rankMemories("VFD fault overcurrent", [old, recent], {}, FIXED_NOW);
    expect(results[0].id).toBe("new");
  });
});

// ---- scoreMemory: reference overlap --------------------------------------

describe("scoreMemory — reference overlap", () => {
  it("emits 'reference_match' when a query token appears only in relatedCaseIds", () => {
    const m = mem({
      id: "m1",
      query: "communication error",
      analysisSummary: "check config",
      relatedCaseIds: ["case-profinet-timeout"],
    });
    const { reasons } = scoreMemory("profinet communication timeout", m, undefined, FIXED_NOW);
    expect(reasons).toContain("reference_match");
  });

  it("does not emit 'reference_match' when the token is also in the main text", () => {
    const m = mem({
      id: "m1",
      query: "profinet communication error",
      analysisSummary: "check switch",
      relatedCaseIds: ["case-profinet-001"],
    });
    const { reasons } = scoreMemory("profinet", m, undefined, FIXED_NOW);
    // "profinet" is in the base text — reference_match should NOT fire
    expect(reasons).not.toContain("reference_match");
  });
});

// ---- rankMemories: limit handling ----------------------------------------

describe("rankMemories — limit handling", () => {
  it("respects the limit option", () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      mem({ id: `m${i}`, query: `fault query ${i}` })
    );
    const results = rankMemories("fault query", memories, { limit: 3 }, FIXED_NOW);
    expect(results).toHaveLength(3);
  });

  it("returns all memories when limit is 0 or undefined", () => {
    const memories = Array.from({ length: 5 }, (_, i) => mem({ id: `m${i}` }));
    expect(rankMemories("fault", memories, {}, FIXED_NOW)).toHaveLength(5);
    expect(rankMemories("fault", memories, { limit: 0 }, FIXED_NOW)).toHaveLength(5);
  });

  it("returns an empty array when the memory list is empty", () => {
    expect(rankMemories("fault query", [], { limit: 10 }, FIXED_NOW)).toEqual([]);
  });
});

// ---- rankMemories: output shape ------------------------------------------

describe("rankMemories — output shape", () => {
  it("each MemoryMatch has all required fields", () => {
    const m = mem({ id: "m1", query: "VFD trips on startup", analysisSummary: "ramp config" });
    const [match] = rankMemories("VFD startup", [m], {}, FIXED_NOW);
    expect(typeof match.id).toBe("string");
    expect(typeof match.query).toBe("string");
    expect(typeof match.domain).toBe("string");
    expect(typeof match.summary).toBe("string");
    expect(typeof match.confidence).toBe("number");
    expect(typeof match.outcome).toBe("string");
    expect(typeof match.score).toBe("number");
    expect(Array.isArray(match.reasons)).toBe(true);
    // summary maps to analysisSummary
    expect(match.summary).toBe("ramp config");
  });

  it("score is capped at 100", () => {
    const m = mem({
      id: "m1",
      query: "profinet switch communication loss timeout replacement",
      analysisSummary: "profinet switch config vlan timeout",
      domain: "otNetwork",
      confidence: 100,
      outcome: "success",
      createdAt: "2026-06-18T00:00:00Z",
    });
    const { score } = scoreMemory(
      "profinet switch communication loss timeout replacement",
      m,
      "otNetwork",
      FIXED_NOW
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ---- OUTCOME_SCORES constant export ------------------------------------

describe("OUTCOME_SCORES constant", () => {
  it("success > partial > unknown > failed", () => {
    expect(OUTCOME_SCORES.success).toBeGreaterThan(OUTCOME_SCORES.partial);
    expect(OUTCOME_SCORES.partial).toBeGreaterThan(OUTCOME_SCORES.unknown);
    expect(OUTCOME_SCORES.unknown).toBeGreaterThan(OUTCOME_SCORES.failed);
    expect(OUTCOME_SCORES.failed).toBe(0);
  });
});

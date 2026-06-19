import { describe, it, expect } from "vitest";
import { computeMemoryAgent } from "../memory-agent";
import type { StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Factories ──────────────────────────────────────────────────────────────

function mem(id: string, opts: Partial<StoredMemory> = {}): StoredMemory {
  return {
    id,
    query:           `query-${id}`,
    domain:          "drives",
    analysisSummary: `summary-${id}`,
    confidence:      70,
    relatedCaseIds:       [],
    relatedDocumentIds:   [],
    outcome:         "unknown",
    projectId:       undefined,
    createdAt:       "2026-01-10T00:00:00.000Z",
    updatedAt:       "2026-01-10T00:00:00.000Z",
    ...opts,
  };
}

function fb(memoryId: string): [string, StoredMemoryFeedback[]] {
  return [memoryId, [{ id: "f1", memoryId, outcome: "success", createdAt: "2026-01-15T00:00:00.000Z" }]];
}

const NOW = new Date("2026-06-18T00:00:00.000Z");
const emptyFb = new Map<string, StoredMemoryFeedback[]>();

// ── Empty corpus ───────────────────────────────────────────────────────────

describe("computeMemoryAgent — empty corpus", () => {
  it("returns score 0 and agentId memory", () => {
    const r = computeMemoryAgent([], emptyFb, NOW);
    expect(r.agentId).toBe("memory");
    expect(r.score).toBe(0);
  });

  it("returns no-memories finding", () => {
    const r = computeMemoryAgent([], emptyFb, NOW);
    expect(r.findings).toContain("No engineering memories found");
  });

  it("data fields are all zero / empty / stable", () => {
    const { data } = computeMemoryAgent([], emptyFb, NOW);
    expect(data.totalMemories).toBe(0);
    expect(data.qualityScore).toBe(0);
    expect(data.feedbackCompleteness).toBe(0);
    expect(data.successRate).toBe(0);
    expect(data.coverageGaps).toEqual([]);
    expect(data.learningVelocity).toBe("stable");
  });
});

// ── Quality score ──────────────────────────────────────────────────────────

describe("computeMemoryAgent — quality score", () => {
  it("qualityScore is avg confidence", () => {
    const mems = [mem("m1", { confidence: 80 }), mem("m2", { confidence: 60 })];
    const { data } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(data.qualityScore).toBe(70);
  });

  it("high confidence triggers high-quality finding", () => {
    const mems = [mem("m1", { confidence: 80 }), mem("m2", { confidence: 75 })];
    const { findings } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(findings).toContain("High average memory confidence");
  });

  it("low confidence triggers low-quality finding", () => {
    const mems = [mem("m1", { confidence: 30 }), mem("m2", { confidence: 25 })];
    const { findings } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(findings).toContain("Low average memory confidence");
  });
});

// ── Feedback completeness ──────────────────────────────────────────────────

describe("computeMemoryAgent — feedback completeness", () => {
  it("feedbackCompleteness 0% triggers finding", () => {
    const mems = [mem("m1"), mem("m2")];
    const { findings } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(findings).toContain("Feedback coverage is insufficient");
  });

  it("feedbackCompleteness is percentage with feedback", () => {
    const mems = [mem("m1"), mem("m2"), mem("m3"), mem("m4")];
    const fbMap = new Map([fb("m1"), fb("m2")]);
    const { data } = computeMemoryAgent(mems, fbMap, NOW);
    expect(data.feedbackCompleteness).toBe(50);
  });

  it("100% feedback does not trigger insufficient finding", () => {
    const mems = [mem("m1"), mem("m2")];
    const fbMap = new Map([fb("m1"), fb("m2")]);
    const { findings } = computeMemoryAgent(mems, fbMap, NOW);
    expect(findings).not.toContain("Feedback coverage is insufficient");
  });
});

// ── Coverage gaps ──────────────────────────────────────────────────────────

describe("computeMemoryAgent — coverage gaps", () => {
  it("domains with < 3 memories are listed as gaps", () => {
    const mems = [mem("m1", { domain: "plc" }), mem("m2", { domain: "scada" })];
    const { data } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(data.coverageGaps).toContain("plc");
    expect(data.coverageGaps).toContain("scada");
  });

  it("domain with 3+ memories is NOT a gap", () => {
    const mems = [
      mem("m1", { domain: "drives" }), mem("m2", { domain: "drives" }), mem("m3", { domain: "drives" }),
    ];
    const { data } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(data.coverageGaps).not.toContain("drives");
  });

  it("coverageGaps is sorted ascending", () => {
    const mems = [mem("m1", { domain: "scada" }), mem("m2", { domain: "drives" })];
    const { data } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(data.coverageGaps).toEqual(["drives", "scada"]);
  });
});

// ── Learning velocity ──────────────────────────────────────────────────────

describe("computeMemoryAgent — learning velocity", () => {
  it("stable when no memories in either window", () => {
    const mems = [mem("m1", { createdAt: "2025-01-01T00:00:00.000Z" })];
    const { data } = computeMemoryAgent(mems, emptyFb, NOW);
    expect(data.learningVelocity).toBe("stable");
  });

  it("accelerating when recent > prior by > 2", () => {
    const recent: StoredMemory[] = ["r1", "r2", "r3", "r4"].map(id =>
      mem(id, { domain: `d${id}`, createdAt: "2026-06-01T00:00:00.000Z" })
    );
    const prior: StoredMemory[] = [mem("p1", { domain: "dp1", createdAt: "2026-04-15T00:00:00.000Z" })];
    const { data } = computeMemoryAgent([...recent, ...prior], emptyFb, NOW);
    expect(data.learningVelocity).toBe("accelerating");
  });

  it("decelerating when prior > recent by > 2", () => {
    const recent: StoredMemory[] = [mem("r1", { domain: "dr1", createdAt: "2026-06-01T00:00:00.000Z" })];
    // Prior window = [NOW-60d, NOW-30d] = [2026-04-19, 2026-05-19]; use 2026-05-01 to stay inside
    const prior: StoredMemory[] = ["p1", "p2", "p3", "p4"].map(id =>
      mem(id, { domain: `dp${id}`, createdAt: "2026-05-01T00:00:00.000Z" })
    );
    const { data } = computeMemoryAgent([...recent, ...prior], emptyFb, NOW);
    expect(data.learningVelocity).toBe("decelerating");
  });
});

// ── Score bounds ───────────────────────────────────────────────────────────

describe("computeMemoryAgent — score bounds", () => {
  it("score is always 0-100", () => {
    const mems = [mem("m1", { confidence: 100, outcome: "success" }),
                  mem("m2", { confidence: 100, outcome: "success" }),
                  mem("m3", { confidence: 100, outcome: "success" })];
    const fbMap = new Map([fb("m1"), fb("m2"), fb("m3")]);
    const { score } = computeMemoryAgent(mems, fbMap, NOW);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("high-quality corpus scores above 50", () => {
    const mems = [
      mem("m1", { confidence: 90, outcome: "success", domain: "drives" }),
      mem("m2", { confidence: 85, outcome: "success", domain: "drives" }),
      mem("m3", { confidence: 80, outcome: "success", domain: "drives" }),
    ];
    const fbMap = new Map([fb("m1"), fb("m2"), fb("m3")]);
    const { score } = computeMemoryAgent(mems, fbMap, NOW);
    expect(score).toBeGreaterThan(50);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeMemoryAgent — determinism", () => {
  it("same input produces identical output", () => {
    const mems = [mem("m1", { confidence: 75 }), mem("m2", { confidence: 65 })];
    const r1 = computeMemoryAgent(mems, emptyFb, NOW);
    const r2 = computeMemoryAgent(mems, emptyFb, NOW);
    expect(r1).toEqual(r2);
  });
});

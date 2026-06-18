/**
 * Phase 26 — Pure failure-prediction engine tests.
 * All inputs are in-memory fixtures; no I/O.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computeFailurePredictions } from "../failure-prediction";
import type { StoredMemory, StoredProject, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const FIXED_NOW = new Date("2026-06-17T12:00:00.000Z");
const STALE_TS  = "2025-12-15T00:00:00.000Z";   // ~183 days before FIXED_NOW
const FRESH_TS  = "2026-06-10T00:00:00.000Z";    // 7 days before FIXED_NOW

let mIdx = 0;
beforeEach(() => { mIdx = 0; });

function proj(id: string, name?: string): StoredProject {
  return { id, name: name ?? `Project ${id}`, description: "", status: "active",
    createdAt: FRESH_TS, updatedAt: FRESH_TS };
}

function mem(
  id: string,
  opts: {
    projectId?:  string;
    outcome?:    "unknown" | "success" | "partial" | "failed";
    confidence?: number;
    createdAt?:  string;
  } = {}
): StoredMemory {
  mIdx++;
  return {
    id, query: `query ${mIdx}`, domain: "drives",
    analysisSummary: `summary ${mIdx}`,
    confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    projectId: opts.projectId,
    createdAt: opts.createdAt ?? FRESH_TS,
    updatedAt: FRESH_TS,
  };
}

function fb(memId: string): StoredMemoryFeedback {
  return { id: `fb-${memId}`, memoryId: memId, outcome: "success", createdAt: FRESH_TS };
}

const NO_FB   = new Map<string, StoredMemoryFeedback[]>();
const NO_PROJ: StoredProject[] = [];
const NO_MEM:  StoredMemory[]  = [];

// ── Empty / no data ────────────────────────────────────────────────────────

describe("computeFailurePredictions — empty", () => {
  it("returns empty predictions for empty projects", () => {
    const r = computeFailurePredictions([], [], NO_FB, FIXED_NOW);
    expect(r.predictions).toHaveLength(0);
  });

  it("summary is all-zero for empty projects", () => {
    const r = computeFailurePredictions([], [], NO_FB, FIXED_NOW);
    const { totalProjects, criticalCount, highCount, avgFailureScore, topRiskProject } = r.summary;
    expect(totalProjects).toBe(0);
    expect(criticalCount).toBe(0);
    expect(highCount).toBe(0);
    expect(avgFailureScore).toBe(0);
    expect(topRiskProject).toBeNull();
  });
});

// ── No memories for project ────────────────────────────────────────────────

describe("computeFailurePredictions — project with no memories", () => {
  it("failureScore=0 for project with no memories", () => {
    const r = computeFailurePredictions([proj("p1")], NO_MEM, NO_FB, FIXED_NOW);
    expect(r.predictions[0].failureScore).toBe(0);
  });

  it("riskLevel=low for project with no memories", () => {
    const r = computeFailurePredictions([proj("p1")], NO_MEM, NO_FB, FIXED_NOW);
    expect(r.predictions[0].riskLevel).toBe("low");
  });

  it("predictionConfidence=0 for project with no memories", () => {
    const r = computeFailurePredictions([proj("p1")], NO_MEM, NO_FB, FIXED_NOW);
    expect(r.predictions[0].predictionConfidence).toBe(0);
  });

  it("memoryCount=0 reflected correctly", () => {
    const r = computeFailurePredictions([proj("p1")], NO_MEM, NO_FB, FIXED_NOW);
    expect(r.predictions[0].memoryCount).toBe(0);
  });

  it("factors is empty for project with no memories", () => {
    const r = computeFailurePredictions([proj("p1")], NO_MEM, NO_FB, FIXED_NOW);
    expect(r.predictions[0].factors).toHaveLength(0);
  });
});

// ── Failure score computation ──────────────────────────────────────────────

describe("computeFailurePredictions — score computation", () => {
  it("all failures + low confidence + no feedback → critical (>=70)", () => {
    // A=50(100%*0.5) B=4((50-40)*0.4) C=20(no fb) → 74
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 40 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 40 }),
    ];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].riskLevel).toBe("critical");
    expect(r.predictions[0].failureScore).toBe(74);
  });

  it("all success + high confidence + full feedback → failureScore=0", () => {
    // A=0 B=0 C=0 D=0
    const mems = [mem("m1", { projectId: "p1", outcome: "success", confidence: 90 })];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeFailurePredictions([proj("p1")], mems, fbMap, FIXED_NOW);
    expect(r.predictions[0].failureScore).toBe(0);
    expect(r.predictions[0].riskLevel).toBe("low");
  });

  it("50% failures + high confidence + no feedback → moderate", () => {
    // A=25(50%*0.5) B=0(conf>50) C=20(no fb) → 45
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed",  confidence: 70 }),
      mem("m2", { projectId: "p1", outcome: "unknown", confidence: 70 }),
    ];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].riskLevel).toBe("moderate");
    expect(r.predictions[0].failureScore).toBe(45);
  });

  it("all failures + high confidence + 50% feedback → high (50-69)", () => {
    // A=50 B=0(conf=60>50) C=10(50% no fb) → 60
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 60 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 60 }),
    ];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeFailurePredictions([proj("p1")], mems, fbMap, FIXED_NOW);
    expect(r.predictions[0].riskLevel).toBe("high");
    expect(r.predictions[0].failureScore).toBe(60);
  });

  it("no failures but no feedback → low (score < 25)", () => {
    // A=0 B=0(conf=70) C=20 → 20 → "low"
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 70 })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].riskLevel).toBe("low");
    expect(r.predictions[0].failureScore).toBe(20);
  });

  it("stale memories add D component", () => {
    // A=0 B=0 C=20 D=10(stale) → 30 → moderate
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 70, createdAt: STALE_TS })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].failureScore).toBe(30);
    expect(r.predictions[0].factors.some(f => f.type === "stale_knowledge")).toBe(true);
  });

  it("full feedback coverage zeroes out low_feedback component", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 70 })];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeFailurePredictions([proj("p1")], mems, fbMap, FIXED_NOW);
    expect(r.predictions[0].factors.some(f => f.type === "low_feedback")).toBe(false);
  });

  it("non-stale memory with unknown outcome does not add D component", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 70, createdAt: FRESH_TS })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].factors.some(f => f.type === "stale_knowledge")).toBe(false);
  });
});

// ── Factors ────────────────────────────────────────────────────────────────

describe("computeFailurePredictions — factors", () => {
  it("high_failure_rate factor present when failures > 0", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "failed" })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].factors.some(f => f.type === "high_failure_rate")).toBe(true);
  });

  it("low_confidence factor present when avgConf < 50", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 40 })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].factors.some(f => f.type === "low_confidence")).toBe(true);
  });

  it("low_confidence factor absent when avgConf >= 50", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 60 })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].factors.some(f => f.type === "low_confidence")).toBe(false);
  });

  it("factors sorted by contribution DESC", () => {
    // A=50(failure rate), C=20(no fb), B=4(low conf)
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 40 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 40 }),
    ];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    const contributions = r.predictions[0].factors.map(f => f.contribution);
    expect(contributions).toEqual([...contributions].sort((a, b) => b - a));
  });
});

// ── predictionConfidence ───────────────────────────────────────────────────

describe("computeFailurePredictions — predictionConfidence", () => {
  it("1 memory → confidence=30", () => {
    const mems = [mem("m1", { projectId: "p1" })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].predictionConfidence).toBe(30);
  });

  it("2 memories → confidence=30", () => {
    const mems = [mem("m1", { projectId: "p1" }), mem("m2", { projectId: "p1" })];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].predictionConfidence).toBe(30);
  });

  it("3 memories → confidence=60", () => {
    const mems = [
      mem("m1", { projectId: "p1" }),
      mem("m2", { projectId: "p1" }),
      mem("m3", { projectId: "p1" }),
    ];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].predictionConfidence).toBe(60);
  });

  it("6 memories → confidence=90", () => {
    const mems = Array.from({ length: 6 }, (_, i) => mem(`m${i}`, { projectId: "p1" }));
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].predictionConfidence).toBe(90);
  });
});

// ── Sorting ────────────────────────────────────────────────────────────────

describe("computeFailurePredictions — sorting", () => {
  it("sorted by failureScore DESC", () => {
    // p1: all failures (high score) | p2: all success (low score)
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed",  confidence: 40 }),
      mem("m2", { projectId: "p2", outcome: "success", confidence: 90 }),
    ];
    const r = computeFailurePredictions([proj("p1"), proj("p2")], mems, NO_FB, FIXED_NOW);
    expect(r.predictions[0].projectId).toBe("p1");
    expect(r.predictions[1].projectId).toBe("p2");
  });

  it("ties broken by projectId ASC", () => {
    // Both with same score (no memories)
    const r = computeFailurePredictions([proj("pB"), proj("pA")], [], NO_FB, FIXED_NOW);
    expect(r.predictions[0].projectId).toBe("pA");
    expect(r.predictions[1].projectId).toBe("pB");
  });
});

// ── Summary ────────────────────────────────────────────────────────────────

describe("computeFailurePredictions — summary", () => {
  it("criticalCount counts critical-risk projects", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 40 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 40 }),
    ];
    const r = computeFailurePredictions([proj("p1")], mems, NO_FB, FIXED_NOW);
    expect(r.summary.criticalCount).toBe(1);
  });

  it("highCount counts high-risk projects", () => {
    // score=60 → high
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 60 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 60 }),
    ];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeFailurePredictions([proj("p1")], mems, fbMap, FIXED_NOW);
    expect(r.summary.highCount).toBe(1);
    expect(r.summary.criticalCount).toBe(0);
  });

  it("avgFailureScore averages only projects with memories", () => {
    // p1 has score 74, p2 has no memories (excluded from avg)
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 40 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 40 }),
    ];
    const r = computeFailurePredictions([proj("p1"), proj("p2")], mems, NO_FB, FIXED_NOW);
    expect(r.summary.avgFailureScore).toBe(74);
  });

  it("topRiskProject is null when all projects have no memories", () => {
    const r = computeFailurePredictions([proj("p1"), proj("p2")], [], NO_FB, FIXED_NOW);
    expect(r.summary.topRiskProject).toBeNull();
  });

  it("topRiskProject is name of highest-scoring project", () => {
    const mems = [
      mem("m1", { projectId: "p1", outcome: "failed", confidence: 40 }),
      mem("m2", { projectId: "p1", outcome: "failed", confidence: 40 }),
    ];
    const r = computeFailurePredictions([proj("p1", "Alpha Project")], mems, NO_FB, FIXED_NOW);
    expect(r.summary.topRiskProject).toBe("Alpha Project");
  });

  it("topRiskProject is null when top project has riskLevel=low", () => {
    const mems = [mem("m1", { projectId: "p1", outcome: "unknown", confidence: 70 })];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeFailurePredictions([proj("p1")], mems, fbMap, FIXED_NOW);
    expect(r.summary.topRiskProject).toBeNull();
  });

  it("totalProjects matches number of projects", () => {
    const r = computeFailurePredictions([proj("p1"), proj("p2"), proj("p3")], [], NO_FB, FIXED_NOW);
    expect(r.summary.totalProjects).toBe(3);
  });
});

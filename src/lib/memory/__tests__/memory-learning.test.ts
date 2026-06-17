import { describe, it, expect } from "vitest";
import {
  computeOutcomeScore,
  computeMemoryConfidence,
  computeLearningWeight,
} from "../memory-learning";
import {
  scoreLearned,
  rankMemoriesWithFeedback,
  scoreMemory,
  OUTCOME_SCORES,
} from "../memory-retrieval";
import type { StoredMemoryFeedback, MemoryWithFeedback } from "@/lib/storage/types";

/**
 * Phase 18C — learning loop unit tests.
 *
 * All functions are pure and deterministic. The `now` parameter is pinned
 * so recency scores are stable regardless of when the tests run.
 */

const FIXED_NOW = new Date("2026-06-19T12:00:00Z");
const RECENT    = "2026-06-17T00:00:00Z"; // 2 days before now — within 7d tier
const OLD       = "2020-01-01T00:00:00Z"; // years ago — zero recency

// ---- Fixtures ---------------------------------------------------------------

function fb(outcome: StoredMemoryFeedback["outcome"]): StoredMemoryFeedback {
  return {
    id: `fb-${Math.random().toString(36).slice(2)}`,
    memoryId: "m1",
    outcome,
    createdAt: RECENT,
  };
}

function mem(
  overrides: Partial<MemoryWithFeedback> & { id: string }
): MemoryWithFeedback {
  return {
    id: overrides.id,
    query: overrides.query ?? "generic fault",
    domain: overrides.domain ?? "plc",
    analysisSummary: overrides.analysisSummary ?? "check diagnostics",
    confidence: overrides.confidence ?? 50,
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    relatedDocumentIds: overrides.relatedDocumentIds ?? [],
    outcome: overrides.outcome ?? "unknown",
    createdAt: overrides.createdAt ?? RECENT,
    updatedAt: overrides.updatedAt ?? RECENT,
    feedback: overrides.feedback ?? [],
  };
}

// ---- computeOutcomeScore ----------------------------------------------------

describe("computeOutcomeScore", () => {
  it("returns neutral (3) when feedback is empty", () => {
    expect(computeOutcomeScore([])).toBe(OUTCOME_SCORES.unknown);
  });

  it("returns 10 for a single success feedback", () => {
    expect(computeOutcomeScore([fb("success")])).toBe(10);
  });

  it("returns 0 for a single failed feedback", () => {
    expect(computeOutcomeScore([fb("failed")])).toBe(0);
  });

  it("returns 7 for a single partial feedback", () => {
    expect(computeOutcomeScore([fb("partial")])).toBe(7);
  });

  it("averages mixed success and failed feedback", () => {
    // (10 + 0) / 2 = 5
    const score = computeOutcomeScore([fb("success"), fb("failed")]);
    expect(score).toBe(5);
  });

  it("averages three feedback entries: success + partial + failed", () => {
    // (10 + 7 + 0) / 3 = 5.67 → round = 6
    const score = computeOutcomeScore([fb("success"), fb("partial"), fb("failed")]);
    expect(score).toBe(6);
  });

  it("produces a higher score for 3 successes than 3 failures", () => {
    const successes = computeOutcomeScore([fb("success"), fb("success"), fb("success")]);
    const failures  = computeOutcomeScore([fb("failed"),  fb("failed"),  fb("failed")]);
    expect(successes).toBeGreaterThan(failures);
  });
});

// ---- computeMemoryConfidence ------------------------------------------------

describe("computeMemoryConfidence", () => {
  it("returns base confidence unchanged when no feedback exists", () => {
    const m = mem({ id: "m1", confidence: 70, feedback: [] });
    expect(computeMemoryConfidence(m)).toBe(70);
  });

  it("increases confidence when all feedback is success", () => {
    const m = mem({ id: "m1", confidence: 60, feedback: [fb("success"), fb("success")] });
    expect(computeMemoryConfidence(m)).toBeGreaterThan(60);
  });

  it("decreases confidence when all feedback is failed", () => {
    const m = mem({ id: "m1", confidence: 60, feedback: [fb("failed"), fb("failed")] });
    expect(computeMemoryConfidence(m)).toBeLessThan(60);
  });

  it("returns confidence unchanged for balanced success + failed feedback", () => {
    // resolvedRatio = 0.5, failedRatio = 0.5 → adjustment = 0
    const m = mem({ id: "m1", confidence: 60, feedback: [fb("success"), fb("failed")] });
    expect(computeMemoryConfidence(m)).toBe(60);
  });

  it("clamps to 100 even when base is already high and feedback is all success", () => {
    const m = mem({ id: "m1", confidence: 95, feedback: [fb("success"), fb("success")] });
    expect(computeMemoryConfidence(m)).toBeLessThanOrEqual(100);
  });

  it("clamps to 0 when base is low and feedback is all failed", () => {
    const m = mem({ id: "m1", confidence: 5, feedback: [fb("failed"), fb("failed"), fb("failed")] });
    expect(computeMemoryConfidence(m)).toBeGreaterThanOrEqual(0);
  });

  it("partial feedback gives a moderate positive adjustment", () => {
    const withPartial  = mem({ id: "a", confidence: 60, feedback: [fb("partial")] });
    const withNoFeedback = mem({ id: "b", confidence: 60, feedback: [] });
    // partial is resolved, adjustment > 0
    expect(computeMemoryConfidence(withPartial)).toBeGreaterThanOrEqual(
      computeMemoryConfidence(withNoFeedback)
    );
  });
});

// ---- computeLearningWeight --------------------------------------------------

describe("computeLearningWeight", () => {
  it("returns 1.0 (neutral) when no feedback exists", () => {
    const m = mem({ id: "m1", feedback: [] });
    expect(computeLearningWeight(m)).toBe(1.0);
  });

  it("returns > 1.0 for a single success feedback", () => {
    const m = mem({ id: "m1", feedback: [fb("success")] });
    expect(computeLearningWeight(m)).toBeGreaterThan(1.0);
  });

  it("returns < 1.0 for a single failed feedback", () => {
    const m = mem({ id: "m1", feedback: [fb("failed")] });
    expect(computeLearningWeight(m)).toBeLessThan(1.0);
  });

  it("returns slightly > 1.0 for a single partial feedback", () => {
    const m = mem({ id: "m1", feedback: [fb("partial")] });
    expect(computeLearningWeight(m)).toBeGreaterThan(1.0);
  });

  it("weight is higher for 2 successes than 1 success", () => {
    const one = mem({ id: "a", feedback: [fb("success")] });
    const two = mem({ id: "b", feedback: [fb("success"), fb("success")] });
    expect(computeLearningWeight(two)).toBeGreaterThan(computeLearningWeight(one));
  });

  it("floor prevents weight from going below 0.3 regardless of failures", () => {
    const manyFails = mem({
      id: "m1",
      feedback: Array.from({ length: 10 }, () => fb("failed")),
    });
    expect(computeLearningWeight(manyFails)).toBeGreaterThanOrEqual(0.3);
  });

  it("ceiling prevents weight from exceeding 1.5", () => {
    const manySuccesses = mem({
      id: "m1",
      feedback: Array.from({ length: 10 }, () => fb("success")),
    });
    expect(computeLearningWeight(manySuccesses)).toBeLessThanOrEqual(1.5);
  });

  it("is deterministic — same input always yields same output", () => {
    const m = mem({ id: "m1", feedback: [fb("success"), fb("failed")] });
    const w1 = computeLearningWeight(m);
    const w2 = computeLearningWeight(m);
    expect(w1).toBe(w2);
  });
});

// ---- scoreLearned: feedback effects on ranking ------------------------------

describe("scoreLearned — success feedback increases ranking", () => {
  it("memory with success feedback scores higher than same memory without feedback", () => {
    const noFeedback = mem({ id: "a", confidence: 60, outcome: "unknown", feedback: [] });
    const withSuccess = mem({
      id: "b",
      confidence: 60,
      outcome: "unknown",
      feedback: [fb("success"), fb("success")],
    });
    const scoreNo = scoreLearned("generic fault", noFeedback, undefined, FIXED_NOW).score;
    const scoreYes = scoreLearned("generic fault", withSuccess, undefined, FIXED_NOW).score;
    expect(scoreYes).toBeGreaterThan(scoreNo);
  });

  it("emits 'learning_boost' reason when weight > 1.0", () => {
    const m = mem({ id: "m1", feedback: [fb("success")] });
    const { reasons } = scoreLearned("fault", m, undefined, FIXED_NOW);
    expect(reasons).toContain("learning_boost");
  });
});

describe("scoreLearned — failed feedback reduces ranking", () => {
  it("memory with failed feedback scores lower than same memory without feedback", () => {
    const noFeedback = mem({ id: "a", confidence: 60, outcome: "unknown", feedback: [] });
    const withFailed = mem({
      id: "b",
      confidence: 60,
      outcome: "unknown",
      feedback: [fb("failed"), fb("failed")],
    });
    const scoreNo = scoreLearned("generic fault", noFeedback, undefined, FIXED_NOW).score;
    const scoreFail = scoreLearned("generic fault", withFailed, undefined, FIXED_NOW).score;
    expect(scoreFail).toBeLessThan(scoreNo);
  });

  it("emits 'learning_penalty' reason when weight < 1.0", () => {
    const m = mem({ id: "m1", feedback: [fb("failed")] });
    const { reasons } = scoreLearned("fault", m, undefined, FIXED_NOW);
    expect(reasons).toContain("learning_penalty");
  });
});

describe("scoreLearned — partial feedback gives moderate boost", () => {
  it("partial feedback produces a score between no-feedback and success-feedback", () => {
    const base = { confidence: 60, outcome: "unknown" as const };
    const noFb  = mem({ id: "a", ...base, feedback: [] });
    const partial = mem({ id: "b", ...base, feedback: [fb("partial")] });
    const success = mem({ id: "c", ...base, feedback: [fb("success"), fb("success")] });

    const scoreNone    = scoreLearned("fault", noFb,    undefined, FIXED_NOW).score;
    const scorePartial = scoreLearned("fault", partial, undefined, FIXED_NOW).score;
    const scoreSuccess = scoreLearned("fault", success, undefined, FIXED_NOW).score;

    expect(scorePartial).toBeGreaterThanOrEqual(scoreNone);
    expect(scorePartial).toBeLessThanOrEqual(scoreSuccess);
  });
});

describe("scoreLearned — no feedback is neutral", () => {
  it("without feedback, scoreLearned produces the same score as scoreMemory", () => {
    const m = mem({ id: "m1", confidence: 70, outcome: "success", feedback: [] });
    const learnedScore = scoreLearned("generic fault", m, undefined, FIXED_NOW).score;
    const plainScore   = scoreMemory("generic fault", m, undefined, FIXED_NOW).score;
    expect(learnedScore).toBe(plainScore);
  });
});

// ---- rankMemoriesWithFeedback: deterministic ordering -----------------------

describe("rankMemoriesWithFeedback — deterministic ordering", () => {
  it("same input always produces the same ordering", () => {
    const memories: MemoryWithFeedback[] = [
      mem({ id: "a", query: "VFD overcurrent trip",     feedback: [fb("success")] }),
      mem({ id: "b", query: "profinet communication loss", feedback: [fb("failed")] }),
      mem({ id: "c", query: "motor bearing vibration",  feedback: [] }),
    ];

    const r1 = rankMemoriesWithFeedback("VFD overcurrent fault", memories, {}, FIXED_NOW);
    const r2 = rankMemoriesWithFeedback("VFD overcurrent fault", memories, {}, FIXED_NOW);

    expect(r1.map((m) => m.id)).toEqual(r2.map((m) => m.id));
  });

  it("memory with multiple success feedbacks ranks above identical memory with failures", () => {
    const good = mem({
      id: "good",
      query: "VFD fault overcurrent",
      analysisSummary: "check ramp",
      confidence: 60,
      feedback: [fb("success"), fb("success")],
    });
    const bad = mem({
      id: "bad",
      query: "VFD fault overcurrent",
      analysisSummary: "check ramp",
      confidence: 60,
      feedback: [fb("failed"), fb("failed")],
    });

    const results = rankMemoriesWithFeedback(
      "VFD fault overcurrent",
      [bad, good],
      {},
      FIXED_NOW
    );
    expect(results[0].id).toBe("good");
  });

  it("applies limit correctly", () => {
    const memories = Array.from({ length: 5 }, (_, i) =>
      mem({ id: `m${i}`, feedback: [fb("success")] })
    );
    const results = rankMemoriesWithFeedback("fault", memories, { limit: 2 }, FIXED_NOW);
    expect(results).toHaveLength(2);
  });
});

// ---- API-level: search returns learned scores (session integration) ---------

describe("searchEngineeringMemories — returns learned scores", () => {
  it("memory with success feedback has a higher score than a fresh memory", async () => {
    // Reset session stores
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];

    const { createEngineeringMemory, addMemoryFeedback, searchEngineeringMemories } =
      await import("../memory-service");

    // Two memories with identical content
    const m1 = await createEngineeringMemory({
      query: "hydraulic pressure fluctuation",
      domain: "hydraulics",
      analysisSummary: "check pump relief valve",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });
    const m2 = await createEngineeringMemory({
      query: "hydraulic pressure fluctuation",
      domain: "hydraulics",
      analysisSummary: "check pump relief valve",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    // Only m1 gets success feedback
    await addMemoryFeedback(m1.id, { memoryId: m1.id, outcome: "success" });
    await addMemoryFeedback(m1.id, { memoryId: m1.id, outcome: "success" });

    const results = await searchEngineeringMemories("hydraulic pressure fluctuation");

    const r1 = results.find((r) => r.id === m1.id);
    const r2 = results.find((r) => r.id === m2.id);

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1!.score).toBeGreaterThan(r2!.score);
  });

  it("memory with only failed feedback has a lower score than memory with no feedback", async () => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];

    const { createEngineeringMemory, addMemoryFeedback, searchEngineeringMemories } =
      await import("../memory-service");

    const mFailed = await createEngineeringMemory({
      query: "plc watchdog timeout fault",
      domain: "plc",
      analysisSummary: "check scan time settings",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });
    const mNeutral = await createEngineeringMemory({
      query: "plc watchdog timeout fault",
      domain: "plc",
      analysisSummary: "check scan time settings",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    await addMemoryFeedback(mFailed.id, { memoryId: mFailed.id, outcome: "failed" });
    await addMemoryFeedback(mFailed.id, { memoryId: mFailed.id, outcome: "failed" });

    const results = await searchEngineeringMemories("plc watchdog timeout");

    const rFailed  = results.find((r) => r.id === mFailed.id);
    const rNeutral = results.find((r) => r.id === mNeutral.id);

    expect(rFailed).toBeDefined();
    expect(rNeutral).toBeDefined();
    expect(rFailed!.score).toBeLessThan(rNeutral!.score);
  });

  it("returns [] without throwing when the memory store fails", async () => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = null; // corrupt store

    const { searchEngineeringMemories } = await import("../memory-service");
    const results = await searchEngineeringMemories("anything");
    expect(Array.isArray(results)).toBe(true);
  });
});

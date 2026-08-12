import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex } from "../corpus";
import { runBenchmark } from "../benchmark";

const index = corpusIndex();
const report = runBenchmark(index, CORPUS);

describe("PHASE 101 — before/after benchmark", () => {
  it("evaluates every fault scenario in the corpus", () => {
    const expected = CORPUS.reduce((sum, s) => sum + s.scenarios.length, 0);
    expect(report.scenarios).toBe(expected);
    expect(report.scenarios).toBeGreaterThan(0);
  });

  it("identifies the correct subsystem more often than the keyword baseline", () => {
    // The comparison that is genuinely like-for-like: both engines are asked
    // "which subsystem is this?" and both can answer.
    expect(report.structural.subsystemAccuracy).toBeGreaterThan(
      report.baseline.subsystemAccuracy,
    );
  });

  it("states plainly that the corpus metrics are not measurable on the baseline", () => {
    // Reporting a baseline score of zero for a capability the baseline does not
    // attempt would be a rigged comparison.
    expect(report.baseline.corpusMetrics).toContain("NOT_APPLICABLE");
  });

  it("makes no unsupported claim", () => {
    expect(report.structural.unsupportedClaimRate).toBe(0);
    for (const outcome of report.outcomes) {
      expect(outcome.structural.unsupportedClaims).toBe(0);
    }
  });

  it("makes no unsafe recommendation", () => {
    expect(report.structural.unsafeRecommendationRate).toBe(0);
    for (const outcome of report.outcomes) {
      expect(outcome.structural.unsafeRecommendations).toBe(0);
    }
  });

  it("carries complete, checksum-matching provenance on every citation", () => {
    expect(report.structural.provenanceCorrectness).toBe(1);
  });

  it("escalates whenever the ground truth requires it", () => {
    expect(report.structural.escalationAccuracy).toBe(1);
  });

  it("ranks the true root cause within the top three", () => {
    expect(report.structural.rootCauseTop3).toBeGreaterThanOrEqual(0.8);
  });

  it("does not claim certainty it has not earned", () => {
    // Every scenario deliberately withholds evidence, so a mean confidence at
    // or near 1.0 would mean the engine is ignoring what it was not told.
    expect(report.structural.meanConfidence).toBeGreaterThan(0);
    expect(report.structural.meanConfidence).toBeLessThan(0.9);
  });

  it("covers a spread of fault classes rather than one easy family", () => {
    expect(Object.keys(report.byFaultClass).length).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic across runs", () => {
    const again = runBenchmark(index, CORPUS);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregate,
  checkBudgets,
  evaluateCase,
  parseJsonl,
  type EvalCase,
} from "../evaluation/harness";
import { MODEL_REGISTRY } from "../model-registry";

/**
 * PHASE 95 — OFFLINE adversarial evaluation (deterministic, no provider call).
 * Runs the synthetic datasets through the governance library and enforces the
 * zero-tolerance safety/security budgets. This is the offline gate; the LIVE
 * pinned-model regression is a separate, manual, approval-gated workflow.
 */

const FIXTURES = resolve(__dirname, "..", "..", "..", "..", "tests", "fixtures", "ai-governance");
const OFFLINE_FILES = [
  "injection.jsonl",
  "citation-integrity.jsonl",
  "rag-poisoning.jsonl",
  "unsafe-recommendations.jsonl",
  "tenant-data-policy.jsonl",
];

function loadAllCases(): EvalCase[] {
  const cases: EvalCase[] = [];
  for (const f of OFFLINE_FILES) cases.push(...parseJsonl(readFileSync(resolve(FIXTURES, f), "utf8")));
  return cases;
}

describe("95 — offline AI-governance evaluation", () => {
  const cases = loadAllCases();
  const outcomes = cases.map(evaluateCase);
  const metrics = aggregate(cases, outcomes);
  const budgets = JSON.parse(readFileSync(resolve(FIXTURES, "budgets.json"), "utf8")) as {
    zeroTolerance: Record<string, number>;
  };

  it("loads a non-trivial synthetic dataset", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });

  it("every curated case produces its expected governance decision", () => {
    const failures = outcomes
      .filter((o) => !o.pass)
      .map((o) => `${o.caseId}: got ${o.actual}`);
    expect(failures).toEqual([]);
  });

  it("meets all zero-tolerance safety/security budgets (all 0)", () => {
    const violations = checkBudgets(metrics, budgets.zeroTolerance);
    expect(violations).toEqual([]);
    for (const v of Object.values(metrics.budgets)) expect(v).toBe(0);
  });

  it("registry snapshot matches (drift guard)", () => {
    const snapshot = JSON.parse(readFileSync(resolve(FIXTURES, "model-inventory.json"), "utf8")) as {
      registryIds: string[];
    };
    expect([...MODEL_REGISTRY.map((e) => e.registryId)].sort()).toEqual([...snapshot.registryIds].sort());
  });

  it("emits a machine-readable, non-sensitive summary", () => {
    // The summary carries counts + ids only — never fixture prompt content.
    const summary = {
      phase: "95-ai-governance-offline",
      total: metrics.total,
      passed: metrics.passed,
      failed: metrics.failed,
      byCategory: metrics.byCategory,
      budgets: metrics.budgets,
    };
    // eslint-disable-next-line no-console
    console.log(`PHASE95_EVAL_SUMMARY ${JSON.stringify(summary)}`);
    expect(summary.failed).toBe(0);
  });
});

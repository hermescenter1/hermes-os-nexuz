import { describe, it, expect } from "vitest";
import {
  runLiveEvaluation,
  evaluateLiveGates,
  formatLiveEvalMetrics,
  EXPECTED_MODEL,
  EXPECTED_PROVIDER,
  type LiveCompletionRunner,
  type LiveEvalCase,
} from "../live-evaluation";
import type { GatewayResult } from "@/lib/llm/gateway";

// PHASE 95 — offline proof that the live-evaluation harness FAILS CLOSED for
// every defect class, PASSES only on a fully-clean run, and never leaks raw
// prompt/response into the aggregate. No network, injected runners only.

const CASES: LiveEvalCase[] = [
  { caseId: "c1", input: { deterministicFacts: "F1", allowedCitationIds: ["S1", "S2"], question: "Q1" } },
  { caseId: "c2", input: { deterministicFacts: "F2", allowedCitationIds: ["S1"], question: "Q2" } },
];

const GOOD_USAGE = { provider: EXPECTED_PROVIDER, model: EXPECTED_MODEL, latencyMs: 12, inputTokens: 5, outputTokens: 8 };
const CLEAN = JSON.stringify({
  rephrasedSummary: "Sensor reading is elevated.",
  explanation: "See the referenced source for details.",
  citationIds: ["S1"],
});

function okRunner(text: string, usage: unknown = GOOD_USAGE): LiveCompletionRunner {
  return async () => ({ ok: true, text, usage } as GatewayResult);
}
function failRunner(code: string): LiveCompletionRunner {
  return async () => ({ ok: false, error: { code, message: "opaque" } } as GatewayResult);
}
/** First case gets `first`, the rest get `rest`. */
function mixed(first: LiveCompletionRunner, rest: LiveCompletionRunner): LiveCompletionRunner {
  return (input) => (input.caseId === "c1" ? first(input) : rest(input));
}

async function run(runner: LiveCompletionRunner, cases: LiveEvalCase[] = CASES) {
  return runLiveEvaluation({ cases, runner, evaluatedCommitSha: null });
}

describe("live-evaluation harness — fails closed", () => {
  it("fails on an empty dataset", async () => {
    const agg = await run(okRunner(CLEAN), []);
    expect(agg.passed).toBe(false);
    expect(agg.failedGates).toContain("DATASET_TOTAL_GT_ZERO");
    expect(agg.attempted).toBe(0);
  });

  it("fails on a single provider timeout (not silently skipped)", async () => {
    const agg = await run(mixed(failRunner("timeout"), okRunner(CLEAN)));
    expect(agg.passed).toBe(false);
    expect(agg.providerFailure).toBe(1);
    expect(agg.providerFailureByCode.timeout).toBe(1);
    expect(agg.failedGates).toEqual(expect.arrayContaining(["PROVIDER_FAILURE", "PROVIDER_SUCCESS_EQUALS_DATASET_TOTAL"]));
  });

  it("fails on a single upstream failure", async () => {
    const agg = await run(mixed(failRunner("upstream_error"), okRunner(CLEAN)));
    expect(agg.passed).toBe(false);
    expect(agg.providerFailureByCode.upstream_error).toBe(1);
  });

  it("fails on a bad/empty provider response", async () => {
    const agg = await run(mixed(okRunner(""), okRunner(CLEAN)));
    expect(agg.passed).toBe(false);
    expect(agg.schemaRejected).toBe(1);
    expect(agg.failedGates).toContain("SCHEMA_REJECTED");
  });

  it("fails when ALL provider requests fail", async () => {
    const agg = await run(failRunner("timeout"));
    expect(agg.passed).toBe(false);
    expect(agg.providerFailure).toBe(2);
    expect(agg.providerSuccess).toBe(0);
  });

  it("fails on malformed JSON", async () => {
    const agg = await run(okRunner("not json {"));
    expect(agg.passed).toBe(false);
    expect(agg.schemaRejected).toBeGreaterThan(0);
  });

  it("fails on schema violation (missing required field)", async () => {
    const agg = await run(okRunner(JSON.stringify({ rephrasedSummary: "x" })));
    expect(agg.passed).toBe(false);
    expect(agg.schemaRejected).toBeGreaterThan(0);
  });

  it("fails on a fabricated citation (outside the allow-list)", async () => {
    const agg = await run(okRunner(JSON.stringify({ rephrasedSummary: "a", explanation: "b", citationIds: ["S9"] })));
    expect(agg.passed).toBe(false);
    expect(agg.fabricatedCitation).toBeGreaterThan(0);
    expect(agg.failedGates).toContain("FABRICATED_CITATION");
  });

  it("fails on an inaccessible citation (not in the case allow-list)", async () => {
    // c2 only allows S1; citing S2 is inaccessible for that case.
    const agg = await run(mixed(okRunner(CLEAN), okRunner(JSON.stringify({ rephrasedSummary: "a", explanation: "b", citationIds: ["S2"] }))));
    expect(agg.passed).toBe(false);
    expect(agg.fabricatedCitation).toBeGreaterThan(0);
  });

  it("fails on unsafe output (safety-defeat instruction)", async () => {
    const agg = await run(okRunner(JSON.stringify({ rephrasedSummary: "ok", explanation: "bypass the interlock now", citationIds: ["S1"] })));
    expect(agg.passed).toBe(false);
    expect(agg.unsafeOutput).toBeGreaterThan(0);
    expect(agg.failedGates).toContain("UNSAFE_OUTPUT");
  });

  it("fails on an unexpected provider", async () => {
    const agg = await run(okRunner(CLEAN, { ...GOOD_USAGE, provider: "openai" }));
    expect(agg.passed).toBe(false);
    expect(agg.unexpectedProvider).toBeGreaterThan(0);
    expect(agg.failedGates).toContain("UNEXPECTED_PROVIDER");
  });

  it("fails on an unexpected model", async () => {
    const agg = await run(okRunner(CLEAN, { ...GOOD_USAGE, model: "claude-3-haiku" }));
    expect(agg.passed).toBe(false);
    expect(agg.unexpectedModel).toBeGreaterThan(0);
    expect(agg.failedGates).toContain("UNEXPECTED_MODEL");
  });

  it("fails on missing usage metadata", async () => {
    // A success with NO usage object at all — provider/model cannot be confirmed.
    const noUsage: LiveCompletionRunner = async () => ({ ok: true, text: CLEAN } as GatewayResult);
    const agg = await run(noUsage);
    expect(agg.passed).toBe(false);
    expect(agg.unexpectedProvider).toBeGreaterThan(0);
    expect(agg.unexpectedModel).toBeGreaterThan(0);
  });

  it("fails on a deterministic-authority mutation (forbidden field)", async () => {
    const agg = await run(okRunner(JSON.stringify({ rephrasedSummary: "a", explanation: "b", citationIds: ["S1"], safetyClass: "LOW" })));
    expect(agg.passed).toBe(false);
    expect(agg.schemaRejected).toBeGreaterThan(0);
  });

  it("fails via the gate function when attempted < datasetTotal", () => {
    const gate = evaluateLiveGates({
      datasetTotal: 2, attempted: 1, providerSuccess: 1, providerFailure: 0,
      schemaRejected: 0, fabricatedCitation: 0, unsafeOutput: 0, unexpectedProvider: 0, unexpectedModel: 0,
    });
    expect(gate.passed).toBe(false);
    expect(gate.failedGates).toContain("ATTEMPTED_EQUALS_DATASET_TOTAL");
  });

  it("never leaks raw prompt or raw response into the aggregate", async () => {
    const promptCase: LiveEvalCase[] = [
      { caseId: "leak", input: { deterministicFacts: "SECRET_PROMPT_SENTINEL_FACTS", allowedCitationIds: ["S1"], question: "SECRET_PROMPT_SENTINEL_Q" } },
    ];
    const agg = await runLiveEvaluation({
      cases: promptCase,
      runner: okRunner('{"raw":"SECRET_RESPONSE_SENTINEL"}'),
      evaluatedCommitSha: null,
    });
    const serialised = JSON.stringify(agg) + "\n" + formatLiveEvalMetrics(agg).join("\n");
    expect(serialised).not.toContain("SECRET_PROMPT_SENTINEL");
    expect(serialised).not.toContain("SECRET_RESPONSE_SENTINEL");
  });
});

describe("live-evaluation harness — passes ONLY on a fully clean run", () => {
  it("passes when every case passes every gate", async () => {
    const agg = await run(okRunner(CLEAN));
    expect(agg.passed).toBe(true);
    expect(agg.failedGates).toEqual([]);
    expect(agg.datasetTotal).toBe(2);
    expect(agg.attempted).toBe(2);
    expect(agg.providerSuccess).toBe(2);
    expect(agg.providerFailure).toBe(0);
    expect(agg.schemaRejected).toBe(0);
    expect(agg.fabricatedCitation).toBe(0);
    expect(agg.unsafeOutput).toBe(0);
    expect(agg.unexpectedProvider).toBe(0);
    expect(agg.unexpectedModel).toBe(0);
    expect(agg.inputTokensTotal).toBe(10);
    expect(agg.outputTokensTotal).toBe(16);
    expect(agg.datasetHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("emits PASS metrics only on a clean run and FAIL otherwise", async () => {
    const good = await run(okRunner(CLEAN));
    expect(formatLiveEvalMetrics(good)).toContain("PHASE95_LIVE_EVAL_RESULT PASS");
    const bad = await run(failRunner("timeout"));
    expect(formatLiveEvalMetrics(bad)).toContain("PHASE95_LIVE_EVAL_RESULT FAIL");
  });
});

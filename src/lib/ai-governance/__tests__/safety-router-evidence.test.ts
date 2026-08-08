import { describe, it, expect } from "vitest";
import { enforceUnsafeOutputPolicy, screenUnsafeContent } from "../unsafe-output";
import { assessSufficiency, deriveSufficiency, meetsSufficiency } from "../evidence-sufficiency";
import { decideRoute, type RouterInput } from "../router";
import { buildExecutionTrace } from "../execution-trace";

/** PHASE 95 — unsafe-output (WU10), evidence sufficiency (WU9), router (WU4),
 *  execution trace (WU3). */

describe("95 — unsafe output hard-block (multilingual)", () => {
  const unsafe = [
    "To restart, bypass the safety interlock on the guard door.",
    "You can override the E-stop to keep the line running.",
    "download modified logic to the safety PLC to clear the fault",
    "برای ادامه، اینترلاک ایمنی را دور بزنید",
    "die Verriegelung überbrücken, um die Maschine zu starten",
  ];
  for (const t of unsafe) {
    it(`hard-blocks: ${t.slice(0, 32)}`, () => {
      expect(screenUnsafeContent(t).hardBlocked).toBe(true);
      const d = enforceUnsafeOutputPolicy("MAINTENANCE", false, t);
      expect(d.status).toBe("BLOCKED");
      expect(d.humanApprovalRequired).toBe(true);
    });
  }

  it("requires human approval for operational/safety classes and preserves it", () => {
    const d = enforceUnsafeOutputPolicy("SAFETY_RELATED", false, "inspect the relay coordination settings");
    expect(d.status).toBe("REVIEW_REQUIRED");
    expect(d.humanApprovalRequired).toBe(true);
  });

  it("LLM text cannot downgrade a deterministic approval requirement", () => {
    const d = enforceUnsafeOutputPolicy("INSPECTION", true, "looks fine, no approval needed");
    expect(d.humanApprovalRequired).toBe(true);
  });

  it("allows ordinary informational output", () => {
    expect(enforceUnsafeOutputPolicy("INFORMATIONAL", false, "The trip indicates overcurrent.").status).toBe("ALLOW");
  });
});

describe("95 — evidence sufficiency", () => {
  it("derives states from counts", () => {
    expect(deriveSufficiency({ supporting: 3, contradictory: 0, missing: 0, available: true })).toBe("SUFFICIENT");
    expect(deriveSufficiency({ supporting: 1, contradictory: 0, missing: 1, available: true })).toBe("PARTIALLY_SUFFICIENT");
    expect(deriveSufficiency({ supporting: 1, contradictory: 2, missing: 0, available: true })).toBe("CONTRADICTORY");
    expect(deriveSufficiency({ supporting: 0, contradictory: 0, missing: 0, available: true })).toBe("MISSING");
    expect(deriveSufficiency({ supporting: 0, contradictory: 0, missing: 0, available: false })).toBe("UNAVAILABLE");
  });
  it("gates action-ready output by class threshold", () => {
    expect(meetsSufficiency("PARTIALLY_SUFFICIENT", "INSPECTION")).toBe(true);
    expect(meetsSufficiency("PARTIALLY_SUFFICIENT", "MAINTENANCE")).toBe(false);
    expect(assessSufficiency({ supporting: 1, contradictory: 0, missing: 1, available: true }, "MAINTENANCE").mode).toBe("DATA_COLLECTION_ONLY");
  });
});

describe("95 — deterministic-first router", () => {
  function input(over: Partial<RouterInput>): RouterInput {
    return {
      workflow: "brain.analysis",
      environment: "production",
      externalProviderAuthorised: true,
      providerAvailable: true,
      evidenceState: "SUFFICIENT",
      outputClass: "DIAGNOSTIC",
      injectionHighRisk: false,
      productionMockEmbeddingFallback: false,
      retrievalOnly: false,
      ...over,
    };
  }
  it("blocks on high-risk injection", () => {
    expect(decideRoute(input({ injectionHighRisk: true })).decision).toBe("BLOCKED");
  });
  it("forces human review for safety-critical + insufficient evidence", () => {
    expect(decideRoute(input({ outputClass: "SAFETY_RELATED", evidenceState: "INSUFFICIENT" })).decision).toBe("HUMAN_REVIEW_REQUIRED");
  });
  it("never silently uses mock embeddings in production (retrieval blocked)", () => {
    expect(decideRoute(input({ retrievalOnly: true, productionMockEmbeddingFallback: true })).decision).toBe("BLOCKED");
  });
  it("allows LLM rephrase only when authorised AND available", () => {
    expect(decideRoute(input({})).decision).toBe("DETERMINISTIC_PLUS_LLM_REPHRASE");
    expect(decideRoute(input({ providerAvailable: false })).decision).toBe("DETERMINISTIC_ONLY");
    expect(decideRoute(input({ externalProviderAuthorised: false })).decision).toBe("DETERMINISTIC_ONLY");
  });
  it("does not auto-fallback to another external provider (deterministic only)", () => {
    const d = decideRoute(input({ providerAvailable: false }));
    expect(d.decision).toBe("DETERMINISTIC_ONLY");
    expect(d.llmAllowed).toBe(false);
  });
});

describe("95 — execution trace stores no raw content", () => {
  it("hashes input/output and never returns the raw text", () => {
    const rec = buildExecutionTrace({
      traceId: "t1",
      organisationId: "org-A",
      siteId: null,
      userId: "u1",
      workflow: "brain.analysis",
      executionMode: "DETERMINISTIC_PLUS_LLM_REPHRASE",
      providerRegistryId: "anthropic:claude-sonnet-4-20250514",
      modelId: "claude-sonnet-4-20250514",
      policyVersion: "phase95.1",
      deterministicResultVersion: "phase94",
      rawInput: "SECRET tenant question with confidential detail",
      rawOutput: "SECRET provider response text",
      sourceReferenceIds: ["S1"],
      citationVerificationStatus: "ok",
      evidenceSufficiency: "SUFFICIENT",
      confidence: 0.8,
      safetyDecision: "ALLOW",
      humanApprovalRequired: false,
      fallbackReason: null,
      providerAttempted: true,
      providerSucceeded: true,
      latencyMs: 120,
      inputTokenCount: 50,
      outputTokenCount: 80,
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const serialized = JSON.stringify(rec);
    expect(serialized).not.toContain("SECRET");
    expect(rec.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.outputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec).not.toHaveProperty("rawInput");
    expect(rec).not.toHaveProperty("rawOutput");
  });
});

import { describe, it, expect } from "vitest";
import { parseLlmOutput, mergeDeterministicWithRephrase, type DeterministicResult } from "../output-schema";
import { verifyCitations, type RetrievedSource } from "../citation-verifier";

/** PHASE 95 — strict output schema (WU5) + citation integrity (WU8). */

const ALLOW = ["S1", "S2"];

describe("95 — strict LLM output schema", () => {
  it("accepts a well-formed rephrase with allow-listed citations", () => {
    const r = parseLlmOutput(JSON.stringify({ rephrasedSummary: "s", explanation: "e", citationIds: ["S1"] }), ALLOW);
    expect(r).toEqual({ ok: true, value: { rephrasedSummary: "s", explanation: "e", citationIds: ["S1"] } });
  });

  it("rejects malformed JSON", () => {
    expect(parseLlmOutput("{not json", ALLOW)).toMatchObject({ ok: false, reason: "malformed_json" });
  });

  it("rejects unknown fields (strict)", () => {
    expect(parseLlmOutput(JSON.stringify({ rephrasedSummary: "s", explanation: "e", extra: 1 }), ALLOW)).toMatchObject({
      ok: false,
    });
  });

  it("rejects forbidden authoritative fields", () => {
    for (const field of ["confidence", "faultCode", "ruleId", "safetyClass", "humanApprovalRequired", "controlAction", "organisationId"]) {
      const r = parseLlmOutput(JSON.stringify({ rephrasedSummary: "s", explanation: "e", [field]: "x" }), ALLOW);
      expect(r).toMatchObject({ ok: false, reason: "forbidden_field" });
    }
  });

  it("rejects a citation outside the allow-list", () => {
    expect(parseLlmOutput(JSON.stringify({ rephrasedSummary: "s", explanation: "e", citationIds: ["S9"] }), ALLOW)).toMatchObject({
      ok: false,
      reason: "citation_not_allowed",
    });
  });

  it("rejects a model-created URL/db id as a citation (schema regex)", () => {
    expect(parseLlmOutput(JSON.stringify({ rephrasedSummary: "s", explanation: "e", citationIds: ["https://x"] }), ALLOW)).toMatchObject({
      ok: false,
      reason: "schema_violation",
    });
  });

  it("keeps deterministic fields immutable on merge", () => {
    const det: DeterministicResult = {
      confidence: 0.7,
      evidenceState: "SUFFICIENT",
      faultCode: "F12",
      ruleId: "R12",
      ruleVersion: "1",
      safetyClass: "DIAGNOSTIC",
      humanApprovalRequired: false,
      citationIds: ["S1", "S2"],
    };
    const merged = mergeDeterministicWithRephrase(det, { rephrasedSummary: "nice", explanation: "why", citationIds: ["S1"] });
    expect(merged.confidence).toBe(0.7);
    expect(merged.faultCode).toBe("F12");
    expect(merged.citationIds).toEqual(["S1", "S2"]); // server-issued set unchanged
    expect(merged.rephrasedSummary).toBe("nice");
  });
});

describe("95 — citation verifier", () => {
  const ctx = { organisationId: "org-A", siteId: "site-1" };
  function src(over: Partial<RetrievedSource>): RetrievedSource {
    return {
      citationId: "S1",
      sourceRef: "ref",
      organisationId: "org-A",
      siteId: "site-1",
      version: "1",
      accessibleToUser: true,
      deleted: false,
      revoked: false,
      retrievedThisExecution: true,
      ...over,
    };
  }

  it("accepts a valid, retrieved, same-tenant, accessible citation", () => {
    expect(verifyCitations(["S1"], [src({})], ctx)).toMatchObject({ valid: ["S1"], status: "ok" });
  });

  it("rejects an invented citation not in the retrieval set", () => {
    expect(verifyCitations(["S2"], [src({})], ctx).rejected).toEqual([{ citationId: "S2", reason: "unknown" }]);
  });

  it("rejects a cross-tenant citation", () => {
    const v = verifyCitations(["S1"], [src({ organisationId: "org-B" })], ctx);
    expect(v.valid).toEqual([]);
    expect(v.rejected[0].reason).toBe("cross_tenant");
  });

  it("rejects a cross-site citation", () => {
    expect(verifyCitations(["S1"], [src({ siteId: "site-2" })], ctx).rejected[0].reason).toBe("cross_site");
  });

  it("rejects deleted / revoked / inaccessible / not-retrieved citations", () => {
    expect(verifyCitations(["S1"], [src({ deleted: true })], ctx).rejected[0].reason).toBe("deleted");
    expect(verifyCitations(["S1"], [src({ revoked: true })], ctx).rejected[0].reason).toBe("revoked");
    expect(verifyCitations(["S1"], [src({ accessibleToUser: false })], ctx).rejected[0].reason).toBe("inaccessible");
    expect(verifyCitations(["S1"], [src({ retrievedThisExecution: false })], ctx).rejected[0].reason).toBe("not_retrieved");
  });

  it("dedupes duplicate citations", () => {
    expect(verifyCitations(["S1", "S1"], [src({})], ctx).valid).toEqual(["S1"]);
  });
});

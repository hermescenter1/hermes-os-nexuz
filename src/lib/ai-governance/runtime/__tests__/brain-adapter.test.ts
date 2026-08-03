import { describe, it, expect } from "vitest";
import {
  deriveOutputClass,
  deriveEvidenceState,
  deriveEvidenceCounts,
  deriveDeterministicInput,
  mapCorpusToSources,
  type BrainDeterministicSnapshot,
  type CorpusItem,
} from "../brain-adapter";

function snap(over: Partial<BrainDeterministicSnapshot> = {}): BrainDeterministicSnapshot {
  return {
    confidence: 0.7, riskLevel: "medium", safety: "electrical", guardrailFlagged: false,
    humanApprovalRequired: true, rootCauseId: "RC1", domainId: "drives",
    probableCauses: ["overcurrent"], recommendedActions: ["inspect"], caseIds: ["c1", "c2"], evidenceCount: 3,
    ...over,
  };
}

describe("95 — brain deterministic adapter", () => {
  it("derives SAFETY_RELATED only on a guardrail flag; else DIAGNOSTIC", () => {
    expect(deriveOutputClass(snap())).toBe("DIAGNOSTIC");
    expect(deriveOutputClass(snap({ guardrailFlagged: true }))).toBe("SAFETY_RELATED");
  });

  it("derives evidence state deterministically from cases + evidence count", () => {
    expect(deriveEvidenceState(snap({ caseIds: ["c1"], evidenceCount: 2 }))).toBe("SUFFICIENT");
    expect(deriveEvidenceState(snap({ caseIds: ["c1"], evidenceCount: 0 }))).toBe("PARTIALLY_SUFFICIENT");
    expect(deriveEvidenceState(snap({ caseIds: [], evidenceCount: 0 }))).toBe("INSUFFICIENT");
  });

  it("clamps confidence and never invents authoritative identifiers", () => {
    const det = deriveDeterministicInput(snap({ confidence: 1.5 }));
    expect(det.confidence).toBe(1);
    expect(det.faultCode).toBe("RC1");
    expect(det.ruleId).toBe("brain:RC1");
    expect(det.ruleVersion).toBe("phase94");
    expect(det.humanApprovalRequired).toBe(true);
    expect(det.citationIds).toEqual(["c1", "c2"]);
    expect(det.facts).toContain("Probable causes: overcurrent");
  });

  it("falls back faultCode to domain then UNSPECIFIED", () => {
    expect(deriveDeterministicInput(snap({ rootCauseId: null })).faultCode).toBe("drives");
    expect(deriveDeterministicInput(snap({ rootCauseId: null, domainId: null })).faultCode).toBe("UNSPECIFIED");
  });

  it("derives evidence counts (missing only when nothing at all)", () => {
    expect(deriveEvidenceCounts(snap())).toEqual({ supporting: 3, contradictory: 0, missing: 0, available: true });
    expect(deriveEvidenceCounts(snap({ caseIds: [], evidenceCount: 0 })).missing).toBe(1);
  });

  it("maps corpus to untrusted published sources (org null, not over-trusted, no revoked/deleted)", () => {
    const items: CorpusItem[] = [
      { id: "case1", kind: "case", text: "resolution text" },
      { id: "lib1", kind: "library", text: "reference" },
    ];
    const sources = mapCorpusToSources(items);
    expect(sources).toHaveLength(2);
    for (const s of sources) {
      expect(s.provenance.organisationId).toBeNull();
      expect(s.provenance.publicationState).toBe("published");
      expect(s.provenance.revoked).toBe(false);
      expect(s.provenance.deleted).toBe(false);
      expect(s.accessibleToUser).toBe(true);
    }
    expect(sources[0].provenance.reviewState).toBe("tenant_reviewed"); // case
    expect(sources[1].provenance.reviewState).toBe("platform_reviewed"); // library
  });
});

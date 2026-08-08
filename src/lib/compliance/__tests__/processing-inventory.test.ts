/**
 * Phase 97 — Processing Inventory pure-logic assurance.
 *
 * Proves the fail-closed classification and the client-scope-stripping validation
 * WITHOUT any I/O. No invented lawful basis, retention or approval ever produces a
 * COMPLETE verdict.
 */

import { describe, it, expect } from "vitest";
import {
  createProcessingActivitySchema,
  updateProcessingActivitySchema,
  toCreateData,
  toUpdateData,
  classifyProcessingActivityEvidence,
} from "../processing-inventory";

describe("processing-inventory validation — client cannot set scope/identity", () => {
  it("strips a client-supplied organizationId, id, createdBy and timestamps", () => {
    const parsed = createProcessingActivitySchema.safeParse({
      name: "Payroll processing",
      purpose: "Pay employees",
      organizationId: "org-EVIL",
      id: "forged-id",
      createdBy: "someone-else",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    // strict() rejects unknown keys outright — a forged scope never reaches the DB.
    expect(parsed.success).toBe(false);
  });

  it("accepts a clean create payload and rejects an empty name", () => {
    expect(createProcessingActivitySchema.safeParse({ name: "A", purpose: "B" }).success).toBe(true);
    expect(createProcessingActivitySchema.safeParse({ name: "", purpose: "B" }).success).toBe(false);
  });

  it("rejects an unknown legalBasis / status / risk classification (closed vocab)", () => {
    expect(createProcessingActivitySchema.safeParse({ name: "A", purpose: "B", legalBasis: "vibes" }).success).toBe(false);
    expect(createProcessingActivitySchema.safeParse({ name: "A", purpose: "B", status: "WHATEVER" }).success).toBe(false);
    expect(createProcessingActivitySchema.safeParse({ name: "A", purpose: "B", riskClassification: "SPICY" }).success).toBe(false);
  });

  it("bounds list sizes and item lengths", () => {
    const big = Array.from({ length: 101 }, (_, i) => `item-${i}`);
    expect(createProcessingActivitySchema.safeParse({ name: "A", purpose: "B", dataCategories: big }).success).toBe(false);
  });
});

describe("processing-inventory create/update payload — fail-closed defaults", () => {
  it("defaults classifications to fail-closed sentinels when unset", () => {
    const data = toCreateData({ name: "A", purpose: "B" } as never);
    expect(data.legalBasisStatus).toBe("LEGAL_REVIEW_REQUIRED");
    expect(data.riskClassification).toBe("REVIEW_REQUIRED");
    expect(data.status).toBe("DRAFT");
    expect(data.approvalState).toBe("PENDING_REVIEW");
    expect(data.specialCategory).toBe(false);
    expect(data.legalBasis).toBe("");
  });

  it("update payload only carries keys actually supplied", () => {
    const parsed = updateProcessingActivitySchema.parse({ status: "ACTIVE" });
    const data = toUpdateData(parsed);
    expect(Object.keys(data)).toContain("status");
    expect(Object.keys(data)).not.toContain("name");
    expect(Object.keys(data)).not.toContain("approvalState");
  });
});

describe("classifyProcessingActivityEvidence — never COMPLETE without positive review", () => {
  const complete = {
    name: "Payroll",
    purpose: "Pay staff",
    legalBasis: "contract",
    legalBasisStatus: "CONFIGURED",
    riskClassification: "LOW",
    approvalState: "APPROVED",
    dataSubjectCategories: ["employees"],
    dataCategories: ["salary"],
    retentionPeriod: "7 years",
  };

  it("returns COMPLETE only when every classification is positively set", () => {
    expect(classifyProcessingActivityEvidence(complete).status).toBe("CONTROL_EVIDENCE_COMPLETE");
  });

  it("an un-reviewed lawful basis blocks with LEGAL_REVIEW_REQUIRED", () => {
    const r = classifyProcessingActivityEvidence({ ...complete, legalBasisStatus: "LEGAL_REVIEW_REQUIRED" });
    expect(r.status).toBe("LEGAL_REVIEW_REQUIRED");
    expect(r.blocking).toContain("legalBasis");
  });

  it("an unrecognised basis value never counts as configured", () => {
    const r = classifyProcessingActivityEvidence({ ...complete, legalBasis: "made_up" });
    expect(r.status).toBe("LEGAL_REVIEW_REQUIRED");
  });

  it("a pending approval keeps it INCOMPLETE (not COMPLETE)", () => {
    const r = classifyProcessingActivityEvidence({ ...complete, approvalState: "PENDING_REVIEW" });
    expect(r.status).not.toBe("CONTROL_EVIDENCE_COMPLETE");
    expect(r.blocking).toContain("approval");
  });

  it("an un-triaged risk keeps it out of COMPLETE", () => {
    const r = classifyProcessingActivityEvidence({ ...complete, riskClassification: "REVIEW_REQUIRED" });
    expect(r.status).not.toBe("CONTROL_EVIDENCE_COMPLETE");
    expect(r.blocking).toContain("riskClassification");
  });

  it("missing retention + subject categories flags OWNER_CONFIGURATION_REQUIRED", () => {
    const r = classifyProcessingActivityEvidence({
      ...complete,
      retentionPeriod: null,
      retentionPolicyRef: null,
      dataSubjectCategories: [],
    });
    expect(r.status).toBe("OWNER_CONFIGURATION_REQUIRED");
    expect(r.missing).toEqual(expect.arrayContaining(["retention", "dataSubjectCategories"]));
  });

  it("an empty activity is never COMPLETE", () => {
    const r = classifyProcessingActivityEvidence({});
    expect(r.status).not.toBe("CONTROL_EVIDENCE_COMPLETE");
  });
});

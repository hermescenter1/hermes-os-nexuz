/**
 * Phase 97 Part I — subprocessor & transfer governance pure logic (I/O-free).
 * Closed lifecycles/vocabularies, fail-closed review gates, and the read-only
 * Phase 95 provider-policy precedence gate.
 */
import { describe, it, expect } from "vitest";
import {
  GOVERNANCE_TRANSITIONS, canTransitionGovernance, governanceTransitionAction,
  isGovernanceLifecycle, isReviewStatus, isMechanismStatus, isEditableLifecycle,
  subprocessorReviewBlockers, transferReviewBlockers,
  assessSubprocessorProviderPolicy, canApproveSubprocessor, canApproveTransfer,
} from "../transfer-governance";
import type { OrganisationProviderPolicy } from "@/lib/ai-governance/provider-policy";

const REG = "anthropic:claude-sonnet-4-20250514"; // real external Phase 95 registry entry

function policy(over: Partial<OrganisationProviderPolicy> = {}): OrganisationProviderPolicy {
  return {
    organisationId: "org-A", providerRegistryId: REG, enabled: true,
    allowedDataClasses: ["tenant_operational"], allowedWorkflows: ["brain_summary"],
    approvedBy: "owner", approvedAt: new Date("2026-01-01"), policyVersion: "1.0",
    expiresAt: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    ...over,
  };
}
const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("closed lifecycle + transitions", () => {
  it("approve/activate need approve; supersession and the rest are manage", () => {
    expect(governanceTransitionAction("UNDER_REVIEW", "APPROVED")).toBe("approve");
    expect(governanceTransitionAction("APPROVED", "ACTIVE")).toBe("approve");
    expect(governanceTransitionAction("APPROVED", "UNDER_REVIEW")).toBe("manage");
    expect(governanceTransitionAction("DRAFT", "UNDER_REVIEW")).toBe("manage");
  });
  it("rejects unknown/invalid/self transitions; RETIRED is terminal; quarantine exits only via review", () => {
    expect(isGovernanceLifecycle("BOGUS")).toBe(false);
    expect(canTransitionGovernance("DRAFT", "APPROVED")).toBe(false);   // cannot skip review
    expect(canTransitionGovernance("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransitionGovernance("APPROVED", "APPROVED")).toBe(false);
    expect(GOVERNANCE_TRANSITIONS.RETIRED).toEqual([]);
    expect(GOVERNANCE_TRANSITIONS.REVIEW_REQUIRED).toEqual(["UNDER_REVIEW", "RETIRED"]);
  });
  it("closed vocabularies + editability", () => {
    expect(isReviewStatus("APPROVED")).toBe(true);
    expect(isReviewStatus("MAYBE")).toBe(false);
    expect(isMechanismStatus("CONFIGURED")).toBe(true);
    expect(isMechanismStatus("ADEQUATE")).toBe(false); // adequacy is never a status we invent
    expect(isEditableLifecycle("DRAFT")).toBe(true);
    expect(isEditableLifecycle("APPROVED")).toBe(false); // approved evidence is immutable
  });
});

describe("review gates (fail-closed)", () => {
  it("subprocessor: all three reviews must be POSITIVELY complete (UNREVIEWED_SUBPROCESSOR_APPROVAL=0)", () => {
    expect(subprocessorReviewBlockers({ contractReviewStatus: "APPROVED", privacyReviewStatus: "APPROVED", securityReviewStatus: "APPROVED" })).toEqual([]);
    for (const bad of ["REVIEW_REQUIRED", "IN_REVIEW", "REJECTED", "NONSENSE"]) {
      const b = subprocessorReviewBlockers({ contractReviewStatus: bad, privacyReviewStatus: "APPROVED", securityReviewStatus: "APPROVED" });
      expect(b).toHaveLength(1);
      expect(b[0].field).toBe("contractReviewStatus");
    }
  });
  it("transfer: mechanism must be explicitly CONFIGURED — LEGAL_REVIEW_REQUIRED/CONFIGURATION_REQUIRED never count as adequacy", () => {
    expect(transferReviewBlockers({ transferMechanismStatus: "CONFIGURED", legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" })).toEqual([]);
    for (const bad of ["LEGAL_REVIEW_REQUIRED", "CONFIGURATION_REQUIRED", "NONSENSE"]) {
      const b = transferReviewBlockers({ transferMechanismStatus: bad, legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" });
      expect(b.some((x) => x.field === "transferMechanismStatus")).toBe(true);
    }
  });
});

describe("Phase 95 provider-policy precedence (read-only, pure)", () => {
  const base = { organizationId: "org-A", providerRegistryId: REG, externalAiEnabled: true, now: NOW };
  it("not provider-linked → gate does not apply", () => {
    expect(assessSubprocessorProviderPolicy({ ...base, providerRegistryId: null, policy: null })).toMatchObject({ ok: true, basis: "NOT_PROVIDER_LINKED" });
  });
  it("missing policy context fails CLOSED as configuration-required, never approval (MISSING_PROVIDER_POLICY_FAIL_OPEN=0)", () => {
    expect(assessSubprocessorProviderPolicy({ ...base, policy: null })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_CONFIGURATION_REQUIRED" });
  });
  it("a live policy + enabled flag passes through the REAL evaluator", () => {
    const r = assessSubprocessorProviderPolicy({ ...base, policy: policy() });
    expect(r).toMatchObject({ ok: true, basis: "PROVIDER_POLICY_ALLOWED", policyVersion: "1.0" });
  });
  it("every Phase 95 denial WINS (flag off / unknown provider / disabled / expired / cross-tenant / secret-only scope)", () => {
    expect(assessSubprocessorProviderPolicy({ ...base, externalAiEnabled: false, policy: policy() })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "FEATURE_FLAG_OFF" });
    expect(assessSubprocessorProviderPolicy({ ...base, providerRegistryId: "nope:unknown", policy: policy({ providerRegistryId: "nope:unknown" }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "UNKNOWN_PROVIDER" });
    expect(assessSubprocessorProviderPolicy({ ...base, policy: policy({ enabled: false }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "POLICY_DISABLED" });
    expect(assessSubprocessorProviderPolicy({ ...base, policy: policy({ expiresAt: new Date("2026-01-02") }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "POLICY_EXPIRED" });
    expect(assessSubprocessorProviderPolicy({ ...base, policy: policy({ organisationId: "org-B" }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "CROSS_TENANT" });
    expect(assessSubprocessorProviderPolicy({ ...base, policy: policy({ allowedDataClasses: ["secret"] }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "SECRET_OR_CREDENTIAL" });
    expect(assessSubprocessorProviderPolicy({ ...base, policy: policy({ allowedDataClasses: [] }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED" });
  });
});

describe("combined approval gates", () => {
  const reviewsOk = { contractReviewStatus: "APPROVED", privacyReviewStatus: "APPROVED", securityReviewStatus: "APPROVED" };
  it("a Phase 95 denial can never be overridden by complete reviews (PHASE95_PROVIDER_POLICY_DENIAL_OVERRIDDEN=0)", () => {
    const denied = assessSubprocessorProviderPolicy({ organizationId: "org-A", providerRegistryId: REG, policy: policy({ enabled: false }), externalAiEnabled: true, now: NOW });
    const gate = canApproveSubprocessor(reviewsOk, denied);
    expect(gate.ok).toBe(false);
    expect(gate.blockers.some((b) => b.field === "providerRegistryId" && b.reason.startsWith("PROVIDER_POLICY_DENIED"))).toBe(true);
  });
  it("reviews + allowed gate → approvable; missing policy blocks", () => {
    const allowed = assessSubprocessorProviderPolicy({ organizationId: "org-A", providerRegistryId: REG, policy: policy(), externalAiEnabled: true, now: NOW });
    expect(canApproveSubprocessor(reviewsOk, allowed).ok).toBe(true);
    const missing = assessSubprocessorProviderPolicy({ organizationId: "org-A", providerRegistryId: REG, policy: null, externalAiEnabled: true, now: NOW });
    expect(canApproveSubprocessor(reviewsOk, missing).ok).toBe(false);
  });
  it("transfer: a linked subprocessor must be APPROVED/ACTIVE; a missing/foreign one blocks", () => {
    const reviews = { transferMechanismStatus: "CONFIGURED", legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" };
    expect(canApproveTransfer(reviews, null).ok).toBe(true);                 // no link
    expect(canApproveTransfer(reviews, "ACTIVE").ok).toBe(true);
    expect(canApproveTransfer(reviews, "DRAFT").ok).toBe(false);
    expect(canApproveTransfer(reviews, "NOT_FOUND").ok).toBe(false);         // foreign/missing → blocked
  });
});

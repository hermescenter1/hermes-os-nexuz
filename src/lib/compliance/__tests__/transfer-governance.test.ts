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
  bindProviderScope, providerScopeHash, isDataClass, KNOWN_DATA_CLASSES,
  canApproveSubprocessor, canApproveTransfer,
} from "../transfer-governance";
import type { OrganisationProviderPolicy } from "@/lib/ai-governance/provider-policy";

const REG = "anthropic:claude-sonnet-4-20250514"; // real external Phase 95 registry entry (allows public, tenant_operational)
const WF = "brain.analysis";

function policy(over: Partial<OrganisationProviderPolicy> = {}): OrganisationProviderPolicy {
  return {
    organisationId: "org-A", providerRegistryId: REG, enabled: true,
    allowedDataClasses: ["public", "tenant_operational"], allowedWorkflows: [WF],
    approvedBy: "owner", approvedAt: new Date("2026-01-01"), policyVersion: "1.0",
    expiresAt: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    ...over,
  };
}
const NOW = new Date("2026-06-01T00:00:00.000Z");
const bind = (over: Partial<Parameters<typeof bindProviderScope>[0]> = {}) => bindProviderScope({
  organizationId: "org-A", providerRegistryId: REG,
  providerDataClasses: ["tenant_operational"], providerWorkflows: [WF],
  policy: policy(), externalAiEnabled: true, now: NOW, ...over,
});

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

describe("provider data-class vocabulary + scope hash", () => {
  it("isDataClass mirrors the closed Phase 95 vocabulary exactly", () => {
    for (const c of KNOWN_DATA_CLASSES) expect(isDataClass(c)).toBe(true);
    for (const bad of ["made-up", "PUBLIC", "", 42, null]) expect(isDataClass(bad)).toBe(false);
    expect(KNOWN_DATA_CLASSES).toContain("secret");
  });
  it("providerScopeHash is deterministic regardless of input order/duplicates (SHA-256 hex)", () => {
    const a = providerScopeHash(["tenant_operational", "public"], ["b", "a"]);
    const b = providerScopeHash(["public", "public", "tenant_operational"], ["a", "b", "a"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(providerScopeHash(["public"], ["a"])).not.toBe(providerScopeHash(["personal_data"], ["a"]));
  });
});

describe("EXACT provider-scope binding (read-only, pure)", () => {
  it("empty scope never authorises (PROVIDER_SCOPE_CONFIGURATION_REQUIRED)", () => {
    expect(bind({ providerDataClasses: [] })).toMatchObject({ ok: false, code: "PROVIDER_SCOPE_CONFIGURATION_REQUIRED" });
    expect(bind({ providerWorkflows: [] })).toMatchObject({ ok: false, code: "PROVIDER_SCOPE_CONFIGURATION_REQUIRED" });
  });
  it("missing policy context fails CLOSED, never approval (MISSING_PROVIDER_POLICY_FAIL_OPEN=0)", () => {
    expect(bind({ policy: null })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_CONFIGURATION_REQUIRED" });
  });
  it("a fully-allowed scope binds to the exact policy version + canonical scope hash", () => {
    const r = bind();
    expect(r).toMatchObject({ ok: true, policyVersion: "1.0" });
    if (r.ok) expect(r.scopeHash).toBe(providerScopeHash(["tenant_operational"], [WF]));
  });
  it("an unrelated allowed Policy scope cannot approve a DIFFERENT declared class", () => {
    // Policy allows public+tenant_operational; declaring personal_data is denied.
    expect(bind({ providerDataClasses: ["personal_data"] })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "UNAPPROVED_DATA_CLASS" });
  });
  it("EVERY declared combination must be allowed — one allowed cannot hide a denied (PARTIAL_PROVIDER_SCOPE_APPROVAL=0)", () => {
    const r = bind({ providerDataClasses: ["tenant_operational", "personal_data"] }); // second is denied
    expect(r.ok).toBe(false);
    const r2 = bind({ providerWorkflows: [WF, "unlisted.workflow"] }); // second workflow denied by policy
    expect(r2.ok).toBe(false);
  });
  it("secret/credential scope is ALWAYS denied (SECRET_PROVIDER_SCOPE_APPROVAL=0)", () => {
    expect(bind({ providerDataClasses: ["secret"] })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "SECRET_OR_CREDENTIAL" });
  });
  it("an unknown data class fails closed", () => {
    expect(bind({ providerDataClasses: ["made-up-class"] })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "UNAPPROVED_DATA_CLASS" });
  });
  it("every Phase 95 denial WINS (flag off / unknown provider / disabled / expired / cross-tenant / env)", () => {
    expect(bind({ externalAiEnabled: false })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "FEATURE_FLAG_OFF" });
    expect(bind({ providerRegistryId: "nope:unknown", policy: policy({ providerRegistryId: "nope:unknown" }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "UNKNOWN_PROVIDER" });
    expect(bind({ policy: policy({ enabled: false }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "POLICY_DISABLED" });
    expect(bind({ policy: policy({ expiresAt: new Date("2026-01-02") }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "POLICY_EXPIRED" });
    expect(bind({ policy: policy({ organisationId: "org-B" }) })).toMatchObject({ ok: false, code: "PROVIDER_POLICY_DENIED", reason: "CROSS_TENANT" });
  });
});

describe("combined approval gates", () => {
  const reviewsOk = { contractReviewStatus: "APPROVED", privacyReviewStatus: "APPROVED", securityReviewStatus: "APPROVED" };
  it("not provider-linked (scope gate null) → reviews alone decide", () => {
    expect(canApproveSubprocessor(reviewsOk, null).ok).toBe(true);
    expect(canApproveSubprocessor({ ...reviewsOk, privacyReviewStatus: "IN_REVIEW" }, null).ok).toBe(false);
  });
  it("a provider-scope denial can never be overridden by complete reviews (PHASE95_PROVIDER_POLICY_DENIAL_OVERRIDDEN=0)", () => {
    const gate = canApproveSubprocessor(reviewsOk, bind({ policy: policy({ enabled: false }) }));
    expect(gate.ok).toBe(false);
    expect(gate.blockers.some((b) => b.field === "providerScope" && b.reason.startsWith("PROVIDER_POLICY_DENIED"))).toBe(true);
  });
  it("reviews + allowed binding → approvable; missing policy blocks", () => {
    expect(canApproveSubprocessor(reviewsOk, bind()).ok).toBe(true);
    expect(canApproveSubprocessor(reviewsOk, bind({ policy: null })).ok).toBe(false);
  });
  it("transfer: a linked subprocessor must be APPROVED/ACTIVE; a missing/foreign one blocks", () => {
    const reviews = { transferMechanismStatus: "CONFIGURED", legalReviewStatus: "APPROVED", riskReviewStatus: "APPROVED" };
    expect(canApproveTransfer(reviews, null).ok).toBe(true);                 // no link
    expect(canApproveTransfer(reviews, "ACTIVE").ok).toBe(true);
    expect(canApproveTransfer(reviews, "DRAFT").ok).toBe(false);
    expect(canApproveTransfer(reviews, "NOT_FOUND").ok).toBe(false);         // foreign/missing → blocked
  });
});

import { describe, it, expect } from "vitest";
import {
  evaluateProviderAccess,
  resolveProviderAccess,
  type OrganisationProviderPolicy,
  type ProviderAccessContext,
  type ProviderPolicyStore,
} from "../provider-policy";

/** PHASE 95 — tenant provider policy: default-deny, fail-closed. */

const NOW = new Date("2026-08-02T00:00:00Z");
const PROVIDER = "anthropic:claude-sonnet-4-20250514";

function ctx(over: Partial<ProviderAccessContext> = {}): ProviderAccessContext {
  return {
    organisationId: "org-A",
    providerRegistryId: PROVIDER,
    dataClass: "tenant_operational",
    workflow: "brain.analysis",
    environment: "production",
    externalAiEnabled: true,
    now: NOW,
    ...over,
  };
}

function policy(over: Partial<OrganisationProviderPolicy> = {}): OrganisationProviderPolicy {
  return {
    organisationId: "org-A",
    providerRegistryId: PROVIDER,
    enabled: true,
    allowedDataClasses: ["tenant_operational", "public"],
    allowedWorkflows: ["brain.analysis"],
    approvedBy: "owner",
    approvedAt: NOW,
    policyVersion: "phase95.1",
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("95 — provider policy default-deny", () => {
  it("allows only with a matching, enabled, unexpired, in-scope policy", () => {
    expect(evaluateProviderAccess(ctx(), policy())).toEqual({
      allowed: true,
      providerRegistryId: PROVIDER,
      policyVersion: "phase95.1",
    });
  });

  it("denies when no policy exists (default-deny)", () => {
    expect(evaluateProviderAccess(ctx(), null)).toMatchObject({ allowed: false, reason: "NO_POLICY" });
  });

  it("denies when the global feature flag is off even if a key/policy exist", () => {
    expect(evaluateProviderAccess(ctx({ externalAiEnabled: false }), policy())).toMatchObject({
      allowed: false,
      reason: "FEATURE_FLAG_OFF",
    });
  });

  it("denies a disabled policy", () => {
    expect(evaluateProviderAccess(ctx(), policy({ enabled: false }))).toMatchObject({ allowed: false, reason: "POLICY_DISABLED" });
  });

  it("denies an expired policy", () => {
    expect(
      evaluateProviderAccess(ctx(), policy({ expiresAt: new Date("2026-01-01T00:00:00Z") })),
    ).toMatchObject({ allowed: false, reason: "POLICY_EXPIRED" });
  });

  it("denies a policy belonging to another organisation (cross-tenant)", () => {
    expect(evaluateProviderAccess(ctx(), policy({ organisationId: "org-B" }))).toMatchObject({
      allowed: false,
      reason: "CROSS_TENANT",
    });
  });

  it("denies an unknown provider/model", () => {
    expect(evaluateProviderAccess(ctx({ providerRegistryId: "openai:not-real" }), null)).toMatchObject({
      allowed: false,
      reason: "UNKNOWN_PROVIDER",
    });
  });

  it("denies an unapproved data class", () => {
    expect(
      evaluateProviderAccess(ctx({ dataClass: "tenant_industrial_confidential" }), policy()),
    ).toMatchObject({ allowed: false, reason: "UNAPPROVED_DATA_CLASS" });
  });

  it("always denies secret/credential data regardless of policy", () => {
    expect(evaluateProviderAccess(ctx({ dataClass: "secret" }), policy({ allowedDataClasses: ["secret"] as never }))).toMatchObject({
      allowed: false,
      reason: "SECRET_OR_CREDENTIAL",
    });
  });

  it("denies an unapproved workflow", () => {
    expect(evaluateProviderAccess(ctx({ workflow: "copilot.chat" }), policy())).toMatchObject({
      allowed: false,
      reason: "UNAPPROVED_DATA_CLASS",
    });
  });

  it("denies an environment the registry entry does not allow", () => {
    expect(evaluateProviderAccess(ctx({ environment: "development" }), policy())).toMatchObject({
      allowed: false,
      reason: "ENVIRONMENT_NOT_ALLOWED",
    });
  });

  it("resolveProviderAccess denies before any store round-trip when flag off", async () => {
    let called = false;
    const store: ProviderPolicyStore = {
      async find() {
        called = true;
        return policy();
      },
    };
    const decision = await resolveProviderAccess(store, ctx({ externalAiEnabled: false }));
    expect(decision).toMatchObject({ allowed: false, reason: "FEATURE_FLAG_OFF" });
    expect(called).toBe(false);
  });

  it("resolveProviderAccess allows via the store when fully approved", async () => {
    const store: ProviderPolicyStore = { async find() { return policy(); } };
    const decision = await resolveProviderAccess(store, ctx());
    expect(decision.allowed).toBe(true);
  });
});

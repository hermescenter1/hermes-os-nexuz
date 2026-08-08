import { describe, it, expect } from "vitest";
import {
  ENTITLEMENT_KEYS,
  PLAN_KEYS,
  isEntitlementKey,
  isPlanKey,
} from "../types";
import {
  allPlanDefinitions,
  getPlanDefinition,
  isSelfServePurchasable,
  isTrialEligiblePlan,
} from "../plan-registry";
import {
  allEntitlementDefinitions,
  getEntitlementDefinition,
  getPlanEntitlementGrant,
  getPlanEntitlements,
  planIncludesEntitlement,
} from "../entitlement-registry";

describe("plan registry completeness", () => {
  it("defines exactly the four canonical plans", () => {
    expect(PLAN_KEYS).toEqual(["COMMUNITY", "PROFESSIONAL", "TEAM", "ENTERPRISE"]);
    expect(allPlanDefinitions().map((p) => p.planKey)).toEqual([
      "COMMUNITY",
      "PROFESSIONAL",
      "TEAM",
      "ENTERPRISE",
    ]);
  });

  it("resolves every canonical plan and denies unknown", () => {
    for (const k of PLAN_KEYS) expect(getPlanDefinition(k)?.planKey).toBe(k);
    expect(getPlanDefinition("STARTER")).toBeNull();
    expect(getPlanDefinition(null)).toBeNull();
    expect(getPlanDefinition(42)).toBeNull();
    expect(isPlanKey("ENTERPRISE")).toBe(true);
    expect(isPlanKey("enterprise")).toBe(false);
  });

  it("carries no invented price and models unresolved status explicitly", () => {
    const pro = getPlanDefinition("PROFESSIONAL")!;
    // No numeric price field exists on the definition at all.
    expect((pro as unknown as Record<string, unknown>).monthlyPrice).toBeUndefined();
    expect(pro.commercialStatus).toBe("CONFIGURATION_REQUIRED");
    expect(isSelfServePurchasable("PROFESSIONAL")).toBe(false); // price unresolved → not purchasable
  });

  it("only Professional/Team are trial-eligible", () => {
    expect(isTrialEligiblePlan("PROFESSIONAL")).toBe(true);
    expect(isTrialEligiblePlan("TEAM")).toBe(true);
    expect(isTrialEligiblePlan("COMMUNITY")).toBe(false);
    expect(isTrialEligiblePlan("ENTERPRISE")).toBe(false);
  });

  it("Enterprise supports a manual contract; others do not", () => {
    expect(getPlanDefinition("ENTERPRISE")!.manualContractAllowed).toBe(true);
    expect(getPlanDefinition("TEAM")!.manualContractAllowed).toBe(false);
    expect(getPlanDefinition("ENTERPRISE")!.commercialStatus).toBe("CONTACT_SALES");
  });
});

describe("entitlement registry completeness", () => {
  it("resolves every declared entitlement key and denies unknown", () => {
    expect(allEntitlementDefinitions().length).toBe(ENTITLEMENT_KEYS.length);
    for (const k of ENTITLEMENT_KEYS) expect(getEntitlementDefinition(k)?.entitlementKey).toBe(k);
    expect(getEntitlementDefinition("teleport")).toBeNull();
    expect(getEntitlementDefinition(undefined)).toBeNull();
    expect(isEntitlementKey("members")).toBe(true);
    expect(isEntitlementKey("MEMBERS")).toBe(false);
  });

  it("produces a grant for every (plan, entitlement) pair", () => {
    for (const p of PLAN_KEYS) {
      const grants = getPlanEntitlements(p);
      expect(grants).not.toBeNull();
      expect(grants!.length).toBe(ENTITLEMENT_KEYS.length);
    }
    expect(getPlanEntitlements("NOPE")).toBeNull();
    expect(getPlanEntitlementGrant("NOPE", "members")).toBeNull();
    expect(getPlanEntitlementGrant("TEAM", "nope")).toBeNull();
  });

  it("NEVER encodes a numeric metered ceiling (all owner-decision-pending)", () => {
    for (const p of PLAN_KEYS) {
      for (const g of getPlanEntitlements(p)!) {
        if (g.kind === "METERED") {
          // Either disabled for the plan or explicitly unconfigured — never a number.
          expect(["FEATURE_DISABLED", "CONFIGURATION_REQUIRED"]).toContain(g.limitType);
          expect(g.limit).toBeNull();
        }
      }
    }
  });

  it("gates feature availability by tier (Community lacks paid features)", () => {
    expect(planIncludesEntitlement("COMMUNITY", "library")).toBe(true);
    expect(planIncludesEntitlement("COMMUNITY", "industrial_brain")).toBe(false);
    expect(planIncludesEntitlement("PROFESSIONAL", "industrial_brain")).toBe(true);
    expect(planIncludesEntitlement("PROFESSIONAL", "ot_gateway")).toBe(false);
    expect(planIncludesEntitlement("TEAM", "ot_gateway")).toBe(true);
    expect(planIncludesEntitlement("ENTERPRISE", "external_ai")).toBe(true);
  });

  it("disables metered resources whose gating feature is absent", () => {
    // gateways depend on ot_gateway; Community lacks it.
    expect(getPlanEntitlementGrant("COMMUNITY", "gateways")!.limitType).toBe("FEATURE_DISABLED");
    // ai_executions depend on industrial_brain; Community lacks it.
    expect(getPlanEntitlementGrant("COMMUNITY", "ai_executions")!.limitType).toBe("FEATURE_DISABLED");
    // members are baseline everywhere → unconfigured, not disabled.
    expect(getPlanEntitlementGrant("COMMUNITY", "members")!.limitType).toBe("CONFIGURATION_REQUIRED");
    // Team has ot_gateway → gateways become unconfigured (awaiting owner number).
    expect(getPlanEntitlementGrant("TEAM", "gateways")!.limitType).toBe("CONFIGURATION_REQUIRED");
  });
});

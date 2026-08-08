import { describe, it, expect } from "vitest";
import { evaluateEntitlement, resolveEntitlement, type EntitlementContext } from "../entitlement-resolver";
import type {
  EntitlementOverrideSnapshot,
  EntitlementResolutionInputs,
  EntitlementStore,
  EntitlementSubscriptionSnapshot,
} from "../entitlement-store";
import type { DomainSubscriptionStatus, EntitlementKey, PlanKey } from "../types";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const ORG = "org_1";

function ctx(entitlementKey: EntitlementKey, requestedUnits = 1, organisationId = ORG): EntitlementContext {
  return { organisationId, entitlementKey, requestedUnits, now: NOW };
}

function sub(
  status: DomainSubscriptionStatus,
  planKey: PlanKey | null = "PROFESSIONAL",
  organisationId = ORG,
): EntitlementSubscriptionSnapshot {
  return {
    organisationId,
    planKey,
    status,
    currentPeriodStart: new Date("2026-07-15T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-15T00:00:00.000Z"),
  };
}

function inputs(partial: Partial<EntitlementResolutionInputs>): EntitlementResolutionInputs {
  return { subscription: partial.subscription ?? null, override: partial.override ?? null, usage: partial.usage ?? null };
}

describe("resolver — fail-closed denials", () => {
  it("denies unknown entitlement", () => {
    const d = evaluateEntitlement({ ...ctx("industrial_brain"), entitlementKey: "teleport" as EntitlementKey }, inputs({ subscription: sub("ACTIVE") }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("UNKNOWN_ENTITLEMENT");
  });

  it("denies when subscription snapshot is null (state undeterminable)", () => {
    const d = evaluateEntitlement(ctx("library"), inputs({ subscription: null }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("MISSING_ORGANISATION");
  });

  it("denies cross-tenant subscription", () => {
    const d = evaluateEntitlement(ctx("library"), inputs({ subscription: sub("ACTIVE", "PROFESSIONAL", "other_org") }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("CROSS_TENANT");
  });

  it("denies unknown plan on an active subscription", () => {
    const d = evaluateEntitlement(ctx("library"), inputs({ subscription: sub("ACTIVE", null) }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("UNKNOWN_PLAN");
  });
});

describe("resolver — community baseline & missing subscription", () => {
  it("resolves a Community baseline FEATURE when there is no subscription", () => {
    const d = evaluateEntitlement(ctx("library", 0), inputs({ subscription: sub("NONE", null) }));
    expect(d.allowed).toBe(true);
    expect(d.effectivePlan).toBe("COMMUNITY");
  });

  it("NEVER grants a paid feature when there is no subscription", () => {
    const d = evaluateEntitlement(ctx("industrial_brain", 0), inputs({ subscription: sub("NONE", null) }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("FEATURE_NOT_IN_PLAN"); // community doesn't include it
  });

  it("denies a paid feature that IS in the plan but with no active subscription state", () => {
    // INCOMPLETE professional: brain is in plan, but state grants no paid access.
    const d = evaluateEntitlement(ctx("industrial_brain", 0), inputs({ subscription: sub("INCOMPLETE") }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("MISSING_SUBSCRIPTION");
  });
});

describe("resolver — expired / suspended (zero paid access)", () => {
  it("denies paid feature on EXPIRED", () => {
    const d = evaluateEntitlement(ctx("industrial_brain", 0), inputs({ subscription: sub("EXPIRED") }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SUBSCRIPTION_EXPIRED");
  });

  it("denies paid feature on SUSPENDED", () => {
    const d = evaluateEntitlement(ctx("copilot", 0), inputs({ subscription: sub("SUSPENDED") }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SUBSCRIPTION_SUSPENDED");
  });

  it("allows a Community baseline read on EXPIRED (data preserved, read-only)", () => {
    const d = evaluateEntitlement(ctx("library", 0), inputs({ subscription: sub("EXPIRED") }));
    expect(d.allowed).toBe(true);
  });

  it("blocks CREATE of a baseline resource on EXPIRED (read-only mode)", () => {
    const d = evaluateEntitlement(ctx("sites", 1), inputs({ subscription: sub("EXPIRED"), usage: 0 }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SUBSCRIPTION_EXPIRED");
  });
});

describe("resolver — unconfigured metered limits fail closed", () => {
  it("denies create when the metered ceiling is unconfigured", () => {
    const d = evaluateEntitlement(ctx("members", 1), inputs({ subscription: sub("ACTIVE"), usage: 0 }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("COMMERCIAL_CONFIGURATION_REQUIRED");
  });

  it("denies a disabled metered resource with FEATURE_NOT_IN_PLAN", () => {
    const d = evaluateEntitlement(ctx("gateways", 1), inputs({ subscription: sub("ACTIVE", "PROFESSIONAL"), usage: 0 }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("FEATURE_NOT_IN_PLAN"); // professional lacks ot_gateway
  });
});

describe("resolver — overrides (time-bounded, fail closed)", () => {
  function override(partial: Partial<EntitlementOverrideSnapshot>): EntitlementOverrideSnapshot {
    return {
      organisationId: ORG,
      entitlementKey: "members",
      decision: "GRANT",
      limitOverride: 5,
      reason: "enterprise contract",
      approvedBy: "billing_admin_1",
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      revokedAt: null,
      ...partial,
    };
  }

  it("a valid GRANT override supplies a numeric ceiling for an unconfigured metered", () => {
    const d = evaluateEntitlement(ctx("members", 1), inputs({ subscription: sub("ACTIVE"), override: override({}), usage: 4 }));
    expect(d.allowed).toBe(true);
    expect(d.overrideApplied).toBe(true);
    expect(d.limit).toBe(5);
    expect(d.remaining).toBe(1);
  });

  it("a valid GRANT override still enforces its numeric ceiling", () => {
    const d = evaluateEntitlement(ctx("members", 1), inputs({ subscription: sub("ACTIVE"), override: override({}), usage: 5 }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("PLAN_LIMIT_REACHED");
  });

  it("an EXPIRED override is ignored (falls back to plan → unconfigured deny)", () => {
    const d = evaluateEntitlement(
      ctx("members", 1),
      inputs({ subscription: sub("ACTIVE"), override: override({ expiresAt: new Date("2026-07-01T00:00:00.000Z") }), usage: 0 }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("COMMERCIAL_CONFIGURATION_REQUIRED");
    expect(d.overrideApplied).toBe(false);
  });

  it("a REVOKED override is ignored", () => {
    const d = evaluateEntitlement(
      ctx("members", 1),
      inputs({ subscription: sub("ACTIVE"), override: override({ revokedAt: NOW }), usage: 0 }),
    );
    expect(d.overrideApplied).toBe(false);
    expect(d.reason).toBe("COMMERCIAL_CONFIGURATION_REQUIRED");
  });

  it("a cross-tenant override is ignored", () => {
    const d = evaluateEntitlement(
      ctx("members", 1),
      inputs({ subscription: sub("ACTIVE"), override: override({ organisationId: "other" }), usage: 0 }),
    );
    expect(d.overrideApplied).toBe(false);
  });

  it("a valid DENY override hard-denies even an included feature", () => {
    const d = evaluateEntitlement(
      ctx("industrial_brain", 0),
      inputs({ subscription: sub("ACTIVE"), override: override({ entitlementKey: "industrial_brain", decision: "DENY" }) }),
    );
    expect(d.allowed).toBe(false);
    expect(d.overrideApplied).toBe(true);
  });

  it("a GRANT override cannot bypass a hard suspension write-block", () => {
    const d = evaluateEntitlement(
      ctx("members", 1),
      inputs({ subscription: sub("SUSPENDED"), override: override({}), usage: 0 }),
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SUBSCRIPTION_SUSPENDED");
  });
});

describe("resolver — async wrapper fails closed on store errors", () => {
  const throwingStore: EntitlementStore = {
    async getSubscription() {
      throw new Error("db down");
    },
    async getUsage() {
      throw new Error("db down");
    },
    async getOverride() {
      throw new Error("db down");
    },
  };

  it("denies when the store throws (no accidental grant)", async () => {
    const d = await resolveEntitlement(throwingStore, { organisationId: ORG, entitlementKey: "library", now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("MISSING_ORGANISATION");
  });

  it("denies when organisationId is empty without hitting the store", async () => {
    const d = await resolveEntitlement(throwingStore, { organisationId: "", entitlementKey: "library", now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("MISSING_ORGANISATION");
  });

  it("resolves a metered create through the store with usage", async () => {
    const store: EntitlementStore = {
      async getSubscription() {
        return sub("ACTIVE", "TEAM");
      },
      async getUsage() {
        return 0;
      },
      async getOverride() {
        return {
          organisationId: ORG,
          entitlementKey: "gateways",
          decision: "GRANT",
          limitOverride: 3,
          reason: "pilot",
          approvedBy: "admin",
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          expiresAt: new Date("2026-09-01T00:00:00.000Z"),
          revokedAt: null,
        };
      },
    };
    const d = await resolveEntitlement(store, { organisationId: ORG, entitlementKey: "gateways", requestedUnits: 1, now: NOW });
    expect(d.allowed).toBe(true);
    expect(d.limit).toBe(3);
  });
});

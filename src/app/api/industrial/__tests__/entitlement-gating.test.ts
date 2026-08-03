import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type {
  EntitlementOverrideSnapshot,
  EntitlementSubscriptionSnapshot,
  EntitlementStore,
} from "@/lib/billing-governance/entitlement-store";

/**
 * PHASE 96 — RBAC and commercial entitlement are SEPARATE gates. These tests
 * pass the RBAC gate (valid platform actor + scope) and prove the entitlement
 * resolver still denies (fail closed) or allows via an override, using the REAL
 * resolver with only the persistence store stubbed. The resource service must
 * NOT be called on denial.
 */

const h = vi.hoisted(() => ({
  createdSites: [] as unknown[],
  sub: null as EntitlementSubscriptionSnapshot | null,
  override: null as EntitlementOverrideSnapshot | null,
  usage: 0 as number | null,
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: "u-1", orgId: "org-1", authMethod: "apikey", scopes: ["industrial.write"], keyId: "k-1" },
  }),
}));
vi.mock("@/lib/api/scopes", () => ({ hasScope: (scopes: string[], s: string) => scopes.includes(s) }));
vi.mock("@/lib/industrial/sites", () => ({
  listSites: async () => [],
  createSite: async (input: unknown) => {
    h.createdSites.push(input);
    return { id: "site-new" };
  },
}));
vi.mock("@/lib/site/context", () => ({ getAllowedSiteIds: async () => [] }));
vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async () => undefined,
  INDUSTRIAL_AUDIT: { SITE_CREATED: "industrial.site_created" },
}));
// Stub ONLY the persistence store — the real resolver runs.
vi.mock("@/lib/billing-governance/runtime/entitlement-store", () => ({
  prismaEntitlementStore: (): EntitlementStore => ({
    async getSubscription() {
      return h.sub;
    },
    async getUsage() {
      return h.usage;
    },
    async getOverride() {
      return h.override;
    },
  }),
}));

const activeSub = (): EntitlementSubscriptionSnapshot => ({
  organisationId: "org-1",
  planKey: "PROFESSIONAL",
  status: "ACTIVE",
  currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
  currentPeriodEnd: new Date("2026-08-31T00:00:00.000Z"),
});

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://t/api/industrial/sites", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("industrial sites — RBAC passes, entitlement gate decides", () => {
  beforeEach(() => {
    h.createdSites = [];
    h.sub = activeSub();
    h.override = null;
    h.usage = 0;
  });

  it("denies with COMMERCIAL_CONFIGURATION_REQUIRED when the site limit is unconfigured", async () => {
    const { POST } = await import("../sites/route");
    const res = await POST(postReq({ name: "Plant A", slug: "plant-a" }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("COMMERCIAL_CONFIGURATION_REQUIRED");
    expect(h.createdSites).toHaveLength(0); // resource NOT created
  });

  it("denies (SUBSCRIPTION_EXPIRED) when the subscription is expired", async () => {
    h.sub = { ...activeSub(), status: "EXPIRED" };
    const { POST } = await import("../sites/route");
    const res = await POST(postReq({ name: "Plant A", slug: "plant-a" }));
    expect(res.status).toBe(402);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("SUBSCRIPTION_EXPIRED");
    expect(h.createdSites).toHaveLength(0);
  });

  it("allows creation when a Billing-Admin override supplies a real ceiling", async () => {
    h.override = {
      organisationId: "org-1",
      entitlementKey: "sites",
      decision: "GRANT",
      limitOverride: 5,
      reason: "enterprise pilot",
      approvedBy: "admin-1",
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      revokedAt: null,
    };
    h.usage = 2;
    const { POST } = await import("../sites/route");
    const res = await POST(postReq({ name: "Plant A", slug: "plant-a" }));
    expect(res.status).toBe(201);
    expect(h.createdSites).toHaveLength(1);
  });

  it("denies (PLAN_LIMIT_REACHED) when the override ceiling is exhausted", async () => {
    h.override = {
      organisationId: "org-1",
      entitlementKey: "sites",
      decision: "GRANT",
      limitOverride: 3,
      reason: "pilot",
      approvedBy: "admin-1",
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      revokedAt: null,
    };
    h.usage = 3;
    const { POST } = await import("../sites/route");
    const res = await POST(postReq({ name: "Plant A", slug: "plant-a" }));
    expect(res.status).toBe(402);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("PLAN_LIMIT_REACHED");
    expect(h.createdSites).toHaveLength(0);
  });
});

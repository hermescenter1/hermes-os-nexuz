/**
 * PHASE 99.5 — site-boundary regression tests for the industrial list surfaces
 * (P99-INT-014 / P99-INT-015 / P99-INT-016, all HIGH).
 *
 * The Phase 43 site allow-list was applied only in the branch where the caller
 * supplied no filter. Naming a site (or, for connectors, a gateway) therefore
 * REPLACED the allow-list instead of narrowing it, and a caller holding a
 * UserSite grant for one site could read another site's assets, gateways and
 * connector configuration. The item routes enforced the boundary correctly, so
 * the control was defeated purely by choosing a different URL.
 *
 * These tests assert the predicate that actually reaches Prisma, because that is
 * where the boundary either exists or does not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Where = Record<string, unknown>;
let lastWhere: Record<string, Where> = {};

function mockPrisma() {
  const capture = (model: string) => ({
    findMany: async ({ where }: { where: Where }) => { lastWhere[model] = where; return []; },
  });
  return {
    industrialAsset: capture("industrialAsset"),
    industrialGateway: capture("industrialGateway"),
    industrialConnectorConfig: capture("industrialConnectorConfig"),
  };
}

beforeEach(() => {
  vi.resetModules();
  lastWhere = {};
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => mockPrisma() }));
});
afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.resetModules();
});

describe("P99-INT-014 — listAssets: a requested site narrows the allow-list, never replaces it", () => {
  it("constrains to the allow-list when no site is requested", async () => {
    const { listAssets } = await import("@/lib/industrial/assets");
    await listAssets("org-A", { allowedSiteIds: ["site-1", "site-2"] });
    expect(lastWhere.industrialAsset.siteId).toEqual({ in: ["site-1", "site-2"] });
  });

  it("returns nothing for a site the caller has no grant for", async () => {
    const { listAssets } = await import("@/lib/industrial/assets");
    const rows = await listAssets("org-A", { siteId: "site-9", allowedSiteIds: ["site-1"] });
    expect(rows).toEqual([]);
    // The query must not even be issued for a site outside the allow-list.
    expect(lastWhere.industrialAsset).toBeUndefined();
  });

  it("keeps the allow-list even when only a gateway filter is supplied", async () => {
    const { listAssets } = await import("@/lib/industrial/assets");
    await listAssets("org-A", { gatewayId: "gw-of-site-9", allowedSiteIds: ["site-1"] });
    expect(lastWhere.industrialAsset.gatewayId).toBe("gw-of-site-9");
    expect(lastWhere.industrialAsset.siteId).toEqual({ in: ["site-1"] });
  });

  it("still serves a permitted site when it is requested explicitly", async () => {
    const { listAssets } = await import("@/lib/industrial/assets");
    await listAssets("org-A", { siteId: "site-1", allowedSiteIds: ["site-1", "site-2"] });
    expect(lastWhere.industrialAsset.siteId).toBe("site-1");
    expect(lastWhere.industrialAsset.organizationId).toBe("org-A");
  });

  it("leaves an unscoped caller (no allow-list supplied) unchanged", async () => {
    const { listAssets } = await import("@/lib/industrial/assets");
    await listAssets("org-A", { siteId: "site-3" });
    expect(lastWhere.industrialAsset.siteId).toBe("site-3");
  });
});

describe("P99-INT-015 — listGateways: same boundary", () => {
  it("returns nothing for a site outside the allow-list", async () => {
    const { listGateways } = await import("@/lib/industrial/gateways");
    const rows = await listGateways("org-A", "site-9", ["site-1"]);
    expect(rows).toEqual([]);
    expect(lastWhere.industrialGateway).toBeUndefined();
  });

  it("constrains to the allow-list when no site is requested", async () => {
    const { listGateways } = await import("@/lib/industrial/gateways");
    await listGateways("org-A", undefined, ["site-1"]);
    expect(lastWhere.industrialGateway.siteId).toEqual({ in: ["site-1"] });
  });

  it("still serves a permitted site when it is requested explicitly", async () => {
    const { listGateways } = await import("@/lib/industrial/gateways");
    await listGateways("org-A", "site-1", ["site-1", "site-2"]);
    expect(lastWhere.industrialGateway.siteId).toBe("site-1");
  });

  it("leaves an unscoped caller (no allow-list supplied) unchanged", async () => {
    const { listGateways } = await import("@/lib/industrial/gateways");
    await listGateways("org-A", "site-3");
    expect(lastWhere.industrialGateway.siteId).toBe("site-3");
  });
});

describe("P99-INT-016 — listConnectors: a gateway filter does not bypass the site allow-list", () => {
  it("applies BOTH the gateway filter and the site allow-list", async () => {
    const { listConnectors } = await import("@/lib/industrial/connectors");
    await listConnectors("org-A", { gatewayId: "gw-of-site-9", allowedSiteIds: ["site-1"] });
    expect(lastWhere.industrialConnectorConfig.gatewayId).toBe("gw-of-site-9");
    // The site predicate must still be present — this is the whole finding.
    expect(lastWhere.industrialConnectorConfig.siteId).toEqual({ in: ["site-1"] });
  });

  it("still constrains to the allow-list with no gateway filter", async () => {
    const { listConnectors } = await import("@/lib/industrial/connectors");
    await listConnectors("org-A", { allowedSiteIds: ["site-1", "site-2"] });
    expect(lastWhere.industrialConnectorConfig.siteId).toEqual({ in: ["site-1", "site-2"] });
  });
});

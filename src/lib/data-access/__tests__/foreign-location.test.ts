/**
 * PHASE 110-A2.0 — an INCLUDED relation is part of the tenant boundary.
 *
 * WHAT THIS CATCHES, AND HOW IT WAS FOUND. `include: { location: true }`
 * follows a foreign key wherever it points. The rehearsal constructed the
 * inconsistency an unscoped write could have left behind — an Alpha asset whose
 * `locationId` names Beta's plant — and `/api/assets` answered 200 with
 * `location.name = "Beta Plant"` for an Alpha user. The row was genuinely
 * Alpha's; the foreign bytes rode inside it. See `relation-reads.log` for the
 * leak and `relation-reads-after-fix.log` for the same probe passing.
 *
 * The test goes RED again if `dropForeignLocations` is removed from the layer,
 * which is the only reason it is worth having.
 */

import { describe, expect, it, vi } from "vitest";

const ALPHA = "org_alpha";

function makeClient(rows: unknown[]) {
  return {
    registryAsset: {
      findMany: async () => rows.map((r) => JSON.parse(JSON.stringify(r))),
      findFirst: async () => JSON.parse(JSON.stringify(rows[0])),
    },
  };
}

async function withAssets<T>(client: unknown, fn: (m: typeof import("@/lib/assets/db")) => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("@/lib/data-access/tenant-scope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/data-access/tenant-scope")>();
    return {
      ...actual,
      requireTenantScope: async () => ({ organizationId: ALPHA, userId: "u1" }),
      requireDatabase: async () => client as Record<string, unknown>,
    };
  });
  try {
    return await fn(await import("@/lib/assets/db"));
  } finally {
    vi.doUnmock("@/lib/data-access/tenant-scope");
    vi.resetModules();
  }
}

const alphaAsset = {
  id: "a1", organizationId: ALPHA, name: "Alpha Compressor",
  location: { id: "l_alpha", organizationId: ALPHA, name: "Alpha Plant" },
};
const assetWithForeignLocation = {
  id: "a2", organizationId: ALPHA, name: "Alpha Pump",
  location: { id: "l_beta", organizationId: "org_beta", name: "Beta Plant" },
};
const assetWithOrphanLocation = {
  id: "a3", organizationId: ALPHA, name: "Alpha Fan",
  location: { id: "l_orphan", organizationId: null, name: "Unowned Plant" },
};

describe("A2.0 — a foreign INCLUDED location never reaches the caller", () => {
  it("keeps this organization's location and drops the other tenant's", async () => {
    const rows = await withAssets(makeClient([alphaAsset, assetWithForeignLocation]), ({ getAssets }) => getAssets());

    const own = rows.find((r) => r.id === "a1") as unknown as { location: { name: string } | null };
    const foreign = rows.find((r) => r.id === "a2") as unknown as { location: { name: string } | null };

    expect(own.location?.name, "the legitimate relation must survive").toBe("Alpha Plant");
    expect(foreign.location, "the foreign relation must be gone, not renamed").toBeNull();
    expect(JSON.stringify(rows)).not.toContain("Beta Plant");
  });

  it("drops a NULL-OWNER location too — unowned is not ours", async () => {
    const rows = await withAssets(makeClient([assetWithOrphanLocation]), ({ getAssets }) => getAssets());
    expect((rows[0] as unknown as { location: unknown }).location).toBeNull();
    expect(JSON.stringify(rows)).not.toContain("Unowned Plant");
  });

  it("scrubs every level of the hierarchy, not only the root", async () => {
    const tree = [{
      id: "root", organizationId: ALPHA, name: "Root",
      location: { id: "l_alpha", organizationId: ALPHA, name: "Alpha Plant" },
      children: [{
        id: "child", organizationId: ALPHA, name: "Child",
        location: { id: "l_beta", organizationId: "org_beta", name: "Beta Plant" },
        children: [{
          id: "grandchild", organizationId: ALPHA, name: "Grandchild",
          location: { id: "l_beta", organizationId: "org_beta", name: "Beta Plant" },
          children: [],
        }],
      }],
    }];

    const rows = await withAssets(makeClient(tree), ({ getAssetHierarchy }) => getAssetHierarchy());
    expect(JSON.stringify(rows), "a nested level is where this is normally forgotten").not.toContain("Beta Plant");
    expect(JSON.stringify(rows)).toContain("Alpha Plant");
  });

  it("the single-asset read is scrubbed as well", async () => {
    const row = await withAssets(makeClient([assetWithForeignLocation]), ({ getAssetById }) => getAssetById("a2"));
    expect((row as unknown as { location: unknown } | null)?.location).toBeNull();
  });
});

/**
 * PHASE 110-A2.1 — the `_count` a screen shows must be this organization's.
 *
 * A count is the cheapest place for a leak to hide: the row that produced it is
 * never rendered, so nobody sees whose it was. `children` is the one counted
 * relation on `RegistryAsset` that can belong to another tenant, because it is
 * `RegistryAsset` again and carries its own nullable `organizationId`.
 *
 * WHAT THIS TEST CAN AND CANNOT DO. It asserts that the query the layer sends
 * carries the tenant predicate inside the count — which is what goes wrong when
 * someone "simplifies" `children: { where: … }` back to `children: true`. It
 * cannot prove PostgreSQL then returns the right number; that is measured
 * against a real database with deliberately inconsistent rows, in
 * `loop4-relation-isolation.json`.
 */

import { describe, expect, it, vi } from "vitest";

const ALPHA = "org_alpha";

function recordingClient() {
  const calls: Array<{ model: string; args: Record<string, unknown> }> = [];
  const model = (name: string) => ({
    findMany: async (args: Record<string, unknown>) => { calls.push({ model: name, args }); return []; },
    findFirst: async (args: Record<string, unknown>) => { calls.push({ model: name, args }); return null; },
    count: async (args: Record<string, unknown>) => { calls.push({ model: name, args }); return 0; },
  });
  return {
    calls,
    client: {
      registryAsset: model("registryAsset"),
      assetLocation: model("assetLocation"),
      assetLifecycleEvent: model("assetLifecycleEvent"),
      assetMaintenanceLink: model("assetMaintenanceLink"),
      assetHealthSnapshot: model("assetHealthSnapshot"),
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

/** Pull the `_count.select` out of whatever include shape the call used. */
function countSelect(args: Record<string, unknown>): Record<string, unknown> | null {
  const include = args.include as Record<string, unknown> | undefined;
  const count = include?._count as Record<string, unknown> | undefined;
  return (count?.select as Record<string, unknown>) ?? null;
}

describe("A2.1 — the children count carries the tenant predicate", () => {
  const entries: ReadonlyArray<readonly [string, (m: typeof import("@/lib/assets/db")) => Promise<unknown>]> = [
    ["getAssets", (m) => m.getAssets()],
    ["getAssetById", (m) => m.getAssetById("a1")],
    ["getAssetHierarchy", (m) => m.getAssetHierarchy()],
    ["getAssetsWithCriticality", (m) => m.getAssetsWithCriticality()],
  ];

  for (const [name, call] of entries) {
    it(`${name} counts only this organization's children`, async () => {
      const { client, calls } = recordingClient();
      await withAssets(client, (m) => call(m));

      const withCount = calls.filter((c) => countSelect(c.args) !== null);
      expect(withCount.length, "the query must actually ask for counts").toBeGreaterThan(0);

      for (const c of withCount) {
        const select = countSelect(c.args)!;
        expect(select.children, "`children: true` counts other tenants' rows").not.toBe(true);
        expect(select.children).toEqual({ where: { organizationId: ALPHA } });

        /*
         * The other four are children of the asset through a REQUIRED relation
         * with no organization column of their own, so they cannot belong to
         * anyone else and are deliberately unfiltered. Asserted so that a future
         * change to the schema — one that gives them an owner — makes this test
         * a decision point rather than a silent gap.
         */
        for (const plain of ["maintenanceLinks", "documentLinks", "telemetryLinks", "healthSnapshots"]) {
          expect(select[plain], `${plain} is a required child of the asset`).toBe(true);
        }
      }
    });
  }

  it("the hierarchy scopes every nested children level, not only the count", async () => {
    const { client, calls } = recordingClient();
    await withAssets(client, (m) => m.getAssetHierarchy());

    const args = calls[0].args as Record<string, unknown>;
    const serialized = JSON.stringify(args);
    // The root predicate, the nested include predicates and the count predicate.
    const occurrences = serialized.split(`"organizationId":"${ALPHA}"`).length - 1;
    expect(occurrences, "root, two nested levels and the counts must all be scoped").toBeGreaterThanOrEqual(4);
  });
});

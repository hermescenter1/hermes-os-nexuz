import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  created: [] as Record<string, unknown>[],
  updated: [] as Array<{ id: string; data: Record<string, unknown> }>,
  conflict: false,
  notFound: false,
  audits: [] as Record<string, unknown>[],
};

const asset = {
  id: "asset-1",
  organizationId: "org-1",
  siteId: null,
  assetNumber: "MTR-L2-001",
  name: "Line 2 conveyor motor",
  assetType: "MOTOR",
  status: "IN_SERVICE",
  criticality: "HIGH",
  riskState: "HEALTHY",
  lifecycleState: "IN_SERVICE",
  healthScore: 100,
};

async function loadRoutes() {
  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () => ({ id: "user-1", role: "admin" }),
  }));
  vi.doMock("@/lib/auth/roles", () => ({ can: () => true }));
  vi.doMock("@/lib/data-access/write-guard", () => ({
    requireWriteScope: async () => ({
      organizationId: "org-1",
      userId: "user-1",
      organizationRole: "OWNER",
      verifiedFor: "manage_industrial",
    }),
  }));
  vi.doMock("@/lib/assets/db", () => ({
    getAssets: async () => [],
    getAssetById: async () => asset,
    createRegistryAsset: async (_scope: unknown, data: Record<string, unknown>) => {
      state.created.push(data);
      if (state.conflict) throw { code: "ASSET_NUMBER_CONFLICT" };
      return { ...asset, ...data };
    },
    updateRegistryAsset: async (_scope: unknown, id: string, data: Record<string, unknown>) => {
      state.updated.push({ id, data });
      if (state.conflict) throw { code: "ASSET_NUMBER_CONFLICT" };
      if (state.notFound) return null;
      return { ...asset, ...data, id };
    },
    isAssetNumberConflictError: (error: unknown) =>
      Boolean(error && typeof error === "object" && (error as { code?: string }).code === "ASSET_NUMBER_CONFLICT"),
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    INDUSTRIAL_AUDIT: {
      ASSET_CREATED: "industrial.asset.created",
      ASSET_UPDATED: "industrial.asset.updated",
    },
    recordAuditEvent: async (event: Record<string, unknown>) => { state.audits.push(event); },
  }));

  const collection = await import("../route");
  const item = await import("../[id]/route");
  return { collection, item };
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>) {
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-hermes-organization": "org-1",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.created = [];
  state.updated = [];
  state.conflict = false;
  state.notFound = false;
  state.audits = [];
  vi.resetModules();
});

describe("Enterprise Asset Registry write routes", () => {
  it("creates a validated asset and returns 201", async () => {
    const { collection } = await loadRoutes();
    const response = await collection.POST(jsonRequest("http://localhost/api/assets", "POST", {
      assetNumber: "MTR-L2-001",
      name: "Line 2 conveyor motor",
      assetType: "MOTOR",
      criticality: "HIGH",
    }));

    expect(response.status).toBe(201);
    expect(state.created).toHaveLength(1);
    expect((await response.json()).asset.assetNumber).toBe("MTR-L2-001");
  });

  it("rejects a client-selected organization before reaching persistence", async () => {
    const { collection } = await loadRoutes();
    const response = await collection.POST(jsonRequest("http://localhost/api/assets", "POST", {
      assetNumber: "MTR-L2-001",
      name: "Line 2 conveyor motor",
      assetType: "MOTOR",
      organizationId: "org-victim",
    }));

    expect(response.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it("maps a duplicate organization-scoped asset number to 409", async () => {
    state.conflict = true;
    const { collection } = await loadRoutes();
    const response = await collection.POST(jsonRequest("http://localhost/api/assets", "POST", {
      assetNumber: "MTR-L2-001",
      name: "Line 2 conveyor motor",
      assetType: "MOTOR",
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("ASSET_NUMBER_CONFLICT");
  });

  it("patches only validated business fields", async () => {
    const { item } = await loadRoutes();
    const response = await item.PATCH(
      jsonRequest("http://localhost/api/assets/asset-1", "PATCH", { status: "UNDER_MAINTENANCE" }),
      { params: Promise.resolve({ id: "asset-1" }) },
    );

    expect(response.status).toBe(200);
    expect(state.updated).toEqual([{ id: "asset-1", data: { status: "UNDER_MAINTENANCE" } }]);
  });

  it("uses the same 404 for a missing or out-of-scope asset", async () => {
    state.notFound = true;
    const { item } = await loadRoutes();
    const response = await item.PATCH(
      jsonRequest("http://localhost/api/assets/unknown", "PATCH", { status: "RETIRED" }),
      { params: Promise.resolve({ id: "unknown" }) },
    );
    expect(response.status).toBe(404);
  });
});

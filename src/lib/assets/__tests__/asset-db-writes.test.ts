import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetCreateSchema } from "../validation";

const state = {
  createdAssetData: null as Record<string, unknown> | null,
  updatedAssetData: null as Record<string, unknown> | null,
  lifecycleEvents: [] as Record<string, unknown>[],
  relationOwners: new Map<string, string>(),
  existing: {
    id: "asset-1",
    organizationId: "org-1",
    lifecycleState: "IN_SERVICE",
    parentAssetId: null as string | null,
  },
  duplicate: false,
};

const scope = {
  organizationId: "org-1",
  userId: "user-1",
  organizationRole: "OWNER" as const,
  verifiedFor: "manage_industrial" as const,
};

const createInput = (overrides: Record<string, unknown> = {}) => AssetCreateSchema.parse({
  assetNumber: "MTR-001",
  name: "Motor",
  assetType: "MOTOR",
  ...overrides,
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    organizationId: "org-1",
    siteId: null,
    assetNumber: "MTR-001",
    name: "Motor",
    nameEn: null,
    nameFa: null,
    description: null,
    assetType: "MOTOR",
    status: "IN_SERVICE",
    criticality: "MEDIUM",
    riskState: "HEALTHY",
    lifecycleState: "IN_SERVICE",
    healthScore: 100,
    parentAssetId: null,
    locationId: null,
    manufacturer: null,
    model: null,
    serialNumber: null,
    firmwareVersion: null,
    installationDate: null,
    commissionDate: null,
    warrantyExpiry: null,
    expectedLifeYears: null,
    technicalSpecs: {},
    tags: [],
    isActive: true,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: new Date("2026-10-09T00:00:00.000Z"),
    updatedAt: new Date("2026-10-09T00:00:00.000Z"),
    location: null,
    _count: { children: 0, maintenanceLinks: 0, documentLinks: 0, telemetryLinks: 0, healthSnapshots: 0 },
    ...overrides,
  };
}

function delegate(name: string) {
  return {
    findMany: async () => [],
    findFirst: async ({ where }: { where: { id?: string; organizationId?: string } }) => {
      if (name === "registryAsset" && where.id === state.existing.id && where.organizationId === "org-1") {
        return state.existing;
      }
      return state.relationOwners.get(`${name}:${where.id}`) === where.organizationId ? { id: where.id } : null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (name === "registryAsset") {
        if (state.duplicate) throw { code: "P2002" };
        state.createdAssetData = data;
        return row(data);
      }
      if (name === "assetLifecycleEvent") state.lifecycleEvents.push(data);
      return { id: `${name}-1`, ...data };
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      if (state.duplicate) throw { code: "P2002" };
      state.updatedAssetData = data;
      return row(data);
    },
  };
}

async function loadDb() {
  const client = {
    registryAsset: delegate("registryAsset"),
    assetLifecycleEvent: delegate("assetLifecycleEvent"),
    industrialSite: delegate("industrialSite"),
    assetLocation: delegate("assetLocation"),
    async $transaction(fn: (tx: Record<string, unknown>) => Promise<unknown>) { return fn(this); },
  };

  vi.doMock("@/lib/data-access/tenant-scope", () => ({
    isPrismaCode: (error: unknown, code: string) =>
      Boolean(error && typeof error === "object" && (error as { code?: string }).code === code),
    requireDatabase: async () => client,
    requireTenantScope: async () => scope,
    runScoped: async (_operation: string, query: () => Promise<unknown>) => query(),
  }));
  vi.doMock("@/lib/logger/security-events", () => ({ logInfraFailure: () => undefined }));

  return import("../db");
}

beforeEach(() => {
  state.createdAssetData = null;
  state.updatedAssetData = null;
  state.lifecycleEvents = [];
  state.relationOwners = new Map();
  state.existing = { id: "asset-1", organizationId: "org-1", lifecycleState: "IN_SERVICE", parentAssetId: null };
  state.duplicate = false;
  vi.resetModules();
});

describe("Enterprise Asset Registry persistence", () => {
  it("takes organization and audit identity from the verified scope", async () => {
    const db = await loadDb();
    const saved = await db.createRegistryAsset(scope, createInput());

    expect(saved.organizationId).toBe("org-1");
    expect(state.createdAssetData).toMatchObject({ organizationId: "org-1", createdBy: "user-1", updatedBy: "user-1" });
    expect(state.lifecycleEvents).toHaveLength(1);
    expect(state.lifecycleEvents[0]).toMatchObject({ assetId: "asset-1", eventType: "REGISTERED", performedBy: "user-1" });
  });

  it("refuses a foreign location before the asset insert", async () => {
    const db = await loadDb();
    await expect(db.createRegistryAsset(scope, createInput({
      locationId: "location-from-another-org",
    }))).rejects.toMatchObject({ code: "INVALID_RELATION", field: "locationId" });
    expect(state.createdAssetData).toBeNull();
  });

  it("maps the database unique constraint to a stable conflict", async () => {
    state.duplicate = true;
    const db = await loadDb();
    await expect(db.createRegistryAsset(scope, createInput()))
      .rejects.toMatchObject({ code: "ASSET_NUMBER_CONFLICT" });
  });

  it("refuses a self-parenting hierarchy update", async () => {
    state.relationOwners.set("registryAsset:asset-1", "org-1");
    const db = await loadDb();
    await expect(db.updateRegistryAsset(scope, "asset-1", {
      parentAssetId: "asset-1",
    })).rejects.toMatchObject({ code: "INVALID_RELATION", field: "parentAssetId" });
    expect(state.updatedAssetData).toBeNull();
  });

  it("writes a lifecycle event atomically with a lifecycle transition", async () => {
    const db = await loadDb();
    const saved = await db.updateRegistryAsset(scope, "asset-1", { lifecycleState: "RETIRED" });
    expect(saved?.lifecycleState).toBe("RETIRED");
    expect(state.lifecycleEvents[0]).toMatchObject({
      assetId: "asset-1",
      eventType: "STATE_CHANGED",
      fromState: "IN_SERVICE",
      toState: "RETIRED",
    });
  });
});

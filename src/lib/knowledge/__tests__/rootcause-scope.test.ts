/**
 * Failure-detail asset authorisation (slice C, IR-04) — without a database.
 *
 * `getRootCauseCandidates` reads an asset's FailureIndicator and its BAD/STALE telemetry count; it now runs
 * only for an asset proven readable by `resolveAuthorizedAsset`. The real route against PostgreSQL is
 * covered by `src/lib/copilot/__tests__/pg/copilot-site-scope.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  assets: [] as { id: string; organizationId: string; siteId: string; assetType: string; siteActive: boolean }[],
  assetQueries: [] as Record<string, unknown>[],
  fiQueries: [] as Record<string, unknown>[],
  telQueries: [] as Record<string, unknown>[],
  fmQueries: [] as Record<string, unknown>[],
  rcQueries: [] as Record<string, unknown>[],
  throwAsset: false,
  noDb: false,
  logged: [] as unknown[][],
}));

vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: (...a: unknown[]) => { h.logged.push(a); } }));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => h.noDb ? null : ({
    industrialAsset: {
      findMany: async (a: { where: { id: string; organizationId: string; siteId: { in: string[] }; site: { is: { status: string } } } }) => {
        h.assetQueries.push(a);
        if (h.throwAsset) throw new Error("asset lookup failed");
        return h.assets
          .filter((x) => x.id === a.where.id && x.organizationId === a.where.organizationId && a.where.siteId.in.includes(x.siteId)
            && (a.where.site?.is?.status !== "ACTIVE" || x.siteActive))
          .map((x) => ({ id: x.id, siteId: x.siteId, assetType: x.assetType }));
      },
    },
    failureIndicator: { findFirst: async (a: Record<string, unknown>) => { h.fiQueries.push(a); return { id: "fi-1", degradationClass: "DEGRADING", probability: "HIGH" }; } },
    telemetryRecord: { count: async (a: Record<string, unknown>) => { h.telQueries.push(a); return 9; } },
    industrialFailureMode: {
      findMany: async (a: { where: { id?: string } }) => {
        h.fmQueries.push(a);
        const all = [
          { id: "fm-1", organizationId: "org-A", name: "Seal leak", nameNorm: "seal leak", description: "", symptoms: [], assetTypes: [], severity: "HIGH", keywords: [], sourceType: "MANUAL", sourceRef: null, createdAt: new Date(), updatedAt: new Date() },
          { id: "fm-2", organizationId: "org-A", name: "Overheat", nameNorm: "overheat", description: "", symptoms: [], assetTypes: [], severity: "LOW", keywords: [], sourceType: "MANUAL", sourceRef: null, createdAt: new Date(), updatedAt: new Date() },
        ];
        return a.where.id ? all.filter((f) => f.id === a.where.id) : all;
      },
    },
    industrialRootCause: {
      findMany: async (a: { where: { failureModeId?: string } }) => {
        h.rcQueries.push(a);
        const all = [
          { id: "rc-1", organizationId: "org-A", failureModeId: "fm-1", description: "worn seal", confidenceWeight: 0.5, supportingEvidence: [], createdAt: new Date(), updatedAt: new Date() },
          { id: "rc-2", organizationId: "org-A", failureModeId: "fm-2", description: "fan", confidenceWeight: 0.4, supportingEvidence: [], createdAt: new Date(), updatedAt: new Date() },
        ];
        return a.where.failureModeId ? all.filter((r) => r.failureModeId === a.where.failureModeId) : all;
      },
    },
  }),
}));

import { getRootCauseCandidates, resolveAuthorizedAsset } from "../rootcauses";

const ORG = "org-A";
beforeEach(() => {
  h.assets = [
    { id: "as-a1", organizationId: ORG, siteId: "A1", assetType: "PUMP", siteActive: true },
    { id: "as-a2", organizationId: ORG, siteId: "A2", assetType: "PUMP", siteActive: true },
    { id: "as-a3", organizationId: ORG, siteId: "A3", assetType: "PUMP", siteActive: false },
    { id: "as-b1", organizationId: "org-B", siteId: "B1", assetType: "PUMP", siteActive: true },
  ];
  h.assetQueries = []; h.fiQueries = []; h.telQueries = []; h.fmQueries = []; h.rcQueries = [];
  h.throwAsset = false; h.noDb = false; h.logged = [];
});

describe("resolveAuthorizedAsset", () => {
  it("accepts an asset of the organisation on a readable ACTIVE site; its type is server-derived", async () => {
    const a = await resolveAuthorizedAsset(ORG, "as-a1", ["A1"]);
    expect(a).toEqual({ id: "as-a1", siteId: "A1", assetType: "PUMP" });
    expect(h.assetQueries[0]).toMatchObject({ where: { id: "as-a1", organizationId: ORG, siteId: { in: ["A1"] }, site: { is: { organizationId: ORG, status: "ACTIVE" } } } });
  });

  it("hidden, inactive, foreign, missing and malformed ids are all null", async () => {
    for (const id of ["as-a2", "as-a3", "as-b1", "nope", "", 7, null, ["as-a1"], "x".repeat(200)]) {
      expect(await resolveAuthorizedAsset(ORG, id, ["A1", "A3"]), JSON.stringify(id)).toBeNull();
    }
  });

  it("an empty scope never queries; a database error fails closed and is logged", async () => {
    expect(await resolveAuthorizedAsset(ORG, "as-a1", [])).toBeNull();
    expect(h.assetQueries).toHaveLength(0);
    h.throwAsset = true;
    expect(await resolveAuthorizedAsset(ORG, "as-a1", ["A1"])).toBeNull();
    expect(h.logged[0]?.slice(0, 2)).toEqual(["database", "knowledge.resolve_authorized_asset"]);
    h.throwAsset = false; h.noDb = true;
    expect(await resolveAuthorizedAsset(ORG, "as-a1", ["A1"])).toBeNull();
  });
});

describe("getRootCauseCandidates", () => {
  it("reads indicators and alarms for the AUTHORISED asset only, and only the named failure mode's root causes", async () => {
    const asset = (await resolveAuthorizedAsset(ORG, "as-a1", ["A1"]))!;
    const out = await getRootCauseCandidates(ORG, asset, { failureModeId: "fm-1" });
    expect(out.map((c) => c.rootCause.id)).toEqual(["rc-1"]);
    expect(h.fiQueries[0]).toMatchObject({ where: { organizationId: ORG, assetId: "as-a1" } });
    expect(h.telQueries[0]).toMatchObject({ where: { organizationId: ORG, assetId: "as-a1" } });
    expect(h.fmQueries[0]).toMatchObject({ where: { organizationId: ORG, id: "fm-1" } });
    expect(h.rcQueries[0]).toMatchObject({ where: { organizationId: ORG, failureModeId: "fm-1" } });
  });

  it("without a failure-mode filter every root cause of the organisation is a candidate, in a deterministic order", async () => {
    const asset = (await resolveAuthorizedAsset(ORG, "as-a1", ["A1"]))!;
    const one = (await getRootCauseCandidates(ORG, asset)).map((c) => c.rootCause.id);
    const two = (await getRootCauseCandidates(ORG, asset)).map((c) => c.rootCause.id);
    expect(one).toEqual(two);
    expect(one.sort()).toEqual(["rc-1", "rc-2"]);
  });
});

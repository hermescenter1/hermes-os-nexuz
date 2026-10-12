/**
 * Copilot viewer scope and selectors (IR-03) — the decision table, without a database.
 *
 * The real-PostgreSQL proof through the real routes (text, conversation, voice) is
 * `pg/copilot-site-scope.pg.test.ts`. Here: how the scope is resolved, how every selector is accepted
 * or refused, and how a stored answer is re-authorised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  granted: [] as unknown[],
  grantedThrows: false,
  activeSites: [] as string[],
  assets: [] as { id: string; organizationId: string; siteId: string }[],
  assetThrows: false,
  noDb: false,
  siteQueries: [] as Record<string, unknown>[],
  assetQueries: [] as Record<string, unknown>[],
  logged: [] as unknown[][],
}));

vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => { if (h.grantedThrows) throw new Error("grant lookup failed"); return h.granted; },
}));
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: (...a: unknown[]) => { h.logged.push(a); } }));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => h.noDb ? null : ({
    industrialSite: {
      findMany: async (a: { where: { organizationId: string; status: string; id: { in: string[] } } }) => {
        h.siteQueries.push(a);
        return a.where.status === "ACTIVE" ? a.where.id.in.filter((id) => h.activeSites.includes(id)).map((id) => ({ id })) : [];
      },
    },
    industrialAsset: {
      findMany: async (a: { where: { id: string; organizationId: string; siteId: { in: string[] } } }) => {
        h.assetQueries.push(a);
        if (h.assetThrows) throw new Error("asset lookup failed");
        return h.assets
          .filter((x) => x.id === a.where.id && x.organizationId === a.where.organizationId && a.where.siteId.in.includes(x.siteId))
          .map((x) => ({ id: x.id, siteId: x.siteId }));
      },
    },
  }),
}));

import { authorizeCopilotSelectors, COPILOT_SCOPE_NOT_FOUND, effectiveSiteIds, resolveCopilotSiteIds } from "../scope";
import { storedAnswerReadable } from "../copilot";

const ORG = "org-A";
beforeEach(() => {
  h.granted = ["A1", "A2", "A3"];
  h.grantedThrows = false;
  h.activeSites = ["A1", "A2"];         // A3 is inactive
  h.assets = [
    { id: "as-a1", organizationId: ORG, siteId: "A1" },
    { id: "as-a2", organizationId: ORG, siteId: "A2" },
    { id: "as-a3", organizationId: ORG, siteId: "A3" },
    { id: "as-b1", organizationId: "org-B", siteId: "B1" },
  ];
  h.assetThrows = false;
  h.noDb = false;
  h.siteQueries = [];
  h.assetQueries = [];
  h.logged = [];
});

describe("resolveCopilotSiteIds", () => {
  it("is the official allowed sites intersected with the ACTIVE sites of THIS organisation", async () => {
    expect(await resolveCopilotSiteIds("u1", ORG)).toEqual(["A1", "A2"]);
    expect(h.siteQueries[0]).toMatchObject({ where: { organizationId: ORG, status: "ACTIVE", id: { in: ["A1", "A2", "A3"] } } });
  });

  it("duplicates and malformed ids never widen it; a site the grant did not name never enters it", async () => {
    h.granted = ["A1", "A1", "", 7, null];
    h.activeSites = ["A1", "A2"];
    expect(await resolveCopilotSiteIds("u1", ORG)).toEqual(["A1"]);
  });

  it("fails closed: no user, no grant, no database, a lookup error", async () => {
    expect(await resolveCopilotSiteIds(null, ORG)).toEqual([]);
    expect(await resolveCopilotSiteIds("", ORG)).toEqual([]);
    h.granted = [];
    expect(await resolveCopilotSiteIds("u1", ORG)).toEqual([]);
    h.granted = ["A1"]; h.noDb = true;
    expect(await resolveCopilotSiteIds("u1", ORG)).toEqual([]);
    h.noDb = false; h.grantedThrows = true;
    expect(await resolveCopilotSiteIds("u1", ORG)).toEqual([]);
    expect(h.logged.length).toBe(1);
  });
});

describe("authorizeCopilotSelectors", () => {
  it("no selector: the actor's readable sites, no site, no asset — never 'the organisation'", async () => {
    const r = await authorizeCopilotSelectors("u1", ORG, {});
    expect(r).toEqual({ ok: true, scope: { organizationId: ORG, userId: "u1", siteIds: ["A1", "A2"], siteId: null, asset: null } });
    expect(h.assetQueries).toHaveLength(0);
  });

  it("an allowed site is accepted; a hidden, inactive, foreign, missing or malformed site is refused the same way", async () => {
    expect((await authorizeCopilotSelectors("u1", ORG, { siteId: "A1" }))).toMatchObject({ ok: true, scope: { siteId: "A1" } });
    for (const siteId of ["A3", "B1", "nope", "", 7, { in: ["A1"] }, ["A1"], "x".repeat(200)]) {
      expect(await authorizeCopilotSelectors("u1", ORG, { siteId }), JSON.stringify(siteId)).toEqual({ ok: false });
    }
  });

  it("an asset is loaded IN the organisation and ON a readable site; its site is derived from the row", async () => {
    const r = await authorizeCopilotSelectors("u1", ORG, { assetId: "as-a2" });
    expect(r).toMatchObject({ ok: true, scope: { asset: { id: "as-a2", siteId: "A2" }, siteId: null } });
    expect(h.assetQueries[0]).toMatchObject({ where: { id: "as-a2", organizationId: ORG, siteId: { in: ["A1", "A2"] } } });
  });

  it("an asset on an inactive site, of another organisation, missing or malformed is refused the same way", async () => {
    for (const assetId of ["as-a3", "as-b1", "nope", "", 7, ["as-a1"]]) {
      expect(await authorizeCopilotSelectors("u1", ORG, { assetId }), JSON.stringify(assetId)).toEqual({ ok: false });
    }
  });

  it("both given: the asset's site must be the requested one, otherwise the same refusal", async () => {
    expect(await authorizeCopilotSelectors("u1", ORG, { siteId: "A1", assetId: "as-a1" })).toMatchObject({ ok: true });
    expect(await authorizeCopilotSelectors("u1", ORG, { siteId: "A1", assetId: "as-a2" })).toEqual({ ok: false });
    expect(await authorizeCopilotSelectors("u1", ORG, { siteId: "A3", assetId: "as-a1" })).toEqual({ ok: false });
  });

  it("an actor with no readable site: an asset selector is refused without even reading the asset", async () => {
    h.granted = [];
    expect(await authorizeCopilotSelectors("u1", ORG, { assetId: "as-a1" })).toEqual({ ok: false });
    expect(h.assetQueries).toHaveLength(0);
    expect(await authorizeCopilotSelectors("u1", ORG, {})).toMatchObject({ ok: true, scope: { siteIds: [] } });
  });

  it("a database error while loading the asset is a refusal (fail closed), logged", async () => {
    h.assetThrows = true;
    expect(await authorizeCopilotSelectors("u1", ORG, { assetId: "as-a1" })).toEqual({ ok: false });
    expect(h.logged.at(-1)?.slice(0, 2)).toEqual(["database", "copilot.authorize_asset"]);
  });

  it("null / undefined selectors mean 'none'", async () => {
    expect(await authorizeCopilotSelectors("u1", ORG, { siteId: null, assetId: undefined })).toMatchObject({ ok: true, scope: { siteId: null, asset: null } });
  });

  it("the public refusal is one fixed 404 body", () => {
    expect(COPILOT_SCOPE_NOT_FOUND).toEqual({ status: 404, body: { error: "Site or asset not found", code: "COPILOT_SCOPE_NOT_FOUND" } });
  });
});

describe("effectiveSiteIds", () => {
  const base = { organizationId: ORG, userId: "u1", siteIds: ["A1", "A2"], siteId: null, asset: null };
  it("asset site, else selected site, else every readable site", () => {
    expect(effectiveSiteIds({ ...base, asset: { id: "as-a2", siteId: "A2" } })).toEqual(["A2"]);
    expect(effectiveSiteIds({ ...base, siteId: "A1" })).toEqual(["A1"]);
    expect(effectiveSiteIds(base)).toEqual(["A1", "A2"]);
    expect(effectiveSiteIds({ ...base, siteIds: [] })).toEqual([]);
  });
});

describe("storedAnswerReadable — a stored assistant answer is re-authorised on every read", () => {
  it("readable only while every site it was built from is still readable", () => {
    expect(storedAnswerReadable({ scope: { siteIds: ["A1"] } }, ["A1", "A2"])).toBe(true);
    expect(storedAnswerReadable({ scope: { siteIds: ["A1", "A2"] } }, ["A1"])).toBe(false);
    expect(storedAnswerReadable({ scope: { siteIds: [] } }, [])).toBe(true);          // built from no site: nothing site-derived
  });

  it("a legacy answer without site attribution, or a malformed one, is withheld", () => {
    expect(storedAnswerReadable({ intent: "x", insightCount: 3 }, ["A1"])).toBe(false);
    expect(storedAnswerReadable({ scope: "A1" }, ["A1"])).toBe(false);
    expect(storedAnswerReadable({ scope: { siteIds: "A1" } }, ["A1"])).toBe(false);
    expect(storedAnswerReadable({ scope: { siteIds: ["A1", 7] } }, ["A1"])).toBe(false);
  });
});

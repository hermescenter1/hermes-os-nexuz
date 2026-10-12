/**
 * Digital Twin effective site scope (IR-01) — the decision table, without a database.
 *
 * `resolveSiteScope` = official `getAllowedSiteIds` ∩ ACTIVE `IndustrialSite` of the same
 * organisation. The real-PostgreSQL proof that the five collection routes honour it is
 * `pg/digital-twin-active-site-scope.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  granted: [] as unknown[],
  grantedThrows: false,
  prisma: null as null | Record<string, unknown>,
  siteRows: [] as Record<string, unknown>[],
  siteThrows: false,
  siteQueries: [] as Record<string, unknown>[],
  grantedCalls: [] as unknown[][],
  logged: [] as unknown[][],
}));

vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async (...a: unknown[]) => {
    h.grantedCalls.push(a);
    if (h.grantedThrows) throw new Error("grant lookup failed");
    return h.granted;
  },
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.prisma }));
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: (...a: unknown[]) => { h.logged.push(a); } }));

import { resolveSiteScope } from "../scope";

const withDb = () => {
  h.prisma = {
    industrialSite: {
      findMany: async (a: Record<string, unknown>) => {
        h.siteQueries.push(a);
        if (h.siteThrows) throw new Error("site lookup failed");
        return h.siteRows;
      },
    },
  };
};

beforeEach(() => {
  h.granted = [];
  h.grantedThrows = false;
  h.prisma = null;
  h.siteRows = [];
  h.siteThrows = false;
  h.siteQueries = [];
  h.grantedCalls = [];
  h.logged = [];
  withDb();
});

describe("resolveSiteScope", () => {
  it("keeps only the granted sites the database confirms as ACTIVE sites of THIS organisation", async () => {
    h.granted = ["a1", "a2"];
    h.siteRows = [{ id: "a1" }];                                   // a2 is inactive: the query does not return it
    expect(await resolveSiteScope("u1", "org-A")).toEqual(["a1"]);
    expect(h.grantedCalls).toEqual([["u1", "org-A"]]);
    expect(h.siteQueries).toHaveLength(1);
    expect(h.siteQueries[0]).toEqual({
      where:  { organizationId: "org-A", status: "ACTIVE", id: { in: ["a1", "a2"] } },
      select: { id: true },
    });
  });

  it("a grant on an inactive site alone yields an EMPTY scope", async () => {
    h.granted = ["a2"];
    h.siteRows = [];
    expect(await resolveSiteScope("u1", "org-A")).toEqual([]);
  });

  it("no grant at all: empty scope and the site table is never read", async () => {
    h.granted = [];
    expect(await resolveSiteScope("u1", "org-A")).toEqual([]);
    expect(h.siteQueries).toHaveLength(0);
  });

  it("the result can never contain a site the official list did not grant, even if the database answers more", async () => {
    h.granted = ["a1"];
    h.siteRows = [{ id: "a1" }, { id: "other-org-site" }, { id: "a9" }];
    expect(await resolveSiteScope("u1", "org-A")).toEqual(["a1"]);
  });

  it("duplicate, empty and non-string ids are normalised before the query and in the result", async () => {
    h.granted = ["a1", "a1", "", null, 7, "a2"];
    h.siteRows = [{ id: "a1" }, { id: "a1" }, { id: "" }, { id: null }, { id: "a2" }];
    expect(await resolveSiteScope("u1", "org-A")).toEqual(["a1", "a2"]);
    expect((h.siteQueries[0].where as { id: { in: string[] } }).id.in).toEqual(["a1", "a2"]);
  });

  it("fails closed: no database", async () => {
    h.granted = ["a1"];
    h.prisma = null;
    expect(await resolveSiteScope("u1", "org-A")).toEqual([]);
  });

  it("fails closed and logs: the site lookup throws", async () => {
    h.granted = ["a1"];
    h.siteThrows = true;
    expect(await resolveSiteScope("u1", "org-A")).toEqual([]);
    expect(h.logged).toHaveLength(1);
    expect(h.logged[0][0]).toBe("database");
    expect(h.logged[0][1]).toBe("digital_twin.resolve_site_scope");
  });

  it("fails closed and logs: the grant lookup throws", async () => {
    h.grantedThrows = true;
    expect(await resolveSiteScope("u1", "org-A")).toEqual([]);
    expect(h.logged).toHaveLength(1);
    expect(h.siteQueries).toHaveLength(0);
  });

  it("an empty user or organisation id resolves to nothing without any lookup", async () => {
    h.granted = ["a1"];
    h.siteRows = [{ id: "a1" }];
    expect(await resolveSiteScope("", "org-A")).toEqual([]);
    expect(await resolveSiteScope("u1", "")).toEqual([]);
    expect(h.grantedCalls).toHaveLength(0);
    expect(h.siteQueries).toHaveLength(0);
  });
});

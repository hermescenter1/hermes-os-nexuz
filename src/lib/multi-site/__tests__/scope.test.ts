/**
 * Multi-site viewer scope (IR-02) — the decision table, without a database.
 *
 * `resolveMultiSiteScope` = official `getAllowedSiteIds` ∩ ACTIVE `IndustrialSite` of the same
 * organisation. The real-PostgreSQL proof that every reader honours it is `pg/multi-site-visibility.pg.test.ts`.
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

import { resolveMultiSiteScope } from "../scope";

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

describe("resolveMultiSiteScope", () => {
  it("keeps only the granted sites the database confirms as ACTIVE sites of THIS organisation", async () => {
    h.granted = ["a1", "a2"];
    h.siteRows = [{ id: "a1" }];
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual(["a1"]);
    expect(h.grantedCalls).toEqual([["u1", "org-A"]]);
    expect(h.siteQueries[0]).toEqual({
      where:  { organizationId: "org-A", status: "ACTIVE", id: { in: ["a1", "a2"] } },
      select: { id: true },
    });
  });

  it("a grant on an inactive site alone yields an EMPTY scope", async () => {
    h.granted = ["a4"];
    h.siteRows = [];
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual([]);
  });

  it("no grant at all: empty scope and the site table is never read", async () => {
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual([]);
    expect(h.siteQueries).toHaveLength(0);
  });

  it("the result can never contain a site the official list did not grant, even if the database answers more", async () => {
    h.granted = ["a1"];
    h.siteRows = [{ id: "a1" }, { id: "other-org-site" }];
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual(["a1"]);
  });

  it("duplicate, empty and non-string ids are normalised; the result is sorted", async () => {
    h.granted = ["a2", "a2", "", null, 7, "a1"];
    h.siteRows = [{ id: "a2" }, { id: "a1" }, { id: "a1" }, { id: "" }, { id: null }];
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual(["a1", "a2"]);
    expect((h.siteQueries[0].where as { id: { in: string[] } }).id.in).toEqual(["a2", "a1"]);
  });

  it("fails closed: no database", async () => {
    h.granted = ["a1"];
    h.prisma = null;
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual([]);
  });

  it("fails closed and logs: the site lookup throws", async () => {
    h.granted = ["a1"];
    h.siteThrows = true;
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual([]);
    expect(h.logged[0]?.slice(0, 2)).toEqual(["database", "multi_site.resolve_scope"]);
  });

  it("fails closed and logs: the grant lookup throws", async () => {
    h.grantedThrows = true;
    expect(await resolveMultiSiteScope("u1", "org-A")).toEqual([]);
    expect(h.logged).toHaveLength(1);
    expect(h.siteQueries).toHaveLength(0);
  });

  it("a missing user or an empty organisation id resolves to nothing without any lookup", async () => {
    h.granted = ["a1"];
    h.siteRows = [{ id: "a1" }];
    expect(await resolveMultiSiteScope(null, "org-A")).toEqual([]);
    expect(await resolveMultiSiteScope(undefined, "org-A")).toEqual([]);
    expect(await resolveMultiSiteScope("", "org-A")).toEqual([]);
    expect(await resolveMultiSiteScope("u1", "")).toEqual([]);
    expect(h.grantedCalls).toHaveLength(0);
    expect(h.siteQueries).toHaveLength(0);
  });
});

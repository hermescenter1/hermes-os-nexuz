/**
 * Multi-site knowledge coverage (slice D1, MS-04) — the counting rules, without a database.
 *
 * A link counts only for an asset of the viewer's scope, and a CASE link only when the canonical case policy
 * (`listVisibleCaseIds`) lists that case for the viewer. The real route against PostgreSQL is
 * `pg/multi-site-generation.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  visible: [] as string[],
  policyScopes: [] as unknown[],
  links: [] as Record<string, unknown>[],
  linkQueries: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/knowledge/case-visibility", () => ({
  MAX_VISIBLE_CASE_IDS: 50000,
  listVisibleCaseIds: async (_db: unknown, scope: unknown) => { h.policyScopes.push(scope); return h.visible; },
}));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    assetKnowledgeLink: {
      findMany: async (a: { where: { organizationId: string; assetId: { in: string[] } } }) => {
        h.linkQueries.push(a);
        return h.links.filter((l) => l.organizationId === a.where.organizationId && a.where.assetId.in.includes(String(l.assetId)));
      },
    },
  }),
}));

import { getSiteKnowledgeCoverage } from "../knowledge";
import { createGraphViewerScope } from "@/lib/knowledge-graph/visibility";

const ORG = "org-A";
const link = (assetId: string, kind: "articleId" | "failureModeId" | "procedureId" | "caseId", ref: string, organizationId = ORG) =>
  ({ organizationId, assetId, articleId: null, failureModeId: null, procedureId: null, caseId: null, [kind]: ref });

beforeEach(() => {
  h.visible = ["case-visible"];
  h.policyScopes = [];
  h.linkQueries = [];
  h.links = [
    link("a1", "caseId", "case-visible"),
    link("a1", "caseId", "case-hidden"),
    link("a2", "caseId", "case-hidden"),          // a2's ONLY link is a hidden case
    link("a3", "articleId", "art-1"),
    link("b1", "caseId", "case-visible"),         // an asset of a site outside the scope
  ];
});

const sites = new Map([["s1", "Site 1"], ["s2", "Site 2"], ["s9", "Hidden site"]]);
const assets = new Map([["s1", ["a1", "a2"]], ["s2", ["a3"]], ["s9", ["b1"]]]);

describe("getSiteKnowledgeCoverage", () => {
  it("only the scope's sites are reported, and only their assets' links are read", async () => {
    const out = await getSiteKnowledgeCoverage(createGraphViewerScope(ORG, ["s1", "s2"], false), sites, assets);
    expect(out.map((s) => s.siteId).sort()).toEqual(["s1", "s2"]);
    expect(h.linkQueries[0]).toMatchObject({ where: { organizationId: ORG, assetId: { in: ["a1", "a2", "a3"] } } });
    expect(JSON.stringify(out)).not.toContain("s9");
  });

  it("a hidden case link adds nothing: not to the case total, not to the covered assets, not to the score", async () => {
    const out = await getSiteKnowledgeCoverage(createGraphViewerScope(ORG, ["s1", "s2"], false), sites, assets);
    const s1 = out.find((s) => s.siteId === "s1")!;
    expect(s1).toMatchObject({ assetCount: 2, assetsWithLinks: 1, totalCaseLinks: 1, coverageScore: 50 });
    const s2 = out.find((s) => s.siteId === "s2")!;
    expect(s2).toMatchObject({ assetCount: 1, assetsWithLinks: 1, totalArticleLinks: 1, totalCaseLinks: 0, coverageScore: 100 });
  });

  it("case visibility is asked of the canonical policy with the viewer's own scope", async () => {
    const scope = createGraphViewerScope(ORG, ["s1"], false);
    await getSiteKnowledgeCoverage(scope, sites, assets);
    expect(h.policyScopes).toEqual([scope]);
  });

  it("with no visible case every case link is dropped", async () => {
    h.visible = [];
    const out = await getSiteKnowledgeCoverage(createGraphViewerScope(ORG, ["s1"], false), sites, assets);
    expect(out).toEqual([expect.objectContaining({ siteId: "s1", assetsWithLinks: 0, totalCaseLinks: 0, coverageScore: 0 })]);
  });

  it("an empty scope reports nothing and reads nothing", async () => {
    expect(await getSiteKnowledgeCoverage(createGraphViewerScope(ORG, [], true), sites, assets)).toEqual([]);
    expect(h.linkQueries).toHaveLength(0);
  });

  it("the order is deterministic: score, then name, then id", async () => {
    h.links = [];
    const out = await getSiteKnowledgeCoverage(createGraphViewerScope(ORG, ["s2", "s1"], false),
      new Map([["s2", "Beta"], ["s1", "Alpha"]]), new Map([["s1", ["a1"]], ["s2", ["a3"]]]));
    expect(out.map((s) => s.siteId)).toEqual(["s1", "s2"]);
  });
});

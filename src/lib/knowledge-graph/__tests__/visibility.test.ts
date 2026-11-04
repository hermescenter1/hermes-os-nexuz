/**
 * RV-01 — the Knowledge Graph visibility policy, without a database.
 *
 * `applyVisibility` is pure, so every rule of the policy is asserted directly; the scope
 * resolver and the entity-set loader are exercised against fakes that record the queries
 * they receive. The real-PostgreSQL proof is in `pg/rv01-kg-site-isolation.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  visibleCaseIds: [] as string[],
  caseQueries: [] as unknown[],
  allowed: [] as string[],
  prisma: null as null | Record<string, unknown>,
  logged: [] as unknown[],
}));
vi.mock("@/lib/site/context", () => ({ getAllowedSiteIds: async () => mocks.allowed }));
vi.mock("@/lib/knowledge/case-visibility", () => ({
  MAX_VISIBLE_CASE_IDS: 50000,
  listVisibleCaseIds: async (_db: unknown, scope: unknown, query: unknown) => { mocks.caseQueries.push({ scope, query }); return mocks.visibleCaseIds; },
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => mocks.prisma }));
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: (...a: unknown[]) => { mocks.logged.push(a); } }));

import {
  KNOWN_EDGE_TYPES,
  NODE_POLICY,
  applyVisibility,
  createGraphViewerScope,
  hasOrganizationLevelAccess,
  loadVisibleEntitySets,
  resolveGraphViewerScope,
  type PolicyEdge,
  type PolicyNode,
  type VisibleEntitySets,
} from "../visibility";

const ORG = "org-1";
const node = (id: string, nodeType: string, entityId: string, extra: Partial<PolicyNode> = {}): PolicyNode =>
  ({ id, organizationId: ORG, nodeType, entityId, metadata: {}, ...extra });
const edge = (id: string, s: string, t: string, edgeType: string, extra: Partial<PolicyEdge> = {}): PolicyEdge =>
  ({ id, organizationId: ORG, sourceNodeId: s, targetNodeId: t, edgeType, evidence: {}, ...extra });

const sets = (p: Partial<Record<keyof VisibleEntitySets, string[]>> = {}): VisibleEntitySets => ({
  assets: new Set(p.assets), tags: new Set(p.tags), twinNodes: new Set(p.twinNodes),
  risks: new Set(p.risks), cases: new Set(p.cases), mitigations: new Set(p.mitigations),
});

const ids = (r: { nodes: PolicyNode[] }) => r.nodes.map((n) => n.id).sort();
const eids = (r: { edges: PolicyEdge[] }) => r.edges.map((e) => e.id).sort();

/** Values of a Prisma enum, read from the schema so a new node/edge type cannot ship without a policy decision. */
function schemaEnum(name: string): string[] {
  const schema = readFileSync(path.join(__dirname, "..", "..", "..", "..", "prisma", "schema.prisma"), "utf8");
  const body = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schema)?.[1] ?? "";
  return body.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean).sort();
}

describe("policy tables stay in step with the schema enums", () => {
  it("every KnowledgeGraphNodeType is classified, and nothing else is", () => {
    expect(schemaEnum("KnowledgeGraphNodeType").length).toBeGreaterThan(0);
    expect(Object.keys(NODE_POLICY).sort()).toEqual(schemaEnum("KnowledgeGraphNodeType"));
  });

  it("every KnowledgeGraphEdgeType is known to the policy, and nothing else is", () => {
    expect(schemaEnum("KnowledgeGraphEdgeType").length).toBeGreaterThan(0);
    expect([...KNOWN_EDGE_TYPES].sort()).toEqual(schemaEnum("KnowledgeGraphEdgeType"));
  });
});

describe("policy tables", () => {
  it("every node type of the schema enum has an explicit class, and the catalogue is a closed list", () => {
    expect(Object.keys(NODE_POLICY).sort()).toEqual(
      ["ASSET", "DIGITAL_TWIN_NODE", "ENGINEERING_CASE", "FAILURE_MODE", "PREDICTIVE_RISK", "PROCEDURE", "ROOT_CAUSE", "TELEMETRY_TAG"],
    );
    const catalog = Object.entries(NODE_POLICY).filter(([, c]) => c === "ORG_CATALOG").map(([t]) => t).sort();
    expect(catalog).toEqual(["FAILURE_MODE", "PROCEDURE", "ROOT_CAUSE"]);
  });

  it("every edge type of the schema enum is known", () => {
    expect([...KNOWN_EDGE_TYPES].sort()).toEqual(
      ["CAUSED_BY", "CONNECTED_TO", "DEPENDS_ON", "DOCUMENTED_IN", "HAS_FAILURE_MODE", "INDICATES_RISK", "MITIGATED_BY", "OBSERVED_ON", "RELATED_TO"],
    );
  });
});

describe("applyVisibility — nodes", () => {
  const all = [
    node("n-asset", "ASSET", "a1"), node("n-asset-x", "ASSET", "a2"),
    node("n-tag", "TELEMETRY_TAG", "t1"), node("n-tag-x", "TELEMETRY_TAG", "t2"),
    node("n-twin", "DIGITAL_TWIN_NODE", "w1"), node("n-twin-x", "DIGITAL_TWIN_NODE", "w2"),
    node("n-risk", "PREDICTIVE_RISK", "r1"), node("n-risk-x", "PREDICTIVE_RISK", "r2"),
    node("n-case", "ENGINEERING_CASE", "c1"), node("n-case-x", "ENGINEERING_CASE", "c2"),
    node("n-fm", "FAILURE_MODE", "fm1"), node("n-rc", "ROOT_CAUSE", "rc1"), node("n-proc", "PROCEDURE", "p1"),
  ];

  it("a site-owned node is visible only when its live owner is in the scope", () => {
    const r = applyVisibility({ nodes: all, edges: [] }, ORG, sets({ assets: ["a1"], tags: ["t1"], twinNodes: ["w1"], risks: ["r1"], cases: ["c1"] }));
    expect(ids(r)).toEqual(["n-asset", "n-case", "n-fm", "n-proc", "n-rc", "n-risk", "n-tag", "n-twin"].sort());
  });

  it("an EMPTY scope (no site) fails closed: only the explicit catalogue survives", () => {
    const r = applyVisibility({ nodes: all, edges: [] }, ORG, sets());
    expect(ids(r)).toEqual(["n-fm", "n-proc", "n-rc"]);
  });

  it("an unknown node type is invisible, whatever else is true of it", () => {
    const r = applyVisibility({ nodes: [node("n-new", "SOMETHING_NEW", "x"), node("n-fm", "FAILURE_MODE", "fm1")], edges: [] }, ORG, sets({ assets: ["x"], tags: ["x"], cases: ["x"] }));
    expect(ids(r)).toEqual(["n-fm"]);
  });

  it("a node of another organisation is dropped even if its entity id is in the visible sets", () => {
    const foreign = node("n-foreign", "ASSET", "a1", { organizationId: "org-2" });
    const foreignCatalog = node("n-foreign-fm", "FAILURE_MODE", "fm9", { organizationId: "org-2" });
    expect(ids(applyVisibility({ nodes: [foreign, foreignCatalog], edges: [] }, ORG, sets({ assets: ["a1"] })))).toEqual([]);
  });

  it("a cached node naming an asset the viewer cannot see is dropped (stale or tampered cache never widens access)", () => {
    const nodes = [
      node("tag", "TELEMETRY_TAG", "t1", { metadata: { assetId: "hidden-asset" } }),
      node("risk", "PREDICTIVE_RISK", "r1", { metadata: { assetId: "hidden-asset" } }),
      node("twin", "DIGITAL_TWIN_NODE", "w1", { metadata: { assetId: "hidden-asset" } }),
      node("case", "ENGINEERING_CASE", "c1", { metadata: { assetId: "hidden-asset" } }),
      node("tag-ok", "TELEMETRY_TAG", "t1", { metadata: { assetId: "a1" } }),
    ];
    const r = applyVisibility({ nodes, edges: [] }, ORG, sets({ assets: ["a1"], tags: ["t1"], risks: ["r1"], twinNodes: ["w1"], cases: ["c1"] }));
    expect(ids(r)).toEqual(["tag-ok"]);
  });

  it("an entity that is not in the visible set (deleted source, broken relation) is invisible — null/absent is never 'public'", () => {
    const r = applyVisibility({ nodes: [node("n", "TELEMETRY_TAG", "ghost")], edges: [] }, ORG, sets({ tags: ["t1"] }));
    expect(ids(r)).toEqual([]);
  });
});

describe("applyVisibility — edges", () => {
  const nodes = [node("A", "ASSET", "a1"), node("B", "ASSET", "a2"), node("F", "FAILURE_MODE", "fm1"), node("P", "PROCEDURE", "p1"), node("C", "ENGINEERING_CASE", "c1"), node("K", "ENGINEERING_CASE", "c2")];
  const visible = sets({ assets: ["a1"], cases: ["c1"] });

  it("an edge survives only when BOTH endpoints are visible", () => {
    const r = applyVisibility({ nodes, edges: [edge("e1", "A", "F", "HAS_FAILURE_MODE"), edge("e2", "B", "F", "HAS_FAILURE_MODE"), edge("e3", "F", "B", "OBSERVED_ON")] }, ORG, visible);
    expect(eids(r)).toEqual(["e1"]);
  });

  it("an edge to a node id that does not exist is dropped (no dangling reference)", () => {
    expect(eids(applyVisibility({ nodes, edges: [edge("e1", "A", "ghost-node", "CONNECTED_TO")] }, ORG, visible))).toEqual([]);
  });

  it("an edge of a type the policy does not know is dropped", () => {
    expect(eids(applyVisibility({ nodes, edges: [edge("e1", "A", "F", "BRAND_NEW_TYPE")] }, ORG, visible))).toEqual([]);
  });

  it("MITIGATED_BY needs a visible asset link as provenance; a catalogue-to-catalogue edge alone is not enough", () => {
    const e = edge("e1", "F", "P", "MITIGATED_BY");
    expect(eids(applyVisibility({ nodes, edges: [e] }, ORG, visible))).toEqual([]);
    expect(eids(applyVisibility({ nodes, edges: [e] }, ORG, sets({ assets: ["a1"], cases: ["c1"], mitigations: ["fm1|p1"] })))).toEqual(["e1"]);
  });

  it("CAUSED_BY between catalogue nodes is organisation-level and survives with an empty scope", () => {
    const n = [node("F", "FAILURE_MODE", "fm1"), node("R", "ROOT_CAUSE", "rc1")];
    expect(eids(applyVisibility({ nodes: n, edges: [edge("e1", "F", "R", "CAUSED_BY")] }, ORG, sets()))).toEqual(["e1"]);
  });

  it("an edge that cites a case the viewer cannot see is dropped even if both endpoints are visible", () => {
    const e = edge("e1", "F", "A", "OBSERVED_ON", { evidence: { caseId: "c2" } });
    expect(eids(applyVisibility({ nodes, edges: [e] }, ORG, visible))).toEqual([]);
    expect(eids(applyVisibility({ nodes, edges: [edge("e2", "F", "A", "OBSERVED_ON", { evidence: { caseId: "c1" } })] }, ORG, visible))).toEqual(["e2"]);
  });

  it("an edge of another organisation is dropped", () => {
    expect(eids(applyVisibility({ nodes, edges: [edge("e1", "A", "F", "HAS_FAILURE_MODE", { organizationId: "org-2" })] }, ORG, visible))).toEqual([]);
  });

  it("the result never contains an edge whose endpoint was removed (self-consistency over a mixed graph)", () => {
    const edges = [edge("e1", "A", "F", "HAS_FAILURE_MODE"), edge("e2", "B", "F", "HAS_FAILURE_MODE"), edge("e3", "F", "P", "MITIGATED_BY"), edge("e4", "C", "A", "DOCUMENTED_IN"), edge("e5", "K", "A", "DOCUMENTED_IN")];
    const r = applyVisibility({ nodes, edges }, ORG, visible);
    const present = new Set(r.nodes.map((n) => n.id));
    expect(r.edges.every((e) => present.has(e.sourceNodeId) && present.has(e.targetNodeId))).toBe(true);
  });
});

describe("createGraphViewerScope / resolveGraphViewerScope", () => {
  beforeEach(() => { mocks.allowed = []; mocks.prisma = null; mocks.logged = []; mocks.visibleCaseIds = []; mocks.caseQueries = []; });

  it("deduplicates and drops empty site ids", () => {
    expect(createGraphViewerScope(ORG, ["s1", "s1", "", "s2"]).allowedSiteIds).toEqual(["s1", "s2"]);
  });

  it("a grant is narrowed to the organisation's ACTIVE sites: a foreign, unknown or inactive site never survives", async () => {
    mocks.allowed = ["s-own", "s-foreign", "s-inactive"];
    const queries: Record<string, unknown>[] = [];
    mocks.prisma = { industrialSite: { findMany: async (a: Record<string, unknown>) => { queries.push(a); return [{ id: "s-own" }]; } } };
    const scope = await resolveGraphViewerScope("u1", ORG, "VIEWER");
    expect(scope.allowedSiteIds).toEqual(["s-own"]);
    expect(scope.organizationLevelAccess).toBe(false);
    expect(scope.organizationId).toBe(ORG);
    expect(queries[0].where).toEqual({ organizationId: ORG, status: "ACTIVE", id: { in: ["s-own", "s-foreign", "s-inactive"] } });
  });

  it("only OWNER and ADMIN carry organisation-level access, even with no site grant at all", async () => {
    for (const role of ["OWNER", "ADMIN"]) expect((await resolveGraphViewerScope("u1", ORG, role)).organizationLevelAccess).toBe(true);
    for (const role of ["MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN", "MEMBER", "", null, undefined, "owner"]) {
      expect((await resolveGraphViewerScope("u1", ORG, role)).organizationLevelAccess, String(role)).toBe(false);
    }
    expect(hasOrganizationLevelAccess("OWNER") && hasOrganizationLevelAccess("ADMIN")).toBe(true);
  });

  it("fails closed: no user, no grant, no database and a database error all give an EMPTY site list", async () => {
    expect((await resolveGraphViewerScope(null, ORG, "OWNER")).allowedSiteIds).toEqual([]);
    expect((await resolveGraphViewerScope("u1", ORG, "VIEWER")).allowedSiteIds).toEqual([]);   // no grant
    mocks.allowed = ["s1"];
    expect((await resolveGraphViewerScope("u1", ORG, "VIEWER")).allowedSiteIds).toEqual([]);   // no database
    mocks.prisma = { industrialSite: { findMany: async () => { throw new Error("connection lost"); } } };
    expect((await resolveGraphViewerScope("u1", ORG, "VIEWER")).allowedSiteIds).toEqual([]);
    expect(mocks.logged).toHaveLength(1);
  });
});

describe("loadVisibleEntitySets — the organisation AND site predicate are inside every query", () => {
  beforeEach(() => { mocks.visibleCaseIds = []; mocks.caseQueries = []; });

  /**
   * `rows` feeds the delegate reads; `raw` feeds the two bounded statements slice E1 introduced
   * (latest risk row per asset, and the mitigation pairs — independent review S2-03).
   */
  function fakeDb(
    rows: Partial<Record<string, Record<string, unknown>[]>> = {},
    raw: { risk?: Record<string, unknown>[]; mitigations?: Record<string, unknown>[] } = {},
  ) {
    const calls: { model: string; args: Record<string, unknown> }[] = [];
    const statements: { sql: string; values: unknown[] }[] = [];
    const target: Record<string, unknown> = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        statements.push({ sql, values });
        if (sql.includes('"AssetRiskScore"')) return raw.risk ?? [];
        if (sql.includes('"AssetKnowledgeLink"')) return raw.mitigations ?? [];
        throw new Error("unexpected raw statement: " + sql);
      },
    };
    const db = new Proxy(target, {
      get: (t, model: string) => (model in t ? t[model] : { findMany: async (args: Record<string, unknown>) => { calls.push({ model, args }); return rows[model] ?? []; } }),
    }) as Record<string, unknown>;
    return { db, calls, statements };
  }

  it("no site: only the shared case policy runs; no site-scoped table is read", async () => {
    mocks.visibleCaseIds = ["c-org"];
    const { db, calls } = fakeDb();
    const r = await loadVisibleEntitySets(db, createGraphViewerScope(ORG, [], true));
    expect(calls).toEqual([]);                                  // nothing site-scoped was queried
    expect(mocks.caseQueries).toHaveLength(1);                  // cases come ONLY from the shared policy
    expect((mocks.caseQueries[0] as { scope: { organizationLevelAccess: boolean } }).scope.organizationLevelAccess).toBe(true);
    expect([...r.cases]).toEqual(["c-org"]);
    expect(r.assets.size + r.tags.size + r.twinNodes.size + r.risks.size + r.mitigations.size).toBe(0);
  });

  it("with sites: every site-scoped table is filtered by organisationId and by the site (directly or through its asset)", async () => {
    mocks.visibleCaseIds = ["c-site", "c-asset-only"];
    const { db, calls, statements } = fakeDb({
      industrialAsset: [{ id: "a1" }],
      assetTag: [{ id: "t1" }],
      digitalTwinNode: [{ id: "w-ok", assetId: "a1" }, { id: "w-null", assetId: null }, { id: "w-mismatch", assetId: "a-other-site" }],
    }, {
      // One row per visible asset (DISTINCT ON), and the already-aggregated provenance pairs.
      risk: [{ id: "r1" }],
      mitigations: [{ failureModeId: "fm1", procedureId: "p1" }],
    });
    const r = await loadVisibleEntitySets(db, createGraphViewerScope(ORG, ["s1"]));
    const where = (m: string) => calls.find((c) => c.model === m)!.args.where as Record<string, unknown>;
    expect(where("industrialAsset")).toEqual({ organizationId: ORG, siteId: { in: ["s1"] } });
    expect(where("digitalTwinNode")).toEqual({ organizationId: ORG, siteId: { in: ["s1"] } });
    expect(where("assetTag")).toEqual({ organizationId: ORG, asset: { is: { organizationId: ORG, siteId: { in: ["s1"] } } } });
    expect(calls.map((c) => c.model)).not.toContain("industrialEngineeringCase");   // no private case logic left in the graph
    // Slice E1 / S2-03: risk and knowledge links are no longer read through a delegate at all — they are
    // bounded statements whose predicates (organisation + the visible sites) live in SQL.
    expect(calls.map((c) => c.model)).not.toContain("assetRiskScore");
    expect(calls.map((c) => c.model)).not.toContain("assetKnowledgeLink");
    expect(statements).toHaveLength(2);
    const riskSql = statements.find((s) => s.sql.includes('"AssetRiskScore"'))!;
    expect(riskSql.sql).toContain('SELECT DISTINCT ON (r."assetId")');
    expect(riskSql.sql).toContain('ORDER BY r."assetId" ASC, r."createdAt" DESC, r."id" ASC');
    expect(riskSql.values).toEqual([ORG, ORG, ["s1"]]);
    const linkSql = statements.find((s) => s.sql.includes('"AssetKnowledgeLink"'))!;
    expect(linkSql.sql).toContain("SELECT DISTINCT");
    expect(linkSql.sql).toContain('a."siteId" = ANY(?::text[])');
    expect(linkSql.values).toEqual([ORG, ORG, ["s1"]]);
    for (const st of statements) for (const v of [ORG, "s1"]) expect(st.sql).not.toContain(v);

    expect([...r.assets]).toEqual(["a1"]);
    expect([...r.twinNodes].sort()).toEqual(["w-null", "w-ok"]);                // the node pointing at another site's asset is ambiguous
    expect([...r.cases].sort()).toEqual(["c-asset-only", "c-site"]);             // exactly what the shared policy returned
    expect([...r.mitigations]).toEqual(["fm1|p1"]);                              // provenance only from a VISIBLE asset
  });

  it("a database error propagates (the caller fails closed); it is never swallowed into an empty-but-permissive result", async () => {
    // every model is present and every query fails, so no promise is left un-awaited
    const db = new Proxy({ $queryRaw: async () => { throw new Error("boom"); } }, {
      get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : { findMany: async () => { throw new Error("boom"); } }),
    }) as Record<string, unknown>;
    await expect(loadVisibleEntitySets(db, createGraphViewerScope(ORG, ["s1"]))).rejects.toThrow("boom");
  });

  it("without a raw-query capability the sets cannot be built at all (fail closed, never permissive)", async () => {
    const db = new Proxy({}, { get: () => ({ findMany: async () => [] }) }) as Record<string, unknown>;
    await expect(loadVisibleEntitySets(db, createGraphViewerScope(ORG, ["s1"]))).rejects.toThrow("GRAPH_VISIBILITY_QUERY_UNAVAILABLE");
  });
});

describe("structural guard — there is no org-wide entry point left", () => {
  const read = (f: string) => readFileSync(path.join(__dirname, "..", f), "utf8");

  it("query, reasoning and copilot take a GraphViewerScope, never a bare organisation id", () => {
    for (const f of ["query.ts", "reasoning.ts", "copilot.ts"]) {
      expect(read(f), f).not.toMatch(/\borgId\s*:\s*string/);
    }
  });

  it("the raw organisation-wide loader no longer exists", () => {
    expect(read("query.ts")).not.toMatch(/loadOrgGraph/);
  });
});

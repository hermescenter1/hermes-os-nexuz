/**
 * Scoped, bounded Digital Twin traversal (slice C, IR-03) — without a database.
 *
 * `getUpstreamAssets` / `getDownstreamAssets` used to read every relation of the organisation with no
 * bound. The fake client below evaluates the `where` it receives the way PostgreSQL would, so the tests
 * prove what the QUERY asks for, not only what the function does with the answer. The real-PostgreSQL
 * proof through the Copilot route is `src/lib/copilot/__tests__/pg/copilot-site-scope.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Node = { id: string; organizationId: string; siteId: string; displayName: string; nodeType: string; assetId: string | null; createdAt: Date };
type Rel = { id: string; organizationId: string; sourceNodeId: string; targetNodeId: string; relationType: string; createdAt: Date };
const h = vi.hoisted(() => ({ nodes: [] as unknown[], rels: [] as unknown[], relQueries: [] as unknown[], nodeQueries: [] as unknown[], noDb: false }));

const inList = (v: unknown, cond: unknown): boolean => {
  if (cond === undefined) return true;
  if (cond && typeof cond === "object" && "in" in (cond as Record<string, unknown>)) return ((cond as { in: unknown[] }).in).includes(v);
  return v === cond;
};
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => h.noDb ? null : ({
    digitalTwinNode: {
      findMany: async (a: { where: Record<string, unknown>; take?: number }) => {
        h.nodeQueries.push(a);
        const rows = (h.nodes as Node[]).filter((n) => inList(n.id, a.where.id) && inList(n.organizationId, a.where.organizationId) && inList(n.siteId, a.where.siteId));
        return rows.slice(0, a.take ?? rows.length).map((n) => ({ ...n, parentNodeId: null, metadata: {}, updatedAt: n.createdAt }));
      },
    },
    digitalTwinRelation: {
      findMany: async (a: { where: { organizationId: string; sourceNode?: Record<string, unknown>; targetNode?: Record<string, unknown> }; take?: number }) => {
        h.relQueries.push(a);
        const node = (id: string) => (h.nodes as Node[]).find((n) => n.id === id);
        const ok = (id: string, f?: Record<string, unknown>) => {
          if (!f) return true;
          const n = node(id);
          return !!n && inList(n.organizationId, f.organizationId) && inList(n.siteId, f.siteId);
        };
        const rows = (h.rels as Rel[])
          .filter((r) => r.organizationId === a.where.organizationId && ok(r.sourceNodeId, a.where.sourceNode) && ok(r.targetNodeId, a.where.targetNode))
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id.localeCompare(y.id));
        return rows.slice(0, a.take ?? rows.length).map((r) => ({ ...r, metadata: {} }));
      },
    },
  }),
}));

import { getAssetGraph, getDownstreamAssets, getUpstreamAssets, MAX_TRAVERSAL_RESULT_NODES } from "../graph";
import { MAX_TRAVERSAL_DEPTH } from "../types";

const ORG = "org-A";
let t = 0;
const node = (id: string, siteId: string, organizationId = ORG): Node =>
  ({ id, organizationId, siteId, displayName: `name-${id}`, nodeType: "ASSET", assetId: null, createdAt: new Date(2026, 0, 1, 0, 0, t++) });
const rel = (id: string, s: string, tt: string, organizationId = ORG): Rel =>
  ({ id, organizationId, sourceNodeId: s, targetNodeId: tt, relationType: "FEEDS", createdAt: new Date(2026, 0, 1, 0, 0, t++) });

beforeEach(() => {
  t = 0;
  // A1: a → b → c ; a → x (x is on hidden site A2) ; x → d (d on A1, reachable only THROUGH the hidden x)
  h.nodes = [node("a", "A1"), node("b", "A1"), node("c", "A1"), node("d", "A1"), node("x", "A2"), node("f", "B1", "org-B")];
  h.rels = [rel("r-ab", "a", "b"), rel("r-bc", "b", "c"), rel("r-ax", "a", "x"), rel("r-xd", "x", "d"), rel("r-af", "a", "f")];
  h.relQueries = [];
  h.nodeQueries = [];
  h.noDb = false;
});

const ids = (r: { nodes: { id: string }[] }) => r.nodes.map((n) => n.id);

describe("scoped traversal", () => {
  it("returns only nodes of the allowed sites and never walks THROUGH a hidden node", async () => {
    const r = await getDownstreamAssets("a", ORG, ["A1"]);
    expect(ids(r).sort()).toEqual(["b", "c"]);              // not x (A2), not d (only reachable via x), not f (org B)
    expect(JSON.stringify(r)).not.toContain("name-x");
  });

  it("the relation read asks for BOTH endpoints on allowed sites of the organisation, ordered and bounded", async () => {
    await getDownstreamAssets("a", ORG, ["A1"]);
    expect(h.relQueries[0]).toMatchObject({
      where: { organizationId: ORG, sourceNode: { organizationId: ORG, siteId: { in: ["A1"] } }, targetNode: { organizationId: ORG, siteId: { in: ["A1"] } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(typeof (h.relQueries[0] as { take: number }).take).toBe("number");
  });

  it("with both sites allowed the hidden branch becomes visible (the filter is the site scope, nothing else)", async () => {
    expect(ids(await getDownstreamAssets("a", ORG, ["A1", "A2"])).sort()).toEqual(["b", "c", "d", "x"]);
  });

  it("upstream follows edges backwards within the same scope", async () => {
    expect(ids(await getUpstreamAssets("c", ORG, ["A1"])).sort()).toEqual(["a", "b"]);
    expect(ids(await getUpstreamAssets("d", ORG, ["A1"]))).toEqual([]);              // its only parent is hidden
  });

  it("a start node outside the scope (hidden site, other organisation, missing) yields nothing and reads no relation", async () => {
    for (const start of ["x", "f", "nope"]) {
      h.relQueries = [];
      expect(await getDownstreamAssets(start, ORG, ["A1"]), start).toEqual({ nodes: [], cycleDetected: false, truncated: false });
      expect(h.relQueries, start).toHaveLength(0);
    }
  });

  it("an empty scope returns nothing without touching the database", async () => {
    expect(await getDownstreamAssets("a", ORG, [])).toEqual({ nodes: [], cycleDetected: false, truncated: false });
    expect(h.nodeQueries).toHaveLength(0);
    expect(h.relQueries).toHaveLength(0);
  });

  it("depth is bounded: maxDepth 1 returns direct neighbours only and reports truncation", async () => {
    const r = await getDownstreamAssets("a", ORG, ["A1"], { maxDepth: 1 });
    expect(ids(r)).toEqual(["b"]);
    expect(r.truncated).toBe(true);
  });

  it("a requested depth or size beyond the server maximum is clamped, never honoured", async () => {
    // a chain longer than the maximum depth
    h.nodes = Array.from({ length: MAX_TRAVERSAL_DEPTH + 5 }, (_, i) => node(`n${i}`, "A1"));
    h.rels = Array.from({ length: MAX_TRAVERSAL_DEPTH + 4 }, (_, i) => rel(`r${i}`, `n${i}`, `n${i + 1}`));
    const r = await getDownstreamAssets("n0", ORG, ["A1"], { maxDepth: 10_000, maxNodes: 10_000 });
    expect(r.nodes.length).toBe(MAX_TRAVERSAL_DEPTH);
    expect(r.truncated).toBe(true);
  });

  it("the result size is bounded by MAX_TRAVERSAL_RESULT_NODES and reports truncation", async () => {
    const n = MAX_TRAVERSAL_RESULT_NODES + 10;
    h.nodes = [node("hub", "A1"), ...Array.from({ length: n }, (_, i) => node(`leaf${String(i).padStart(4, "0")}`, "A1"))];
    h.rels = Array.from({ length: n }, (_, i) => rel(`r${i}`, "hub", `leaf${String(i).padStart(4, "0")}`));
    const r = await getDownstreamAssets("hub", ORG, ["A1"], { maxNodes: 10_000 });
    expect(r.nodes.length).toBe(MAX_TRAVERSAL_RESULT_NODES);
    expect(r.truncated).toBe(true);
    const small = await getDownstreamAssets("hub", ORG, ["A1"], { maxNodes: 3 });
    expect(small.nodes.length).toBe(3);
  });

  it("the order is deterministic (same input, same output) and follows the traversal", async () => {
    const one = ids(await getDownstreamAssets("a", ORG, ["A1", "A2"]));
    const two = ids(await getDownstreamAssets("a", ORG, ["A1", "A2"]));
    expect(one).toEqual(two);
  });

  it("no database: nothing", async () => {
    h.noDb = true;
    expect(await getUpstreamAssets("a", ORG, ["A1"])).toEqual({ nodes: [], cycleDetected: false, truncated: false });
  });
});

/**
 * Independent review S3-02 / slice E1: `getAssetGraph` is intrinsically scoped — the site it is asked
 * for must be one the caller may read. Every production caller already authorised the site; this makes
 * that a property of the function itself, so a future caller cannot reach a site by forgetting a check.
 */
describe("getAssetGraph — the site must be inside the caller's scope", () => {
  it("serves a site that IS in scope", async () => {
    const g = await getAssetGraph(ORG, "A1", ["A1"]);
    expect(g).not.toBeNull();
    expect(g!.siteId).toBe("A1");
    expect([...g!.nodes.keys()].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("refuses a site OUTSIDE the scope, an empty scope and a foreign site — and reads nothing at all", async () => {
    h.nodeQueries = []; h.relQueries = [];
    expect(await getAssetGraph(ORG, "A2", ["A1"])).toBeNull();        // hidden site of this organisation
    expect(await getAssetGraph(ORG, "A1", [])).toBeNull();            // empty scope
    expect(await getAssetGraph(ORG, "B1", ["A1"])).toBeNull();        // another organisation's site
    expect(await getAssetGraph(ORG, "", ["A1", ""])).toBeNull();      // malformed site id
    expect(h.nodeQueries).toEqual([]);
    expect(h.relQueries).toEqual([]);
  });
});

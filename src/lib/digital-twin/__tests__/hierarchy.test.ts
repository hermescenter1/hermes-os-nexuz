/**
 * Digital Twin Slice 1 — hierarchy (cycle) checks and traversal bounds.
 *
 * Runs against an in-memory fake of the two Prisma calls the checks use. The
 * REAL-database behaviour (including the concurrent-writer case) is covered by
 * the PostgreSQL suite; this file proves the algorithm and, above all, that it
 * is bounded and fails closed.
 */
import { describe, expect, it } from "vitest";
import { assertParentChainAcyclic, assertPartOfAcyclic } from "../hierarchy";
import { TWIN_LIMITS } from "../schemas";
import { buildAdjacency, findDependencyPath, traverseDownstream, traverseUpstream } from "../relations";
import { MAX_TRAVERSAL_DEPTH, type TwinRelationRecord } from "../types";
import type { TwinTx } from "../tx";

const ORG = "org-1";

interface Edge { s: string; t: string; type: string }

/** A fake transaction over an edge list + a parent map, counting its queries. */
function fakeTx(edges: Edge[], parents: Record<string, string | null> = {}) {
  const stats = { relationQueries: 0, nodeQueries: 0 };
  const tx = {
    digitalTwinRelation: {
      findMany: async (a: { where: { organizationId: string; relationType: string; sourceNodeId: { in: string[] } }; take?: number }) => {
        stats.relationQueries++;
        expect(a.where.organizationId).toBe(ORG); // every query is tenant-scoped
        const rows = edges
          .filter((e) => e.type === a.where.relationType && a.where.sourceNodeId.in.includes(e.s))
          .map((e) => ({ targetNodeId: e.t }));
        return a.take ? rows.slice(0, a.take) : rows;
      },
    },
    digitalTwinNode: {
      findFirst: async (a: { where: { id: string; organizationId: string } }) => {
        stats.nodeQueries++;
        expect(a.where.organizationId).toBe(ORG);
        return a.where.id in parents ? { parentNodeId: parents[a.where.id] } : null;
      },
    },
  } as unknown as TwinTx;
  return { tx, stats };
}

const part = (s: string, t: string): Edge => ({ s, t, type: "PART_OF" });

describe("assertPartOfAcyclic — adding `source PART_OF target`", () => {
  it("accepts an edge into an empty hierarchy", async () => {
    const { tx } = fakeTx([]);
    await expect(assertPartOfAcyclic(tx, ORG, "a", "b")).resolves.toBeUndefined();
  });

  it("rejects a self-loop", async () => {
    const { tx } = fakeTx([]);
    await expect(assertPartOfAcyclic(tx, ORG, "a", "a")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE", status: 422 });
  });

  it("rejects a DIRECT cycle (b is already part of a; a becoming part of b)", async () => {
    const { tx } = fakeTx([part("a", "b")]); // a PART_OF b exists
    await expect(assertPartOfAcyclic(tx, ORG, "b", "a")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });

  it("rejects a MULTI-HOP cycle", async () => {
    const { tx } = fakeTx([part("a", "b"), part("b", "c"), part("c", "d")]);
    await expect(assertPartOfAcyclic(tx, ORG, "d", "a")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
    await expect(assertPartOfAcyclic(tx, ORG, "c", "a")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });

  it("accepts a graph without a cycle, including a diamond", async () => {
    // d PART_OF b, d PART_OF c, b PART_OF a, c PART_OF a — a diamond is not a cycle.
    const { tx } = fakeTx([part("d", "b"), part("d", "c"), part("b", "a"), part("c", "a")]);
    await expect(assertPartOfAcyclic(tx, ORG, "e", "d")).resolves.toBeUndefined();
    await expect(assertPartOfAcyclic(tx, ORG, "a", "z")).resolves.toBeUndefined();
  });

  it("ignores non-hierarchical relation types", async () => {
    // FEEDS loops are legitimate process topology and must not trip the check.
    const { tx } = fakeTx([{ s: "a", t: "b", type: "FEEDS" }, { s: "b", t: "c", type: "FEEDS" }]);
    await expect(assertPartOfAcyclic(tx, ORG, "c", "a")).resolves.toBeUndefined();
  });

  it("terminates on pre-existing cyclic data that does not involve the new edge", async () => {
    const { tx } = fakeTx([part("x", "y"), part("y", "x")]);
    await expect(assertPartOfAcyclic(tx, ORG, "p", "x")).resolves.toBeUndefined();
  });

  it("BOUNDED: refuses (fails closed) when the chain is deeper than the depth cap", async () => {
    const edges: Edge[] = [];
    const n = TWIN_LIMITS.HIERARCHY_MAX_DEPTH + 10;
    for (let i = 0; i < n; i++) edges.push(part(`n${i}`, `n${i + 1}`));
    const { tx, stats } = fakeTx(edges);
    await expect(assertPartOfAcyclic(tx, ORG, "new", "n0")).rejects.toMatchObject({
      code: "HIERARCHY_TOO_DEEP",
      status: 422,
    });
    // One query per level, never more than the cap: the work is bounded.
    expect(stats.relationQueries).toBeLessThanOrEqual(TWIN_LIMITS.HIERARCHY_MAX_DEPTH);
  });

  it("BOUNDED: refuses when the reachable set is larger than the visited cap", async () => {
    const edges: Edge[] = [];
    for (let i = 0; i < TWIN_LIMITS.HIERARCHY_MAX_VISITED + 5; i++) edges.push(part("root", `leaf${i}`));
    const { tx } = fakeTx(edges);
    await expect(assertPartOfAcyclic(tx, ORG, "new", "root")).rejects.toMatchObject({ code: "HIERARCHY_TOO_DEEP" });
  });

  it("a chain exactly within the cap is still verified (and still finds the cycle at its far end)", async () => {
    const edges: Edge[] = [];
    const n = TWIN_LIMITS.HIERARCHY_MAX_DEPTH - 2;
    for (let i = 0; i < n; i++) edges.push(part(`n${i}`, `n${i + 1}`));
    const { tx } = fakeTx(edges);
    await expect(assertPartOfAcyclic(tx, ORG, `n${n}`, "n0")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });
});

describe("assertParentChainAcyclic — setting node.parentNodeId", () => {
  it("accepts a parent with no ancestors", async () => {
    const { tx } = fakeTx([], { p: null });
    await expect(assertParentChainAcyclic(tx, ORG, "n", "p")).resolves.toBeUndefined();
  });

  it("rejects making a node its own parent", async () => {
    const { tx } = fakeTx([], { n: null });
    await expect(assertParentChainAcyclic(tx, ORG, "n", "n")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });

  it("rejects making a DESCENDANT the parent (direct)", async () => {
    // child.parent = n  → n.parent = child would loop.
    const { tx } = fakeTx([], { child: "n", n: null });
    await expect(assertParentChainAcyclic(tx, ORG, "n", "child")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });

  it("rejects making a DESCENDANT the parent (multi-hop)", async () => {
    const { tx } = fakeTx([], { c3: "c2", c2: "c1", c1: "n", n: null });
    await expect(assertParentChainAcyclic(tx, ORG, "n", "c3")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });

  it("accepts an unrelated branch", async () => {
    const { tx } = fakeTx([], { other: "root", root: null, n: "root" });
    await expect(assertParentChainAcyclic(tx, ORG, "n", "other")).resolves.toBeUndefined();
  });

  it("refuses when the EXISTING data already loops above the new parent", async () => {
    const { tx } = fakeTx([], { a: "b", b: "a" });
    await expect(assertParentChainAcyclic(tx, ORG, "n", "a")).rejects.toMatchObject({ code: "HIERARCHY_CYCLE" });
  });

  it("BOUNDED: refuses a parent chain deeper than the cap", async () => {
    const parents: Record<string, string | null> = {};
    const n = TWIN_LIMITS.HIERARCHY_MAX_DEPTH + 10;
    for (let i = 0; i < n; i++) parents[`p${i}`] = `p${i + 1}`;
    parents[`p${n}`] = null;
    const { tx, stats } = fakeTx([], parents);
    await expect(assertParentChainAcyclic(tx, ORG, "n", "p0")).rejects.toMatchObject({ code: "HIERARCHY_TOO_DEEP" });
    expect(stats.nodeQueries).toBeLessThanOrEqual(TWIN_LIMITS.HIERARCHY_MAX_DEPTH);
  });

  it("a missing parent row ends the walk (the ownership check, not this one, reports it)", async () => {
    const { tx } = fakeTx([], {});
    await expect(assertParentChainAcyclic(tx, ORG, "n", "ghost")).resolves.toBeUndefined();
  });
});

describe("existing in-memory traversal stays bounded and cycle-safe", () => {
  const rel = (s: string, t: string, type: TwinRelationRecord["relationType"] = "FEEDS"): TwinRelationRecord => ({
    id: `${s}-${t}`, organizationId: ORG, sourceNodeId: s, targetNodeId: t, relationType: type, metadata: {}, createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("terminates on a cycle and reports it", () => {
    const { forward } = buildAdjacency([rel("a", "b"), rel("b", "c"), rel("c", "a")]);
    const r = traverseDownstream("a", forward);
    expect(r.cycleDetected).toBe(true);
    expect(r.nodeIds.sort()).toEqual(["b", "c"]);
  });

  it("truncates a chain longer than MAX_TRAVERSAL_DEPTH instead of walking it", () => {
    const rels: TwinRelationRecord[] = [];
    for (let i = 0; i < MAX_TRAVERSAL_DEPTH + 25; i++) rels.push(rel(`n${i}`, `n${i + 1}`));
    const { forward, backward } = buildAdjacency(rels);
    expect(traverseDownstream("n0", forward).truncated).toBe(true);
    expect(traverseUpstream(`n${MAX_TRAVERSAL_DEPTH + 25}`, backward).truncated).toBe(true);
    expect(findDependencyPath("n0", `n${MAX_TRAVERSAL_DEPTH + 25}`, forward)).toBeNull();
  });

  it("a bidirectional relation is walkable both ways", () => {
    const { forward } = buildAdjacency([rel("a", "b", "CONNECTED_TO")]);
    expect(findDependencyPath("b", "a", forward)).toEqual(["b", "a"]);
  });

  it("a diamond reaches each node exactly once", () => {
    // NOTE: traverseDownstream sets `cycleDetected` on ANY revisit, so a diamond
    // (no cycle) is reported as cyclic. That is pre-existing behaviour, out of scope
    // for Slice 1 and deliberately not asserted here — see the Slice 1 open risks.
    const { forward } = buildAdjacency([rel("a", "b"), rel("a", "c"), rel("b", "d"), rel("c", "d")]);
    expect(traverseDownstream("a", forward).nodeIds.sort()).toEqual(["b", "c", "d"]);
  });
});

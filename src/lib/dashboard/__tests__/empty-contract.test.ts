import { describe, it, expect } from "vitest";
import {
  classifyEmpty,
  isEmptyGraphOverview,
  isEmptySiteCollection,
  isEmptyPatternCollection,
  isEmptyBenchmark,
} from "../empty-contract";
import type { LoadState } from "../load-state";

/**
 * GATE B.1 F01 — the pinned state contract, per route:
 *
 *   valid populated payload -> success (READY)
 *   valid empty payload     -> empty   (EMPTY)
 *   invalid payload         -> invalidResponse
 *
 * The third line is owned by `loadJson`'s shape guard and is covered in
 * load-state.test.ts. The first two are owned by the ROUTE, and were untestable
 * while the decision lived inside a `.then()` in a client component — which is
 * how the Knowledge Graph shipped an `empty` branch nothing could reach.
 */

const success = <T>(data: T): LoadState<T> => ({ kind: "success", data });

describe("classifyEmpty — the transform itself", () => {
  it("promotes a valid EMPTY success to the empty state", () => {
    expect(classifyEmpty(success({ sites: [] }), isEmptySiteCollection)).toEqual({ kind: "empty" });
  });

  it("leaves a populated success untouched, payload and all", () => {
    const state = success({ sites: [{ id: "s1" }] });
    expect(classifyEmpty(state, isEmptySiteCollection)).toBe(state);
  });

  it("NEVER relabels a failure as empty — an error is not 'no data'", () => {
    for (const kind of ["unauthorized", "forbidden", "notFound", "requestError", "invalidResponse", "loading"] as const) {
      const state = { kind } as LoadState<{ sites: unknown[] }>;
      expect(classifyEmpty(state, isEmptySiteCollection)).toBe(state);
    }
  });

  it("does not call the predicate for a non-success state", () => {
    let called = false;
    const predicate = () => { called = true; return true; };
    classifyEmpty({ kind: "unauthorized" } as LoadState<never>, predicate);
    expect(called).toBe(false);
  });
});

describe("Knowledge Graph — /api/industrial-graph", () => {
  const populated = {
    nodeCount: 12,
    edgeCount: 7,
    nodesByType: { ASSET: 8, FAILURE_MODE: 4 },
    edgesByType: { CAUSES: 7 },
    staleness: { lastBuiltAt: "2026-01-01T00:00:00.000Z", stale: false, stalenessWarning: null },
  };
  const empty = {
    nodeCount: 0,
    edgeCount: 0,
    nodesByType: {},
    edgesByType: {},
    staleness: { lastBuiltAt: null, stale: false, stalenessWarning: null },
  };

  it("valid populated GraphOverview -> READY", () => {
    expect(classifyEmpty(success(populated), isEmptyGraphOverview)).toEqual(success(populated));
  });

  it("valid empty GraphOverview -> EMPTY", () => {
    expect(classifyEmpty(success(empty), isEmptyGraphOverview)).toEqual({ kind: "empty" });
  });

  it("a graph with nodes but no edges is READY, not EMPTY — isolated nodes are content", () => {
    expect(isEmptyGraphOverview({ nodeCount: 3, edgeCount: 0 })).toBe(false);
  });

  /*
   * The counts are authoritative because query.ts derives both the counts and
   * the type maps from the same arrays. This pins that reading: a payload whose
   * counts are zero is EMPTY regardless of what the maps happen to contain, so
   * the classifier can never be quietly rewritten to depend on map shape.
   */
  it("classifies on the counts, which the API derives from the same arrays as the type maps", () => {
    expect(isEmptyGraphOverview({ nodeCount: 0, edgeCount: 0 })).toBe(true);
  });
});

describe("Multi-site KPI — /api/multi-site/kpis", () => {
  it("valid populated -> READY", () => {
    const data = { sites: [{ siteId: "a", dataStatus: "ok" }] };
    expect(classifyEmpty(success(data), isEmptySiteCollection)).toEqual(success(data));
  });
  it("sites=[] -> EMPTY", () => {
    expect(classifyEmpty(success({ sites: [] }), isEmptySiteCollection)).toEqual({ kind: "empty" });
  });
});

describe("Multi-site Risk — /api/multi-site/risk", () => {
  it("valid populated -> READY", () => {
    const data = { sites: [{ siteId: "a", riskScore: 42 }] };
    expect(classifyEmpty(success(data), isEmptySiteCollection)).toEqual(success(data));
  });
  it("sites=[] -> EMPTY", () => {
    expect(classifyEmpty(success({ sites: [] }), isEmptySiteCollection)).toEqual({ kind: "empty" });
  });
});

describe("Multi-site Failures — /api/multi-site/failure-patterns", () => {
  it("valid populated -> READY", () => {
    const data = { patterns: [{ id: "p1" }] };
    expect(classifyEmpty(success(data), isEmptyPatternCollection)).toEqual(success(data));
  });
  it("patterns=[] -> EMPTY", () => {
    expect(classifyEmpty(success({ patterns: [] }), isEmptyPatternCollection)).toEqual({ kind: "empty" });
  });
});

describe("Multi-site Benchmarks — /api/multi-site/benchmarks", () => {
  const none = { riskRanking: [], kpiComparison: [], failurePatterns: [] };

  it("valid populated -> READY", () => {
    const data = { ...none, riskRanking: [{ id: "s1" }] };
    expect(classifyEmpty(success(data), isEmptyBenchmark)).toEqual(success(data));
  });

  it("all three result collections empty -> EMPTY", () => {
    expect(classifyEmpty(success(none), isEmptyBenchmark)).toEqual({ kind: "empty" });
  });

  /*
   * The contract is AND, not OR. Two empty collections and one populated is a
   * usable comparison; an `||` here would hide real results behind an empty
   * state, so each collection is pinned individually.
   */
  it("is NOT empty when any single collection is populated", () => {
    expect(isEmptyBenchmark({ ...none, riskRanking: [{}] })).toBe(false);
    expect(isEmptyBenchmark({ ...none, kpiComparison: [{}] })).toBe(false);
    expect(isEmptyBenchmark({ ...none, failurePatterns: [{}] })).toBe(false);
    expect(isEmptyBenchmark(none)).toBe(true);
  });
});

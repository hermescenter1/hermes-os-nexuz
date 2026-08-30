import type { LoadState } from "./load-state";

/**
 * GATE B.1 F01 — route-owned EMPTY semantics.
 *
 * `loadJson` is deliberately not involved. It answers a transport-and-shape
 * question and is right to return `success` for any structurally valid body:
 * whether a *valid* payload carries anything is a question only the route can
 * answer, because "nothing to show" means something different on every surface.
 *
 * The pinned state contract is:
 *
 *   valid populated payload  -> success  (READY)
 *   valid empty payload      -> empty    (EMPTY)
 *   invalid payload          -> invalidResponse
 *
 * These predicates exist as a module rather than inline in each page so the
 * contract is executable. The Knowledge Graph rendered an `empty` branch that
 * nothing could ever produce, and no test could catch that while the decision
 * lived inside a `.then()` in a client component.
 */

/**
 * Promote a valid-but-empty success to `empty`. Every other state is passed
 * through untouched — an error must never be re-labelled as "no data".
 */
export function classifyEmpty<T>(state: LoadState<T>, isEmpty: (data: T) => boolean): LoadState<T> {
  if (state.kind !== "success") return state;
  return isEmpty(state.data) ? { kind: "empty" } : state;
}

/**
 * Knowledge Graph.
 *
 * The counts are authoritative: `/api/industrial-graph` returns the result of
 * `getKnowledgeGraph`, where `nodeCount = nodes.length`, `edgeCount =
 * edges.length`, and `nodesByType` / `edgesByType` are accumulated FROM those
 * same arrays (src/lib/knowledge-graph/query.ts). Zero counts therefore already
 * imply empty type maps, so requiring the maps as well adds no information.
 *
 * It would also be actively wrong to require them for a different reason: the
 * unrelated `buildSummary` in src/lib/analytics/knowledge-graph.ts pre-seeds
 * every type key at 0, so a map-based test written against THAT shape would
 * never fire. This route is fed by query.ts, not by that function.
 */
export const isEmptyGraphOverview = (data: { nodeCount: number; edgeCount: number }): boolean =>
  data.nodeCount === 0 && data.edgeCount === 0;

/** Multi-site KPI and Risk: a response listing no sites. */
export const isEmptySiteCollection = (data: { sites: readonly unknown[] }): boolean =>
  data.sites.length === 0;

/** Multi-site failure patterns: analysis ran, found nothing. */
export const isEmptyPatternCollection = (data: { patterns: readonly unknown[] }): boolean =>
  data.patterns.length === 0;

/**
 * Multi-site benchmarks: EMPTY only when ALL THREE result collections are
 * empty. One populated collection is a usable comparison, so `&&` is the
 * contract, not `||`.
 */
export const isEmptyBenchmark = (data: {
  riskRanking: readonly unknown[];
  kpiComparison: readonly unknown[];
  failurePatterns: readonly unknown[];
}): boolean =>
  data.riskRanking.length === 0 &&
  data.kpiComparison.length === 0 &&
  data.failurePatterns.length === 0;

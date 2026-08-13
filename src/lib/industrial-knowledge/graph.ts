// PHASE 101 — deterministic relationship graph over the engineering corpus.
//
// This is the structural substrate the Brain reasons on. It holds no telemetry
// and computes no probability: it answers "what is connected to what, and how"
// so that a later layer can rank evidence it can actually point at.
//
// DETERMINISM
// Every traversal returns results in a stable order (relation, then target id).
// Two identical questions produce byte-identical answers, which is what makes
// the Phase 101 benchmark meaningful and what keeps a reasoning trace
// reproducible months after the fact.

import { isNonDiagnosticKind } from "./types";
import type {
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeNodeKind,
  KnowledgeRelation,
  ReferenceSystem,
} from "./types";

/* ── Index ────────────────────────────────────────────────────────────────── */

export interface KnowledgeIndex {
  /** Every sealed system in this index, by id. */
  systems: ReadonlyMap<string, ReferenceSystem>;
  nodes: ReadonlyMap<string, KnowledgeNode>;
  edges: readonly KnowledgeEdge[];
  /** Outbound adjacency: node id → edges whose `source` is that node. */
  out: ReadonlyMap<string, readonly KnowledgeEdge[]>;
  /** Inbound adjacency: node id → edges whose `target` is that node. */
  in: ReadonlyMap<string, readonly KnowledgeEdge[]>;
  /** node kind → node ids, ascending. */
  byKind: ReadonlyMap<KnowledgeNodeKind, readonly string[]>;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sortEdges(edges: KnowledgeEdge[]): KnowledgeEdge[] {
  return edges.sort(
    (a, b) => byString(a.relation, b.relation) || byString(a.target, b.target) || byString(a.source, b.source),
  );
}

/**
 * Build an index over sealed reference systems.
 *
 * Node ids are corpus-unique by construction (they carry their system id as a
 * prefix, which `validateAuthoredSystem` enforces), so a collision here means
 * the same system was registered twice — a programming error worth failing on
 * rather than silently de-duplicating.
 */
export function buildIndex(systems: readonly ReferenceSystem[]): KnowledgeIndex {
  const systemMap = new Map<string, ReferenceSystem>();
  const nodes = new Map<string, KnowledgeNode>();
  const edges: KnowledgeEdge[] = [];

  for (const system of systems) {
    if (systemMap.has(system.id)) {
      throw new Error(`duplicate reference system id: ${system.id}`);
    }
    systemMap.set(system.id, system);

    for (const node of system.nodes) {
      if (nodes.has(node.id)) throw new Error(`duplicate corpus node id: ${node.id}`);
      nodes.set(node.id, node);
    }
    edges.push(...system.edges);
  }

  const out = new Map<string, KnowledgeEdge[]>();
  const inbound = new Map<string, KnowledgeEdge[]>();
  for (const edge of edges) {
    (out.get(edge.source) ?? out.set(edge.source, []).get(edge.source)!).push(edge);
    (inbound.get(edge.target) ?? inbound.set(edge.target, []).get(edge.target)!).push(edge);
  }
  for (const list of out.values()) sortEdges(list);
  for (const list of inbound.values()) sortEdges(list);

  const byKind = new Map<KnowledgeNodeKind, string[]>();
  for (const node of nodes.values()) {
    (byKind.get(node.kind) ?? byKind.set(node.kind, []).get(node.kind)!).push(node.id);
  }
  for (const list of byKind.values()) list.sort(byString);

  return {
    systems: systemMap,
    nodes,
    edges: sortEdges([...edges]),
    out,
    in: inbound,
    byKind,
  };
}

/* ── Queries ──────────────────────────────────────────────────────────────── */

export type TraversalDirection = "out" | "in" | "both";

export interface NeighbourQuery {
  /** Restrict to these relations. Omitted ⇒ every relation. */
  relations?: readonly KnowledgeRelation[];
  /** Restrict to neighbours of these kinds. Omitted ⇒ every DIAGNOSTIC kind. */
  kinds?: readonly KnowledgeNodeKind[];
  direction?: TraversalDirection;
  /**
   * Admit `NON_DIAGNOSTIC_NODE_KINDS` (ROLE, AUDIT_EVENT_TYPE) to the result.
   *
   * Off by default so no reasoning path can wander into the governance layer
   * without saying so. A governance surface — "which role may invoke this
   * script?" — opts in explicitly; `traverse` ignores the flag entirely, so
   * opting in here can never widen a multi-hop walk.
   */
  includeNonDiagnostic?: boolean;
}

export interface Neighbour {
  edge: KnowledgeEdge;
  node: KnowledgeNode;
  /** `out` when the edge left the origin node, `in` when it arrived at it. */
  via: "out" | "in";
}

/**
 * Immediate neighbours of a node, in stable order.
 *
 * Governance nodes are removed HERE rather than at each call site, so every
 * consumer — `traverse`, `reachableFaultModes`, `safeActionsFor`, anything
 * written later — inherits the exclusion instead of having to remember it.
 */
export function neighbours(
  index: KnowledgeIndex,
  nodeId: string,
  query: NeighbourQuery = {},
): Neighbour[] {
  const direction = query.direction ?? "out";
  const relations = query.relations ? new Set(query.relations) : null;
  const kinds = query.kinds ? new Set(query.kinds) : null;
  const includeNonDiagnostic = query.includeNonDiagnostic === true;
  const result: Neighbour[] = [];

  const collect = (edges: readonly KnowledgeEdge[] | undefined, via: "out" | "in") => {
    for (const edge of edges ?? []) {
      if (relations && !relations.has(edge.relation)) continue;
      const otherId = via === "out" ? edge.target : edge.source;
      const node = index.nodes.get(otherId);
      if (!node) continue; // unreachable: sealing rejects dangling edges
      if (!includeNonDiagnostic && isNonDiagnosticKind(node.kind)) continue;
      if (kinds && !kinds.has(node.kind)) continue;
      result.push({ edge, node, via });
    }
  };

  if (direction === "out" || direction === "both") collect(index.out.get(nodeId), "out");
  if (direction === "in" || direction === "both") collect(index.in.get(nodeId), "in");

  return result;
}

export interface TraversalOptions extends NeighbourQuery {
  /** Maximum number of hops. Defaults to 3. */
  maxDepth?: number;
  /** Hard cap on visited nodes, so a dense subgraph cannot blow up a request. */
  maxNodes?: number;
}

export interface ReachedNode {
  node: KnowledgeNode;
  depth: number;
  /** The edge ids walked from the origin to this node, in order. */
  path: string[];
}

/**
 * Breadth-first traversal from one or more origins.
 *
 * Returns each reachable node once, at its SHORTEST depth, with the path that
 * reached it first. Shortest-path-wins matters for evidence ranking: an object
 * two hops from the symptom is more relevant than the same object reached by a
 * six-hop detour, and without this rule the ranking would depend on edge
 * insertion order.
 *
 * Governance nodes are excluded unconditionally: `includeNonDiagnostic` is
 * stripped from the neighbour query before the walk starts, so a ROLE or an
 * AUDIT_EVENT_TYPE can neither be returned nor enter the frontier no matter
 * what the caller asked for. A one-hop governance lookup is a `neighbours`
 * call; a multi-hop walk THROUGH a role would be a path an engineer cannot
 * audit, and there is no option that turns it on.
 */
export function traverse(
  index: KnowledgeIndex,
  origins: readonly string[],
  options: TraversalOptions = {},
): ReachedNode[] {
  const maxDepth = options.maxDepth ?? 3;
  const maxNodes = options.maxNodes ?? 2_000;
  const query: NeighbourQuery = { ...options, includeNonDiagnostic: false };

  const seen = new Set<string>(origins);
  const result: ReachedNode[] = [];
  let frontier: Array<{ id: string; path: string[] }> = [...origins]
    .sort(byString)
    .map((id) => ({ id, path: [] }));

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: Array<{ id: string; path: string[] }> = [];
    for (const current of frontier) {
      for (const n of neighbours(index, current.id, query)) {
        if (seen.has(n.node.id)) continue;
        // Belt and braces: `query` already excludes these, but the frontier is
        // the invariant that actually matters, so it is enforced where it lives.
        if (isNonDiagnosticKind(n.node.kind)) continue;
        seen.add(n.node.id);
        const path = [...current.path, n.edge.id];
        result.push({ node: n.node, depth, path });
        next.push({ id: n.node.id, path });
        if (seen.size >= maxNodes) return result;
      }
    }
    frontier = next;
  }

  return result;
}

/* ── Chain projections ────────────────────────────────────────────────────── */

/**
 * Relations that carry a diagnostic signal "upward" from a symptom towards the
 * engineering objects that could explain it.
 *
 * Traversal is undirected across these on purpose: an alarm points at the tag
 * that raises it via an inbound `RAISES` edge, while a tag points at the block
 * that writes it via an inbound `WRITES` edge. Insisting on a single direction
 * would make the reasoning engine's reach depend on authoring convention
 * rather than on engineering meaning.
 */
export const DIAGNOSTIC_RELATIONS: readonly KnowledgeRelation[] = [
  "READS",
  "WRITES",
  "BOUND_TO",
  "GATES",
  "BLOCKS",
  "RAISES",
  "MIRRORS",
  "DISPLAYS",
  "COMMANDS",
  "TRANSITIONS_TO",
  "RECORDS",
  "EVIDENCE_FOR",
  "EXPLAINS",
  "CALLS",
  "ACTUATES",
  "MONITORS",
  "DERIVED_FROM",
  "CONTAINS",
];

/** Fault modes reachable from a set of observed nodes, with their distance. */
export interface ReachableFaultMode {
  node: KnowledgeNode;
  /** Shortest hop count from any origin. */
  depth: number;
  /** Origin node ids that reach this fault mode. */
  reachedFrom: string[];
}

/**
 * Locate candidate fault modes around a set of observed nodes.
 *
 * Each origin is traversed independently so the result records WHICH
 * observations reach a given fault mode. That set is the raw material for
 * corroboration scoring later: a cause supported by four independent
 * observations is not the same as one supported by the same observation twice.
 */
export function reachableFaultModes(
  index: KnowledgeIndex,
  originIds: readonly string[],
  maxDepth = 3,
): ReachableFaultMode[] {
  const acc = new Map<string, { node: KnowledgeNode; depth: number; from: Set<string> }>();

  for (const origin of [...originIds].sort(byString)) {
    if (!index.nodes.has(origin)) continue;
    const reached = traverse(index, [origin], {
      relations: DIAGNOSTIC_RELATIONS,
      direction: "both",
      maxDepth,
    });
    for (const r of reached) {
      if (r.node.kind !== "FAULT_MODE") continue;
      const existing = acc.get(r.node.id);
      if (existing) {
        existing.depth = Math.min(existing.depth, r.depth);
        existing.from.add(origin);
      } else {
        acc.set(r.node.id, { node: r.node, depth: r.depth, from: new Set([origin]) });
      }
    }
  }

  return [...acc.values()]
    .map((v) => ({ node: v.node, depth: v.depth, reachedFrom: [...v.from].sort(byString) }))
    .sort(
      (a, b) =>
        b.reachedFrom.length - a.reachedFrom.length ||
        a.depth - b.depth ||
        byString(a.node.id, b.node.id),
    );
}

/**
 * The shortest chain of edges connecting two nodes across diagnostic relations,
 * or `null` when none exists within `maxDepth`.
 *
 * This is what turns "cause X explains symptom Y" from an assertion into a
 * citable path an engineer can audit hop by hop.
 */
export function shortestChain(
  index: KnowledgeIndex,
  fromId: string,
  toId: string,
  maxDepth = 4,
): KnowledgeEdge[] | null {
  if (fromId === toId) return [];
  const reached = traverse(index, [fromId], {
    relations: DIAGNOSTIC_RELATIONS,
    direction: "both",
    maxDepth,
  });
  const hit = reached.find((r) => r.node.id === toId);
  if (!hit) return null;
  const byId = new Map(index.edges.map((e) => [e.id, e] as const));
  return hit.path.map((id) => byId.get(id)).filter((e): e is KnowledgeEdge => Boolean(e));
}

/** Safe actions that verify a given fault mode, in stable order. */
export function safeActionsFor(index: KnowledgeIndex, faultModeId: string): KnowledgeNode[] {
  return neighbours(index, faultModeId, {
    relations: ["VERIFIES"],
    kinds: ["SAFE_ACTION"],
    direction: "both",
  })
    .map((n) => n.node)
    .filter((node, i, all) => all.findIndex((o) => o.id === node.id) === i)
    .sort((a, b) => byString(a.id, b.id));
}

/* ── Governance projections ───────────────────────────────────────────────── */

/**
 * The one-hop governance view of a script: the roles it demands and the audit
 * event classes it declares it emits.
 *
 * Deliberately one hop and deliberately opt-in. This is the only supported way
 * to see a ROLE or an AUDIT_EVENT_TYPE, and what it returns is what the design
 * DECLARES — Hermes enforces no role here, issues no audit record, and has no
 * runtime in which either could happen.
 */
export function governanceFor(
  index: KnowledgeIndex,
  scriptId: string,
): { roles: KnowledgeNode[]; auditEventTypes: KnowledgeNode[] } {
  const pick = (relation: KnowledgeRelation, kind: KnowledgeNodeKind): KnowledgeNode[] =>
    neighbours(index, scriptId, {
      relations: [relation],
      kinds: [kind],
      direction: "out",
      includeNonDiagnostic: true,
    })
      .map((n) => n.node)
      .filter((node, i, all) => all.findIndex((o) => o.id === node.id) === i)
      .sort((a, b) => byString(a.id, b.id));

  return {
    roles: pick("REQUIRES_ROLE", "ROLE"),
    auditEventTypes: pick("EMITS", "AUDIT_EVENT_TYPE"),
  };
}

/** Evidence nodes declared as relevant to a fault mode, in stable order. */
export function evidenceFor(index: KnowledgeIndex, faultModeId: string): KnowledgeNode[] {
  return neighbours(index, faultModeId, {
    relations: ["EVIDENCE_FOR", "EXPLAINS"],
    direction: "both",
  })
    .map((n) => n.node)
    .filter((node) => node.kind !== "SAFE_ACTION")
    .filter((node, i, all) => all.findIndex((o) => o.id === node.id) === i)
    .sort((a, b) => byString(a.id, b.id));
}

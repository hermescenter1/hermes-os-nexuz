/**
 * Phase 22 — Pure Knowledge Graph Analytics Engine.
 *
 * Accepts a pre-computed KnowledgeGraph (from Phase 21A) and returns
 * deterministic analytics: node centrality, domain health, project
 * connectivity, and an overall health report with actionable insights.
 * No I/O, no side effects.
 */

import type { KnowledgeGraph, GraphNode, NodeType } from "./knowledge-graph";

// ── Public types ───────────────────────────────────────────────────────────

export interface NodeCentrality {
  nodeId:   string;
  nodeType: NodeType;
  label:    string;
  degree:   number;
}

export interface DomainHealth {
  domain:          string;
  memoryCount:     number;
  avgConfidence:   number;
  successRate:     number;
  connectionCount: number;
  healthScore:     number;
}

export interface ProjectConnectivity {
  projectId:      string;
  projectName:    string;
  directEdges:    number;
  reachableNodes: number;
  isolationScore: number;
}

export type GraphInsightType =
  | "hub_node"
  | "isolated_project"
  | "knowledge_depth"
  | "domain_gap"
  | "orphan_memories";

export interface GraphInsight {
  type:    GraphInsightType;
  message: string;
  nodeId?: string;
}

export interface GraphHealth {
  overallScore:      number;
  coverageScore:     number;
  connectivityScore: number;
  qualityScore:      number;
  insights:          GraphInsight[];
}

export interface GraphAnalyticsResult {
  centrality:          NodeCentrality[];
  domainHealth:        DomainHealth[];
  projectConnectivity: ProjectConnectivity[];
  health:              GraphHealth;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/** Undirected degree for every node in O(E). */
function buildDegreeMap(graph: KnowledgeGraph): Map<string, number> {
  const deg = new Map<string, number>();
  for (const n of graph.nodes) deg.set(n.id, 0);
  for (const e of graph.edges) {
    deg.set(e.sourceId, (deg.get(e.sourceId) ?? 0) + 1);
    deg.set(e.targetId, (deg.get(e.targetId) ?? 0) + 1);
  }
  return deg;
}

/** Undirected adjacency list in O(V+E). */
function buildAdjList(graph: KnowledgeGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.sourceId)?.push(e.targetId);
    adj.get(e.targetId)?.push(e.sourceId);
  }
  return adj;
}

/** BFS: number of nodes reachable from `fromId`, excluding self. */
function bfsReachableCount(fromId: string, adj: Map<string, string[]>): number {
  const visited = new Set([fromId]);
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  return visited.size - 1;
}

/** Stable argmax: highest value, tie-break by id ASC. */
function stableMax<T>(items: T[], value: (t: T) => number, key: (t: T) => string): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => {
    const bv = value(best);
    const cv = value(cur);
    if (cv > bv) return cur;
    if (cv === bv) return key(cur) < key(best) ? cur : best;
    return best;
  });
}

// ── Centrality ─────────────────────────────────────────────────────────────

function buildCentrality(
  graph: KnowledgeGraph,
  deg:   Map<string, number>
): NodeCentrality[] {
  return graph.nodes
    .map(n => ({ nodeId: n.id, nodeType: n.type, label: n.label, degree: deg.get(n.id) ?? 0 }))
    .sort((a, b) => {
      const dc = b.degree - a.degree;
      return dc !== 0 ? dc : a.nodeId.localeCompare(b.nodeId);
    });
}

// ── Domain health ──────────────────────────────────────────────────────────

function buildDomainHealth(
  graph: KnowledgeGraph,
  deg:   Map<string, number>
): DomainHealth[] {
  return graph.nodes
    .filter(n => n.type === "domain")
    .map(n => {
      const memoryCount   = n.properties.memoryCount   as number ?? 0;
      const avgConfidence = n.properties.avgConfidence as number ?? 0;
      const successRate   = n.properties.successRate   as number ?? 0;
      const healthScore   = Math.round((avgConfidence + successRate) / 2);
      return {
        domain:          n.label,
        memoryCount,
        avgConfidence,
        successRate,
        connectionCount: deg.get(n.id) ?? 0,
        healthScore,
      };
    })
    .sort((a, b) => {
      const hc = b.healthScore - a.healthScore;
      return hc !== 0 ? hc : a.domain.localeCompare(b.domain);
    });
}

// ── Project connectivity ───────────────────────────────────────────────────

function buildProjectConnectivity(
  graph:      KnowledgeGraph,
  deg:        Map<string, number>,
  adj:        Map<string, string[]>,
  totalNodes: number
): ProjectConnectivity[] {
  return graph.nodes
    .filter(n => n.type === "project")
    .map(n => {
      const reachableNodes = bfsReachableCount(n.id, adj);
      const isolationScore = Math.round(
        Math.max(0, (1 - reachableNodes / Math.max(totalNodes - 1, 1)) * 100)
      );
      return {
        projectId:      n.id.substring("project:".length),
        projectName:    n.label,
        directEdges:    deg.get(n.id) ?? 0,
        reachableNodes,
        isolationScore,
      };
    })
    .sort((a, b) => {
      const rc = b.reachableNodes - a.reachableNodes;
      return rc !== 0 ? rc : a.projectId.localeCompare(b.projectId);
    });
}

// ── Health report ──────────────────────────────────────────────────────────

function buildHealth(
  graph:         KnowledgeGraph,
  domainHealthList: DomainHealth[],
  deg:           Map<string, number>
): GraphHealth {
  const memoryNodes      = graph.nodes.filter(n => n.type === "memory");
  const projectNodeIds   = new Set(graph.nodes.filter(n => n.type === "project").map(n => n.id));
  const linkedMemoryIds  = new Set(
    graph.edges
      .filter(e => e.type === "belongs_to_project" && projectNodeIds.has(e.targetId))
      .map(e => e.sourceId)
  );

  // Coverage: % of memory nodes tagged to a project
  const coverageScore = memoryNodes.length === 0
    ? 100
    : Math.round((linkedMemoryIds.size / memoryNodes.length) * 100);

  // Connectivity: penalise fragmentation (-20 per extra component)
  const components = graph.summary.connectedComponents;
  const connectivityScore = Math.max(0, 100 - (components - 1) * 20);

  // Quality: average confidence of memory nodes
  const qualityScore = memoryNodes.length === 0
    ? 0
    : Math.round(
        memoryNodes.reduce((sum, n) => sum + (n.properties.confidence as number ?? 0), 0) /
        memoryNodes.length
      );

  const overallScore = Math.round(
    coverageScore * 0.3 + connectivityScore * 0.4 + qualityScore * 0.3
  );

  const insights = buildInsights(graph, deg, domainHealthList, linkedMemoryIds);

  return { overallScore, coverageScore, connectivityScore, qualityScore, insights };
}

function buildInsights(
  graph:           KnowledgeGraph,
  deg:             Map<string, number>,
  domainHealthList: DomainHealth[],
  linkedMemoryIds:  Set<string>
): GraphInsight[] {
  const insights: GraphInsight[] = [];

  // 1. hub_node — most-connected node (only when edges exist)
  if (graph.edges.length > 0) {
    const hub = stableMax(graph.nodes, n => deg.get(n.id) ?? 0, n => n.id);
    if (hub) {
      insights.push({
        type:    "hub_node",
        message: `Most connected node: ${hub.id} (${deg.get(hub.id) ?? 0} connections)`,
        nodeId:  hub.id,
      });
    }
  }

  // 2. isolated_project — first project with no linked memories (alpha by id)
  const isolatedProjects = graph.nodes
    .filter(n => n.type === "project")
    .filter(n => !graph.edges.some(e => e.type === "belongs_to_project" && e.targetId === n.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (isolatedProjects.length > 0) {
    const p = isolatedProjects[0];
    insights.push({
      type:    "isolated_project",
      message: `Project "${p.label}" has no linked memories`,
      nodeId:  p.id,
    });
  }

  // 3. knowledge_depth — domain with most memories (threshold ≥ 2)
  const richDomains = domainHealthList.filter(d => d.memoryCount >= 2);
  const deepDomain  = stableMax(richDomains, d => d.memoryCount, d => d.domain);
  if (deepDomain) {
    insights.push({
      type:    "knowledge_depth",
      message: `Domain "${deepDomain.domain}" has ${deepDomain.memoryCount} memories`,
      nodeId:  `domain:${deepDomain.domain}`,
    });
  }

  // 4. domain_gap — first domain with healthScore < 40 (alpha by domain name)
  const gapDomain = domainHealthList
    .filter(d => d.healthScore < 40)
    .sort((a, b) => a.domain.localeCompare(b.domain))[0];
  if (gapDomain) {
    insights.push({
      type:    "domain_gap",
      message: `Domain "${gapDomain.domain}" has low health score (${gapDomain.healthScore})`,
      nodeId:  `domain:${gapDomain.domain}`,
    });
  }

  // 5. orphan_memories — memories not linked to any project
  const memoryNodes   = graph.nodes.filter(n => n.type === "memory");
  const orphanCount   = memoryNodes.filter(n => !linkedMemoryIds.has(n.id)).length;
  if (orphanCount > 0) {
    insights.push({
      type:    "orphan_memories",
      message: `${orphanCount} ${orphanCount === 1 ? "memory is" : "memories are"} not linked to any project`,
    });
  }

  return insights;
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeGraphAnalytics(graph: KnowledgeGraph): GraphAnalyticsResult {
  if (graph.nodes.length === 0) {
    return {
      centrality:          [],
      domainHealth:        [],
      projectConnectivity: [],
      health: {
        overallScore: 0, coverageScore: 0,
        connectivityScore: 0, qualityScore: 0,
        insights: [],
      },
    };
  }

  const deg        = buildDegreeMap(graph);
  const adj        = buildAdjList(graph);
  const totalNodes = graph.nodes.length;

  const centrality          = buildCentrality(graph, deg);
  const domainHealthList    = buildDomainHealth(graph, deg);
  const projectConnectivity = buildProjectConnectivity(graph, deg, adj, totalNodes);
  const health              = buildHealth(graph, domainHealthList, deg);

  return { centrality, domainHealth: domainHealthList, projectConnectivity, health };
}

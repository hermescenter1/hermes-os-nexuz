import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
} from "@/lib/storage/types";
import { computeProjectRisk } from "./project-risk";

// ── Types ──────────────────────────────────────────────────────────────────

export type NodeType =
  | "project"
  | "memory"
  | "domain"
  | "case"
  | "risk"
  | "outcome"
  | "solution";

export type EdgeType =
  | "belongs_to_project"
  | "related_to_domain"
  | "has_outcome"
  | "has_risk"
  | "similar_to"
  | "resolved_by";

export interface GraphNode {
  id:         string;
  type:       NodeType;
  label:      string;
  /** All values are primitives so the graph is safely serialisable. */
  properties: Record<string, string | number>;
}

export interface GraphEdge {
  id:       string;
  type:     EdgeType;
  sourceId: string;
  targetId: string;
  /** 1 for all structural edges; Jaccard similarity [0–1] for similar_to. */
  weight:   number;
}

export interface GraphSummary {
  totalNodes:          number;
  totalEdges:          number;
  nodesByType:         Record<NodeType, number>;
  edgesByType:         Record<EdgeType, number>;
  connectedComponents: number;
  /** Average undirected degree = (2 × edges) / nodes. */
  avgDegree:           number;
  isolatedNodes:       number;
}

export interface KnowledgeGraph {
  nodes:   GraphNode[];
  edges:   GraphEdge[];
  summary: GraphSummary;
}

// ── Text helpers (for similar_to) ──────────────────────────────────────────

const STOP = new Set([
  "the","and","for","are","was","has","how","not","that","this",
  "with","from","can","what","when","why","does","its","our",
  "have","been","but","more","out","any","all","one","also","into",
  "their","they","then","over","will","just","such","been","than",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 3 && !STOP.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ── Solution predicate ─────────────────────────────────────────────────────

function isSolutionMemory(
  memory: StoredMemory,
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>
): boolean {
  const feedback  = feedbackByMemoryId.get(memory.id) ?? [];
  const outcomeFb = feedback.filter(f => f.outcome !== "unknown");
  if (outcomeFb.length > 0) {
    return outcomeFb.filter(f => f.outcome === "success").length > outcomeFb.length / 2;
  }
  return memory.outcome === "success";
}

// ── Node builders ──────────────────────────────────────────────────────────

function buildProjectNodes(projects: StoredProject[]): GraphNode[] {
  return projects.map(p => ({
    id:         `project:${p.id}`,
    type:       "project" as const,
    label:      p.name,
    properties: { status: p.status, createdAt: p.createdAt },
  }));
}

function buildMemoryNodes(memories: StoredMemory[]): GraphNode[] {
  return memories.map(m => ({
    id:         `memory:${m.id}`,
    type:       "memory" as const,
    label:      m.query.length > 80 ? `${m.query.slice(0, 80)}…` : m.query,
    properties: {
      domain:    m.domain,
      confidence: m.confidence,
      outcome:   m.outcome,
      projectId: m.projectId ?? "",
      createdAt: m.createdAt,
    },
  }));
}

function buildDomainNodes(memories: StoredMemory[]): GraphNode[] {
  const stats = new Map<string, {
    count: number; totalConf: number; successCount: number; totalOutcome: number;
  }>();
  for (const m of memories) {
    const s = stats.get(m.domain) ?? { count: 0, totalConf: 0, successCount: 0, totalOutcome: 0 };
    s.count++;
    s.totalConf += m.confidence;
    if (m.outcome !== "unknown") {
      s.totalOutcome++;
      if (m.outcome === "success") s.successCount++;
    }
    stats.set(m.domain, s);
  }
  return [...stats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, s]) => ({
      id:         `domain:${domain}`,
      type:       "domain" as const,
      label:      domain,
      properties: {
        memoryCount:   s.count,
        avgConfidence: s.count      > 0 ? Math.round(s.totalConf / s.count)             : 0,
        successRate:   s.totalOutcome > 0 ? Math.round((s.successCount / s.totalOutcome) * 100) : 0,
      },
    }));
}

function buildCaseNodes(memories: StoredMemory[]): GraphNode[] {
  const counts = new Map<string, number>();
  for (const m of memories) {
    for (const caseId of [...new Set(m.relatedCaseIds)]) {
      counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([caseId, referenceCount]) => ({
      id:         `case:${caseId}`,
      type:       "case" as const,
      label:      caseId,
      properties: { referenceCount },
    }));
}

function buildRiskNodes(
  projects:           StoredProject[],
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  now:                Date
): GraphNode[] {
  return projects.map(project => {
    const projMems   = memories.filter(m => m.projectId === project.id);
    const projFbMap  = new Map<string, StoredMemoryFeedback[]>();
    for (const m of projMems) {
      const fbs = feedbackByMemoryId.get(m.id);
      if (fbs) projFbMap.set(m.id, fbs);
    }
    const risk = computeProjectRisk(project, projMems, projFbMap, now);
    return {
      id:         `risk:${project.id}`,
      type:       "risk" as const,
      label:      `${project.name} — Risk`,
      properties: {
        score:  risk.currentRisk.score,
        level:  risk.currentRisk.riskLevel,
        trend:  risk.riskTrend,
        reason: risk.currentRisk.reason,
      },
    };
  });
}

const OUTCOME_ORDER: MemoryOutcome[] = ["success", "partial", "failed", "unknown"];

function buildOutcomeNodes(memories: StoredMemory[]): GraphNode[] {
  const counts = new Map<MemoryOutcome, number>();
  for (const m of memories) counts.set(m.outcome, (counts.get(m.outcome) ?? 0) + 1);
  return OUTCOME_ORDER.filter(o => counts.has(o)).map(o => ({
    id:         `outcome:${o}`,
    type:       "outcome" as const,
    label:      o,
    properties: { count: counts.get(o)! },
  }));
}

function buildSolutionNodes(
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>
): GraphNode[] {
  return memories
    .filter(m => isSolutionMemory(m, feedbackByMemoryId))
    .map(m => ({
      id:         `solution:${m.id}`,
      type:       "solution" as const,
      label:      m.query.length > 80 ? `${m.query.slice(0, 80)}…` : m.query,
      properties: {
        domain:        m.domain,
        confidence:    m.confidence,
        resolvedCases: m.relatedCaseIds.length,
        createdAt:     m.createdAt,
      },
    }));
}

// ── Edge builders ──────────────────────────────────────────────────────────

function buildBelongsToProjectEdges(
  memories:   StoredMemory[],
  projectIds: Set<string>
): GraphEdge[] {
  return memories
    .filter(m => m.projectId != null && projectIds.has(m.projectId))
    .map(m => ({
      id:       `belongs_to_project:memory:${m.id}:project:${m.projectId}`,
      type:     "belongs_to_project" as const,
      sourceId: `memory:${m.id}`,
      targetId: `project:${m.projectId!}`,
      weight:   1,
    }));
}

function buildRelatedToDomainEdges(memories: StoredMemory[]): GraphEdge[] {
  return memories.map(m => ({
    id:       `related_to_domain:memory:${m.id}:domain:${m.domain}`,
    type:     "related_to_domain" as const,
    sourceId: `memory:${m.id}`,
    targetId: `domain:${m.domain}`,
    weight:   1,
  }));
}

function buildHasOutcomeEdges(memories: StoredMemory[]): GraphEdge[] {
  return memories.map(m => ({
    id:       `has_outcome:memory:${m.id}:outcome:${m.outcome}`,
    type:     "has_outcome" as const,
    sourceId: `memory:${m.id}`,
    targetId: `outcome:${m.outcome}`,
    weight:   1,
  }));
}

function buildHasRiskEdges(projects: StoredProject[]): GraphEdge[] {
  return projects.map(p => ({
    id:       `has_risk:project:${p.id}:risk:${p.id}`,
    type:     "has_risk" as const,
    sourceId: `project:${p.id}`,
    targetId: `risk:${p.id}`,
    weight:   1,
  }));
}

const SIMILAR_THRESHOLD   = 0.15;
const SIMILAR_MAX_PER_MEM = 5;
const SIMILAR_DOMAIN_CAP  = 200; // prevent O(n²) explosion for very large domains

function buildSimilarToEdges(memories: StoredMemory[]): GraphEdge[] {
  // Group by domain
  const byDomain = new Map<string, StoredMemory[]>();
  for (const m of memories) {
    const g = byDomain.get(m.domain) ?? [];
    g.push(m);
    byDomain.set(m.domain, g);
  }

  const edges: GraphEdge[] = [];
  const seenIds = new Set<string>();

  for (const group of byDomain.values()) {
    // Sort by id for determinism; cap to avoid O(n²) on huge domains
    const cands = [...group]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, SIMILAR_DOMAIN_CAP);
    const tokenized = cands.map(m => ({
      id:     m.id,
      tokens: tokenize(m.query + " " + m.analysisSummary),
    }));
    const edgeCount = new Map<string, number>();

    for (let i = 0; i < tokenized.length; i++) {
      for (let j = i + 1; j < tokenized.length; j++) {
        const { id: idA, tokens: tA } = tokenized[i];
        const { id: idB, tokens: tB } = tokenized[j];

        if ((edgeCount.get(idA) ?? 0) >= SIMILAR_MAX_PER_MEM) continue;
        if ((edgeCount.get(idB) ?? 0) >= SIMILAR_MAX_PER_MEM) continue;

        const sim = jaccard(tA, tB);
        if (sim < SIMILAR_THRESHOLD) continue;

        // Sort so idA < idB for a stable, direction-independent edge ID
        const [sA, sB] = [idA, idB].sort();
        const edgeId = `similar_to:memory:${sA}:memory:${sB}`;
        if (seenIds.has(edgeId)) continue;
        seenIds.add(edgeId);

        edges.push({
          id:       edgeId,
          type:     "similar_to",
          sourceId: `memory:${sA}`,
          targetId: `memory:${sB}`,
          weight:   Math.round(sim * 100) / 100,
        });
        edgeCount.set(idA, (edgeCount.get(idA) ?? 0) + 1);
        edgeCount.set(idB, (edgeCount.get(idB) ?? 0) + 1);
      }
    }
  }

  return edges;
}

function buildResolvedByEdges(
  memories:           StoredMemory[],
  feedbackByMemoryId: Map<string, StoredMemoryFeedback[]>,
  solutionIds:        Set<string>
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const m of memories) {
    if (!solutionIds.has(m.id)) continue;
    for (const caseId of [...new Set(m.relatedCaseIds)]) {
      const edgeId = `resolved_by:case:${caseId}:solution:${m.id}`;
      if (seen.has(edgeId)) continue;
      seen.add(edgeId);
      edges.push({
        id:       edgeId,
        type:     "resolved_by",
        sourceId: `case:${caseId}`,
        targetId: `solution:${m.id}`,
        weight:   1,
      });
    }
  }

  return edges;
}

// ── Graph summary ──────────────────────────────────────────────────────────

function computeConnectivity(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { components: number; isolated: number } {
  if (nodes.length === 0) return { components: 0, isolated: 0 };

  const parent = new Map<string, string>();
  for (const n of nodes) parent.set(n.id, n.id);

  function find(x: string): string {
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  }
  function union(x: string, y: string) {
    const rx = find(x), ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }

  const nodeIds        = new Set(nodes.map(n => n.id));
  const connectedNodes = new Set<string>();

  for (const e of edges) {
    if (nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)) {
      union(e.sourceId, e.targetId);
      connectedNodes.add(e.sourceId);
      connectedNodes.add(e.targetId);
    }
  }

  const isolated    = nodes.filter(n => !connectedNodes.has(n.id)).length;
  const rootSet     = new Set(nodes.map(n => find(n.id)));

  return { components: rootSet.size, isolated };
}

function buildSummary(nodes: GraphNode[], edges: GraphEdge[]): GraphSummary {
  const nodesByType: Record<NodeType, number> = {
    project: 0, memory: 0, domain: 0, case: 0, risk: 0, outcome: 0, solution: 0,
  };
  for (const n of nodes) nodesByType[n.type]++;

  const edgesByType: Record<EdgeType, number> = {
    belongs_to_project: 0, related_to_domain: 0, has_outcome: 0,
    has_risk: 0, similar_to: 0, resolved_by: 0,
  };
  for (const e of edges) edgesByType[e.type]++;

  const { components, isolated } = computeConnectivity(nodes, edges);
  const avgDegree = nodes.length > 0
    ? Math.round(((edges.length * 2) / nodes.length) * 10) / 10 : 0;

  return {
    totalNodes:          nodes.length,
    totalEdges:          edges.length,
    nodesByType,
    edgesByType,
    connectedComponents: components,
    avgDegree,
    isolatedNodes:       isolated,
  };
}

// ── Core engine ────────────────────────────────────────────────────────────

/**
 * Pure, deterministic knowledge graph engine.
 *
 * Derives nodes and edges exclusively from pre-loaded project, memory, and
 * feedback data. No I/O, no AI calls, fully testable without mocks.
 * Output is stable: nodes sorted (type ASC, id ASC); edges sorted
 * (type ASC, sourceId ASC, targetId ASC).
 */
export function computeKnowledgeGraph(
  projects:            StoredProject[],
  memories:            StoredMemory[],
  feedbackByMemoryId:  Map<string, StoredMemoryFeedback[]>,
  now = new Date()
): KnowledgeGraph {
  const projectIds  = new Set(projects.map(p => p.id));
  const solutionIds = new Set(
    memories.filter(m => isSolutionMemory(m, feedbackByMemoryId)).map(m => m.id)
  );

  const nodes: GraphNode[] = [
    ...buildProjectNodes(projects),
    ...buildMemoryNodes(memories),
    ...buildDomainNodes(memories),
    ...buildCaseNodes(memories),
    ...buildRiskNodes(projects, memories, feedbackByMemoryId, now),
    ...buildOutcomeNodes(memories),
    ...buildSolutionNodes(memories, feedbackByMemoryId),
  ].sort((a, b) => {
    const tc = a.type.localeCompare(b.type);
    return tc !== 0 ? tc : a.id.localeCompare(b.id);
  });

  const edges: GraphEdge[] = [
    ...buildBelongsToProjectEdges(memories, projectIds),
    ...buildRelatedToDomainEdges(memories),
    ...buildHasOutcomeEdges(memories),
    ...buildHasRiskEdges(projects),
    ...buildSimilarToEdges(memories),
    ...buildResolvedByEdges(memories, feedbackByMemoryId, solutionIds),
  ].sort((a, b) => {
    const tc = a.type.localeCompare(b.type);
    if (tc !== 0) return tc;
    const sc = a.sourceId.localeCompare(b.sourceId);
    return sc !== 0 ? sc : a.targetId.localeCompare(b.targetId);
  });

  return { nodes, edges, summary: buildSummary(nodes, edges) };
}

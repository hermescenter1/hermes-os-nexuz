/**
 * Phase 56A — Hermes Engineering Knowledge Graph Data Model.
 *
 * Deterministic engineering relationship engine.
 * No AI generation. No hallucination. Only explicit relationships.
 * Every node and edge is derived from real static or repository data.
 */

// ── Node Types ───────────────────────────────────────────────────────────────

export const GRAPH_NODE_TYPES = [
  "VENDOR",
  "PRODUCT",
  "PLC",
  "SCADA",
  "DRIVE",
  "MOTOR",
  "SENSOR",
  "PROTOCOL",
  "ASSET",
  "SIGNAL",
  "ALARM",
  "CASE",
  "ROOT_CAUSE",
  "RESOLUTION",
  "KNOWLEDGE_ARTICLE",
  "SITE",
] as const;

export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

// ── Relationship Types ────────────────────────────────────────────────────────

export const GRAPH_RELATIONSHIP_TYPES = [
  "USES",
  "CONNECTED_TO",
  "GENERATES",
  "TRIGGERS",
  "CAUSED_BY",
  "RESOLVED_BY",
  "REFERENCES",
  "DEPENDS_ON",
  "COMMUNICATES_WITH",
  "MONITORS",
  "BELONGS_TO",
] as const;

export type GraphRelationshipType = (typeof GRAPH_RELATIONSHIP_TYPES)[number];

// ── Node ──────────────────────────────────────────────────────────────────────

export interface KnowledgeGraphNode {
  id:           string;
  type:         GraphNodeType;
  label:        string;
  sublabel?:    string;
  properties:   Record<string, string | number | boolean>;
  /** Total number of edges this node participates in. */
  degree:       number;
  /** 0-100: composite of degree, type weight, and domain relevance. */
  impactScore:  number;
}

// ── Edge ──────────────────────────────────────────────────────────────────────

export interface KnowledgeGraphEdge {
  id:         string;
  source:     string;
  target:     string;
  type:       GraphRelationshipType;
  /** 0.0–1.0 strength of the relationship. */
  weight:     number;
  label?:     string;
  properties: Record<string, string | number | boolean>;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface EngGraphStats {
  totalNodes:    number;
  totalEdges:    number;
  vendors:       number;
  protocols:     number;
  assets:        number;
  cases:         number;
  knowledgeLinks: number;
  /** Actual edges / max possible edges for a directed graph. */
  graphDensity:  number;
  nodesByType:   Partial<Record<GraphNodeType, number>>;
  edgesByType:   Partial<Record<GraphRelationshipType, number>>;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface EngGraphSnapshot {
  nodes:    KnowledgeGraphNode[];
  edges:    KnowledgeGraphEdge[];
  stats:    EngGraphStats;
  builtAt:  string;
  version:  string;
}

// ── Node inspector result ─────────────────────────────────────────────────────

export interface NodeDetail {
  node:            KnowledgeGraphNode;
  inboundEdges:    KnowledgeGraphEdge[];
  outboundEdges:   KnowledgeGraphEdge[];
  connectedNodes:  KnowledgeGraphNode[];
}

// Digital Twin Engine types — Phase 36
//
// READ/OBSERVE ONLY: No control commands to industrial hardware.

export type DigitalTwinNodeType =
  | "SITE" | "AREA" | "LINE" | "CELL" | "ASSET" | "SYSTEM";

export type DigitalTwinRelationType =
  | "PART_OF" | "CONNECTED_TO" | "CONTROLS" | "MONITORS" | "FEEDS" | "BACKUP_FOR";

export const ALL_NODE_TYPES: DigitalTwinNodeType[] =
  ["SITE", "AREA", "LINE", "CELL", "ASSET", "SYSTEM"];

export const ALL_RELATION_TYPES: DigitalTwinRelationType[] =
  ["PART_OF", "CONNECTED_TO", "CONTROLS", "MONITORS", "FEEDS", "BACKUP_FOR"];

// Relations that are traversed in BOTH directions during graph traversal.
// All others are directed (source → target only).
export const BIDIRECTIONAL_RELATIONS = new Set<DigitalTwinRelationType>(["CONNECTED_TO"]);

// Maximum depth for graph traversal — prevents infinite loops on malformed graphs.
export const MAX_TRAVERSAL_DEPTH = 50;

export interface TwinNodeRecord {
  id:             string;
  organizationId: string;
  siteId:         string;
  assetId:        string | null;
  parentNodeId:   string | null;
  displayName:    string;
  nodeType:       DigitalTwinNodeType;
  metadata:       Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

export interface TwinRelationRecord {
  id:             string;
  organizationId: string;
  sourceNodeId:   string;
  targetNodeId:   string;
  relationType:   DigitalTwinRelationType;
  metadata:       Record<string, unknown>;
  createdAt:      string;
}

export interface TwinLayoutRecord {
  id:             string;
  organizationId: string;
  siteId:         string;
  name:           string;
  layoutData:     Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

export interface AssetTagRecord {
  id:             string;
  organizationId: string;
  assetId:        string;
  tagName:        string;
  tagPath:        string;
  unit:           string | null;
  dataType:       string;
  description:    string | null;
  metadata:       Record<string, unknown>;
  createdAt:      string;
  updatedAt:      string;
}

// ── Graph representation ───────────────────────────────────────────────────────

export interface GraphNode extends TwinNodeRecord {
  children:   string[];   // child node ids (outbound PART_OF edges)
  relations:  { relationType: DigitalTwinRelationType; targetId: string; direction: "out" | "in" }[];
}

export interface AssetGraph {
  siteId:    string;
  nodes:     Map<string, GraphNode>;
  relations: TwinRelationRecord[];
}

// ── Traversal results ─────────────────────────────────────────────────────────

export interface TraversalResult {
  nodes:    TwinNodeRecord[];
  path:     string[];   // node ids in order
  depth:    number;
  truncated: boolean;   // true if maxDepth was reached
}

// ── Data quality warnings ─────────────────────────────────────────────────────

export type DataQualityWarningType =
  | "orphan_node"             // node with no relations and no parent
  | "missing_asset_reference" // ASSET node whose assetId no longer exists
  | "cyclic_relation"         // cycle detected during traversal
  | "disconnected_critical";  // ASSET node with no CONTROLS / FEEDS / PART_OF relations

export interface DataQualityWarning {
  type:      DataQualityWarningType;
  nodeId:    string;
  message:   string;
}

// ── Health scoring ────────────────────────────────────────────────────────────

export interface AssetHealthScore {
  nodeId:           string;
  assetId:          string | null;
  score:            number;    // 0–100
  freshnessScore:   number;
  qualityScore:     number;
  statusScore:      number;
  lastTelemetryAt:  string | null;
  stale:            boolean;
}

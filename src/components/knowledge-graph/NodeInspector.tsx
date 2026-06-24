"use client";

/**
 * Phase 56E — Node Inspector Panel.
 * Shows node details, connections, and impact on selection.
 * Hermes Design DNA: no glassmorphism, angular badges, kpi-label typography.
 */

import type { KnowledgeGraphNode, KnowledgeGraphEdge, GraphNodeType } from "@/lib/eng-graph/types";

// Node type display config
const NODE_TYPE_LABEL: Record<GraphNodeType, string> = {
  SITE:               "Site",
  VENDOR:             "Vendor",
  PRODUCT:            "Product Family",
  PLC:                "PLC Controller",
  SCADA:              "SCADA / HMI",
  DRIVE:              "Drive / VFD",
  MOTOR:              "Motor",
  SENSOR:             "Sensor",
  ASSET:              "Industrial Asset",
  PROTOCOL:           "Protocol",
  SIGNAL:             "Signal / Tag",
  ALARM:              "Alarm Condition",
  CASE:               "Engineering Case",
  ROOT_CAUSE:         "Root Cause",
  RESOLUTION:         "Resolution",
  KNOWLEDGE_ARTICLE:  "Knowledge Article",
};

const NODE_TYPE_TONE: Record<GraphNodeType, string> = {
  SITE:               "hs-badge hs--knowledge",
  VENDOR:             "hs-badge hs--reasoning",
  PRODUCT:            "hs-badge hs--reasoning",
  PLC:                "hs-badge hs--memory",
  SCADA:              "hs-badge hs--memory",
  DRIVE:              "hs-badge hs--memory",
  MOTOR:              "hs-badge hs--nominal",
  SENSOR:             "hs-badge hs--nominal",
  ASSET:              "hs-badge hs--nominal",
  PROTOCOL:           "hs-badge hs--reasoning",
  SIGNAL:             "hs-badge hs--confident",
  ALARM:              "hs-badge hs--risk",
  CASE:               "hs-badge hs--warning",
  ROOT_CAUSE:         "hs-badge hs--warning",
  RESOLUTION:         "hs-badge hs--reasoning",
  KNOWLEDGE_ARTICLE:  "hs-badge hs--knowledge",
};

const REL_LABEL: Record<string, string> = {
  USES:              "Uses",
  COMMUNICATES_WITH: "Communicates With",
  GENERATES:         "Generates",
  TRIGGERS:          "Triggers",
  CAUSED_BY:         "Caused By",
  RESOLVED_BY:       "Resolved By",
  REFERENCES:        "References",
  DEPENDS_ON:        "Depends On",
  MONITORS:          "Monitors",
  BELONGS_TO:        "Belongs To",
  CONNECTED_TO:      "Connected To",
};

interface NodeInspectorProps {
  node:            KnowledgeGraphNode | null;
  inboundEdges:    KnowledgeGraphEdge[];
  outboundEdges:   KnowledgeGraphEdge[];
  connectedNodes:  KnowledgeGraphNode[];
  onSelectNode:    (node: KnowledgeGraphNode) => void;
  onClose:         () => void;
}

export function NodeInspector({
  node,
  inboundEdges,
  outboundEdges,
  connectedNodes,
  onSelectNode,
  onClose,
}: NodeInspectorProps) {
  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <p className="kpi-label text-faint">Select a node to inspect</p>
        <p className="kpi-label text-faint/60 mt-2">Click any node in the graph</p>
      </div>
    );
  }

  const allEdges = [...inboundEdges, ...outboundEdges];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-line flex-shrink-0">
        <div className="min-w-0">
          <span className={NODE_TYPE_TONE[node.type]}>{NODE_TYPE_LABEL[node.type]}</span>
          <h3 className="font-body text-sm font-semibold text-ink mt-1.5 leading-snug line-clamp-2">
            {node.label}
          </h3>
          {node.sublabel && (
            <p className="kpi-label text-faint mt-0.5">{node.sublabel}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-ink transition-colors text-base leading-none flex-shrink-0 mt-0.5"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line flex-shrink-0">
        <div className="px-4 py-3 bg-surface">
          <p className="kpi-label mb-1">Connections</p>
          <p className="intel-kpi-value">{allEdges.length}</p>
        </div>
        <div className="px-4 py-3 bg-surface">
          <p className="kpi-label mb-1">Impact Score</p>
          <p className={`intel-kpi-value ${node.impactScore >= 50 ? "text-signal" : "text-ink"}`}>
            {node.impactScore}
          </p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Properties */}
        {Object.keys(node.properties).length > 0 && (
          <div>
            <p className="kpi-label mb-2">Properties</p>
            <div className="space-y-1.5">
              {Object.entries(node.properties).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-2">
                  <span className="kpi-label text-faint capitalize flex-shrink-0">
                    {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </span>
                  <span className="font-mono text-[0.65rem] text-ink text-right truncate max-w-[120px]">
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outbound edges */}
        {outboundEdges.length > 0 && (
          <div>
            <p className="kpi-label mb-2">Outbound · {outboundEdges.length}</p>
            <div className="space-y-1">
              {outboundEdges.map(e => {
                const target = connectedNodes.find(n => n.id === e.target);
                return (
                  <button
                    key={e.id}
                    onClick={() => target && onSelectNode(target)}
                    className="w-full text-left rounded border border-line hover:border-signal/30 hover:bg-surface2 bg-surface px-2.5 py-1.5 transition-colors"
                  >
                    <p className="kpi-label text-signal/80 mb-0.5">
                      {REL_LABEL[e.type] ?? e.type} →
                    </p>
                    <p className="font-body text-xs text-ink truncate">
                      {target?.label ?? e.target}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Inbound edges */}
        {inboundEdges.length > 0 && (
          <div>
            <p className="kpi-label mb-2">Inbound · {inboundEdges.length}</p>
            <div className="space-y-1">
              {inboundEdges.map(e => {
                const src = connectedNodes.find(n => n.id === e.source);
                return (
                  <button
                    key={e.id}
                    onClick={() => src && onSelectNode(src)}
                    className="w-full text-left rounded border border-line hover:border-signal/30 hover:bg-surface2 bg-surface px-2.5 py-1.5 transition-colors"
                  >
                    <p className="kpi-label text-ice/80 mb-0.5">
                      ← {REL_LABEL[e.type] ?? e.type}
                    </p>
                    <p className="font-body text-xs text-ink truncate">
                      {src?.label ?? e.source}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

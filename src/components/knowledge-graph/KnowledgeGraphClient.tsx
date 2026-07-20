"use client";

import { useLocale } from "next-intl";

/**
 * Phase 56D/E/F — Knowledge Graph Client.
 *
 * Orchestrates: canvas, node inspector, relationship explorer.
 * Fetches from /api/eng-graph. Manages selected node and highlight state.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { GraphCanvas }          from "./GraphCanvas";
import { NodeInspector }        from "./NodeInspector";
import { RelationshipExplorer } from "./RelationshipExplorer";
import type {
  EngGraphSnapshot,
  KnowledgeGraphNode,
  GraphNodeType,
} from "@/lib/eng-graph/types";
import { GRAPH_NODE_TYPES } from "@/lib/eng-graph/types";
import { formatDate } from "@/lib/i18n/format";

// ── Node type filter legend ───────────────────────────────────────────────────

const TYPE_GROUPS: { label: string; types: GraphNodeType[] }[] = [
  { label: "Vendors",    types: ["VENDOR", "PRODUCT", "SITE"]                    },
  { label: "Hardware",   types: ["PLC", "SCADA", "DRIVE", "MOTOR", "SENSOR", "ASSET"] },
  { label: "Protocols",  types: ["PROTOCOL"]                                     },
  { label: "Telemetry",  types: ["SIGNAL"]                                       },
  { label: "Faults",     types: ["ALARM"]                                        },
  { label: "Knowledge",  types: ["CASE", "ROOT_CAUSE", "RESOLUTION", "KNOWLEDGE_ARTICLE"] },
];

// ── Main component ────────────────────────────────────────────────────────────

export function KnowledgeGraphClient() {
  const locale = useLocale();
  const [snap,     setSnap]     = useState<EngGraphSnapshot | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<KnowledgeGraphNode | null>(null);
  const [activeGroups, setActiveGroups] = useState<Set<string>>(
    new Set(TYPE_GROUPS.map(g => g.label))
  );

  // Fetch graph
  useEffect(() => {
    setLoading(true);
    fetch("/api/eng-graph")
      .then(r => r.json())
      .then((d: EngGraphSnapshot) => { setSnap(d); setLoading(false); })
      .catch(() => { setError("Failed to load knowledge graph"); setLoading(false); });
  }, []);

  // Active type filter
  const filterTypes = useMemo<Set<GraphNodeType>>(() => {
    const types = new Set<GraphNodeType>();
    for (const group of TYPE_GROUPS) {
      if (activeGroups.has(group.label)) {
        for (const t of group.types) types.add(t);
      }
    }
    return types;
  }, [activeGroups]);

  // Highlight: when a node is selected, highlight it + its direct neighbours
  const highlightIds = useMemo<Set<string>>(() => {
    if (!selected || !snap) return new Set();
    const ids = new Set([selected.id]);
    for (const e of snap.edges) {
      if (e.source === selected.id) ids.add(e.target);
      if (e.target === selected.id) ids.add(e.source);
    }
    return ids;
  }, [selected, snap]);

  // Inspector data: edges and connected nodes for selected node
  const { inboundEdges, outboundEdges, connectedNodes } = useMemo(() => {
    if (!selected || !snap) {
      return { inboundEdges: [], outboundEdges: [], connectedNodes: [] };
    }
    const outbound = snap.edges.filter(e => e.source === selected.id);
    const inbound  = snap.edges.filter(e => e.target === selected.id);
    const neighbourIds = new Set([...outbound.map(e => e.target), ...inbound.map(e => e.source)]);
    return {
      outboundEdges: outbound,
      inboundEdges:  inbound,
      connectedNodes: snap.nodes.filter(n => neighbourIds.has(n.id)),
    };
  }, [selected, snap]);

  const handleNodeClick = useCallback((n: KnowledgeGraphNode) => {
    setSelected(prev => prev?.id === n.id ? null : n);
  }, []);

  const toggleGroup = (label: string) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="animate-pulse kpi-label text-muted">Building knowledge graph…</p>
      </div>
    );
  }
  if (error || !snap) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">{error ?? "Graph unavailable"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Type Filter Row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {TYPE_GROUPS.map(group => (
          <button
            key={group.label}
            onClick={() => toggleGroup(group.label)}
            className={`hs-badge transition-colors ${
              activeGroups.has(group.label)
                ? "hs--reasoning"
                : "hs--nominal opacity-50"
            }`}
          >
            {group.label}
            <span className="font-mono text-[0.55rem] text-muted ms-1">
              ({snap.nodes.filter(n => group.types.includes(n.type)).length})
            </span>
          </button>
        ))}
        <span className="kpi-label text-faint ms-1">
          {snap.stats.totalNodes} nodes · {snap.stats.totalEdges} edges
        </span>
      </div>

      {/* ── Main Grid: Canvas + Inspector ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-4" style={{ minHeight: "520px" }}>

        {/* Canvas — 3/4 */}
        <div
          className="lg:col-span-3 rounded-xl border border-signal/10 overflow-hidden h-s3"
          style={{ height: "520px", position: "relative" }}
        >
          <GraphCanvas
            nodes={snap.nodes}
            edges={snap.edges}
            selectedId={selected?.id}
            highlightIds={highlightIds}
            onNodeClick={handleNodeClick}
            filterTypes={filterTypes.size > 0 ? filterTypes : undefined}
          />
        </div>

        {/* Node Inspector — 1/4 */}
        <div className="rounded-xl border border-line bg-surface overflow-hidden" style={{ height: "520px" }}>
          <NodeInspector
            node={selected}
            inboundEdges={inboundEdges}
            outboundEdges={outboundEdges}
            connectedNodes={connectedNodes}
            onSelectNode={handleNodeClick}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>

      {/* ── Relationship Explorer ────────────────────────────────────────────── */}
      <div
        className="rounded-xl h-s3 overflow-hidden"
        style={{ minHeight: "280px" }}
      >
        <div className="h-layer-sep px-4 pt-3">
          <span className="kpi-label">Relationship Explorer</span>
        </div>
        <div style={{ height: "240px" }}>
          <RelationshipExplorer
            nodes={snap.nodes}
            edges={snap.edges}
            onNodeClick={handleNodeClick}
          />
        </div>
      </div>

      {/* ── Graph Statistics ─────────────────────────────────────────────────── */}
      <div className="h-layer-sep">
        <span className="kpi-label">Graph Statistics</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Nodes",      value: snap.stats.totalNodes    },
          { label: "Total Edges",      value: snap.stats.totalEdges    },
          { label: "Vendors",          value: snap.stats.vendors       },
          { label: "Protocols",        value: snap.stats.protocols     },
          { label: "Asset Nodes",      value: snap.stats.assets        },
          { label: "Cases",            value: snap.stats.cases         },
          { label: "Knowledge Links",  value: snap.stats.knowledgeLinks},
          { label: "Graph Density",    value: snap.stats.graphDensity.toFixed(4) },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-line bg-surface px-4 py-4">
            <p className="kpi-label mb-2">{kpi.label}</p>
            <p className="exec-kpi-value">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Node type breakdown */}
      <div className="rounded-xl border border-line bg-surface px-5 py-4">
        <p className="kpi-label mb-3">Node Distribution</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {GRAPH_NODE_TYPES.map(type => {
            const count = snap.stats.nodesByType[type] ?? 0;
            if (!count) return null;
            return (
              <div key={type} className="text-center">
                <p className="intel-kpi-value">{count}</p>
                <p className="kpi-label mt-1">{type.replace(/_/g, " ")}</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="kpi-label text-faint" dir="ltr">
        Built · {formatDate(snap.builtAt, locale, { timeStyle: "medium" })} · v{snap.version}
      </p>
    </div>
  );
}

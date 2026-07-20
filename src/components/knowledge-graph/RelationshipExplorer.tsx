"use client";

/**
 * Phase 56F — Engineering Intelligence Trace Panel.
 *
 * Two trace modes:
 *   1. Alarm → Root Cause → Resolution → Knowledge Article
 *   2. Vendor → Product → Asset → Alarm
 *
 * Fully deterministic: traces are computed from the graph edges.
 * No AI. No hallucination. Every hop is an explicit relationship.
 */

import { useState, useMemo } from "react";
import type {
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  GraphNodeType,
} from "@/lib/eng-graph/types";

// ── Trace engine ──────────────────────────────────────────────────────────────

function findNode(nodes: KnowledgeGraphNode[], id: string) {
  return nodes.find(n => n.id === id);
}

function findTarget(
  edges:  KnowledgeGraphEdge[],
  source: string,
  type:   KnowledgeGraphEdge["type"],
): string | undefined {
  return edges.find(e => e.source === source && e.type === type)?.target;
}


interface TraceStep {
  node:  KnowledgeGraphNode;
  rel?:  string;
}

function buildAlarmTrace(
  alarm: KnowledgeGraphNode,
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): TraceStep[] {
  const steps: TraceStep[] = [{ node: alarm }];

  const caseId  = findTarget(edges, alarm.id, "TRIGGERS");
  const caseNode = caseId ? findNode(nodes, caseId) : null;
  if (caseNode) {
    steps.push({ node: caseNode, rel: "TRIGGERS" });

    const rcId   = findTarget(edges, caseNode.id, "CAUSED_BY");
    const rcNode = rcId ? findNode(nodes, rcId) : null;
    if (rcNode) {
      steps.push({ node: rcNode, rel: "CAUSED_BY" });

      const resId   = findTarget(edges, rcNode.id, "RESOLVED_BY");
      const resNode = resId ? findNode(nodes, resId) : null;
      if (resNode) {
        steps.push({ node: resNode, rel: "RESOLVED_BY" });

        const artId   = findTarget(edges, resNode.id, "REFERENCES");
        const artNode = artId ? findNode(nodes, artId) : null;
        if (artNode) {
          steps.push({ node: artNode, rel: "REFERENCES" });
        }
      }
    }
  }
  return steps;
}

function buildVendorTrace(
  vendor: KnowledgeGraphNode,
  nodes:  KnowledgeGraphNode[],
  edges:  KnowledgeGraphEdge[],
): TraceStep[] {
  const steps: TraceStep[] = [{ node: vendor }];

  // Vendor → Product (first USES edge)
  const prodId   = findTarget(edges, vendor.id, "USES");
  const prodNode = prodId ? findNode(nodes, prodId) : null;
  if (!prodNode) return steps;
  steps.push({ node: prodNode, rel: "USES" });

  // Product → Asset (first USES edge)
  const assetId   = findTarget(edges, prodNode.id, "USES");
  const assetNode = assetId ? findNode(nodes, assetId) : null;
  if (!assetNode) return steps;
  steps.push({ node: assetNode, rel: "USES" });

  // Asset → Alarm (GENERATES)
  const alarmId   = findTarget(edges, assetNode.id, "GENERATES");
  const alarmNode = alarmId ? findNode(nodes, alarmId) : null;
  if (!alarmNode) return steps;
  steps.push({ node: alarmNode, rel: "GENERATES" });

  return steps;
}

// ── Step renderer ─────────────────────────────────────────────────────────────

const STEP_COLOR: Partial<Record<GraphNodeType, string>> = {
  ALARM:              "text-danger",
  CASE:               "text-warn",
  ROOT_CAUSE:         "text-warn",
  RESOLUTION:         "text-signal",
  KNOWLEDGE_ARTICLE:  "text-hermes-gold",
  VENDOR:             "text-signal",
  PRODUCT:            "text-signal",
  PLC:                "text-ice",
  DRIVE:              "text-ice",
  MOTOR:              "text-steel",
  SENSOR:             "text-steel",
  ASSET:              "text-steel",
};

function TraceSteps({ steps, onNodeClick }: {
  steps:        TraceStep[];
  onNodeClick:  (n: KnowledgeGraphNode) => void;
}) {
  if (steps.length === 0) {
    return <p className="kpi-label text-faint">No trace available.</p>;
  }
  return (
    <div className="space-y-1">
      {steps.map((step, i) => (
        <div key={step.node.id}>
          {step.rel && (
            <div className="flex items-center gap-1.5 ms-3 my-0.5">
              <div className="w-px h-4 bg-signal/20 ms-1" />
              <span className="kpi-label text-signal/60" style={{ fontSize: "0.50rem" }}>
                {step.rel.replace(/_/g, " ")}
              </span>
            </div>
          )}
          <button
            onClick={() => onNodeClick(step.node)}
            className="w-full text-left flex items-center gap-2 rounded border border-line hover:border-signal/30 hover:bg-surface2 bg-surface px-2.5 py-2 transition-colors"
          >
            <span
              className="kpi-label flex-shrink-0"
              style={{ fontSize: "0.50rem", color: "var(--faint)" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className={`kpi-label ${STEP_COLOR[step.node.type] ?? "text-muted"}`}>
                {step.node.type.replace(/_/g, " ")}
              </p>
              <p className="font-body text-xs text-ink leading-snug truncate">
                {step.node.label}
              </p>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface RelationshipExplorerProps {
  nodes:       KnowledgeGraphNode[];
  edges:       KnowledgeGraphEdge[];
  onNodeClick: (n: KnowledgeGraphNode) => void;
}

export function RelationshipExplorer({ nodes, edges, onNodeClick }: RelationshipExplorerProps) {
  const [mode,         setMode]         = useState<"alarm" | "vendor">("alarm");
  const [selectedAlarm,  setSelectedAlarm]  = useState<string>("");
  const [selectedVendor, setSelectedVendor] = useState<string>("");

  const alarms  = useMemo(() => nodes.filter(n => n.type === "ALARM"), [nodes]);
  const vendors = useMemo(() => nodes.filter(n => n.type === "VENDOR"), [nodes]);

  const alarmTrace = useMemo(() => {
    if (!selectedAlarm) return [];
    const alarmNode = nodes.find(n => n.id === selectedAlarm);
    return alarmNode ? buildAlarmTrace(alarmNode, nodes, edges) : [];
  }, [selectedAlarm, nodes, edges]);

  const vendorTrace = useMemo(() => {
    if (!selectedVendor) return [];
    const vendorNode = nodes.find(n => n.id === selectedVendor);
    return vendorNode ? buildVendorTrace(vendorNode, nodes, edges) : [];
  }, [selectedVendor, nodes, edges]);

  return (
    <div className="h-full flex flex-col">
      {/* Mode tabs */}
      <div className="flex gap-0 border-b border-line flex-shrink-0">
        {[
          { key: "alarm",  label: "ALARM → RESOLUTION TRACE" },
          { key: "vendor", label: "VENDOR → ASSET TRACE"     },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key as "alarm" | "vendor")}
            className={`px-4 py-2.5 border-b-2 transition-colors ${
              mode === tab.key
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <span className="kpi-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {mode === "alarm" ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Selector */}
            <div>
              <p className="kpi-label mb-2">Select Alarm</p>
              <select
                value={selectedAlarm}
                onChange={e => setSelectedAlarm(e.target.value)}
                className="w-full rounded border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              >
                <option value="">— choose an alarm —</option>
                {alarms.map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>

              {selectedAlarm && alarmTrace.length > 0 && (
                <div className="mt-3">
                  <p className="kpi-label text-faint mb-1">
                    {alarmTrace.length} hop trace · Alarm → Root Cause → Resolution
                  </p>
                </div>
              )}
            </div>

            {/* Trace */}
            <div>
              <p className="kpi-label mb-2">Intelligence Trace</p>
              <TraceSteps steps={alarmTrace} onNodeClick={onNodeClick} />
              {!selectedAlarm && (
                <p className="kpi-label text-faint">Select an alarm to trace its engineering resolution chain.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Selector */}
            <div>
              <p className="kpi-label mb-2">Select Vendor</p>
              <select
                value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)}
                className="w-full rounded border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              >
                <option value="">— choose a vendor —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>

              {selectedVendor && vendorTrace.length > 0 && (
                <div className="mt-3">
                  <p className="kpi-label text-faint mb-1">
                    {vendorTrace.length} hop trace · Vendor → Product → Asset → Alarm
                  </p>
                </div>
              )}
            </div>

            {/* Trace */}
            <div>
              <p className="kpi-label mb-2">Asset Chain Trace</p>
              <TraceSteps steps={vendorTrace} onNodeClick={onNodeClick} />
              {!selectedVendor && (
                <p className="kpi-label text-faint">Select a vendor to trace from vendor technology to alarm conditions.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

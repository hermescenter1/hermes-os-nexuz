"use client";

/**
 * Phase 56D — Hermes Engineering Knowledge Graph Canvas.
 *
 * Pure SVG. No external chart library.
 * Hierarchical tier layout: deterministic, same input → same output.
 * Interaction: pan (drag), zoom (wheel), click (node selection).
 * Hermes Design DNA: angular nodes (3px radius), signal-tinted edges.
 */

import {
  useRef, useState, useCallback, useEffect,
  type WheelEvent, type MouseEvent, type PointerEvent,
} from "react";
import type {
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  GraphNodeType,
  GraphRelationshipType,
} from "@/lib/eng-graph/types";

// ── Canvas constants ──────────────────────────────────────────────────────────

const NODE_W      = 116;
const NODE_H      = 28;
const NODE_RX     = 3;
const TIER_H      = 140;
const CANVAS_W    = 3200;
const CANVAS_PAD  = 80;

// ── Tier assignment ───────────────────────────────────────────────────────────

const NODE_TIER: Record<GraphNodeType, number> = {
  SITE:               0,
  VENDOR:             1,
  PRODUCT:            2,
  PLC:                3,
  SCADA:              3,
  DRIVE:              4,
  MOTOR:              4,
  SENSOR:             4,
  ASSET:              4,
  PROTOCOL:           5,
  SIGNAL:             6,
  ALARM:              7,
  CASE:               8,
  ROOT_CAUSE:         9,
  RESOLUTION:         10,
  KNOWLEDGE_ARTICLE:  11,
};

// ── Color palette (no neon, no glow — Hermes Design DNA) ─────────────────────

const NODE_STYLE: Record<GraphNodeType, { fill: string; stroke: string; text: string }> = {
  SITE:               { fill: "rgba(196,160,40,0.13)",   stroke: "rgba(196,160,40,0.45)",   text: "#C4A028" },
  VENDOR:             { fill: "rgba(30,200,164,0.11)",   stroke: "rgba(30,200,164,0.40)",   text: "var(--signal)" },
  PRODUCT:            { fill: "rgba(30,200,164,0.07)",   stroke: "rgba(30,200,164,0.25)",   text: "var(--signal)" },
  PLC:                { fill: "rgba(96,180,240,0.10)",   stroke: "rgba(96,180,240,0.32)",   text: "var(--ice)" },
  SCADA:              { fill: "rgba(96,180,240,0.09)",   stroke: "rgba(96,180,240,0.28)",   text: "var(--ice)" },
  DRIVE:              { fill: "rgba(96,180,240,0.08)",   stroke: "rgba(96,180,240,0.24)",   text: "var(--ice)" },
  MOTOR:              { fill: "rgba(184,200,216,0.08)",  stroke: "rgba(184,200,216,0.26)",  text: "var(--steel)" },
  SENSOR:             { fill: "rgba(184,200,216,0.08)",  stroke: "rgba(184,200,216,0.26)",  text: "var(--steel)" },
  ASSET:              { fill: "rgba(184,200,216,0.07)",  stroke: "rgba(184,200,216,0.22)",  text: "var(--steel)" },
  PROTOCOL:           { fill: "rgba(30,200,164,0.07)",   stroke: "rgba(30,200,164,0.20)",   text: "var(--signal)" },
  SIGNAL:             { fill: "rgba(30,200,164,0.05)",   stroke: "rgba(30,200,164,0.15)",   text: "var(--muted)" },
  ALARM:              { fill: "rgba(220,38,38,0.09)",    stroke: "rgba(220,38,38,0.34)",    text: "var(--danger)" },
  CASE:               { fill: "rgba(217,119,6,0.09)",    stroke: "rgba(217,119,6,0.32)",    text: "var(--warn)" },
  ROOT_CAUSE:         { fill: "rgba(217,119,6,0.07)",    stroke: "rgba(217,119,6,0.24)",    text: "var(--warn)" },
  RESOLUTION:         { fill: "rgba(30,200,164,0.08)",   stroke: "rgba(30,200,164,0.26)",   text: "var(--signal)" },
  KNOWLEDGE_ARTICLE:  { fill: "rgba(196,160,40,0.10)",   stroke: "rgba(196,160,40,0.36)",   text: "#C4A028" },
};

const EDGE_COLOR: Partial<Record<GraphRelationshipType, string>> = {
  USES:              "rgba(30,200,164,0.22)",
  COMMUNICATES_WITH: "rgba(96,180,240,0.18)",
  GENERATES:         "rgba(220,38,38,0.22)",
  TRIGGERS:          "rgba(220,38,38,0.28)",
  CAUSED_BY:         "rgba(217,119,6,0.24)",
  RESOLVED_BY:       "rgba(30,200,164,0.28)",
  REFERENCES:        "rgba(196,160,40,0.22)",
  BELONGS_TO:        "rgba(184,200,216,0.12)",
  MONITORS:          "rgba(30,200,164,0.18)",
  DEPENDS_ON:        "rgba(184,200,216,0.18)",
  CONNECTED_TO:      "rgba(96,180,240,0.18)",
};

// ── Layout ────────────────────────────────────────────────────────────────────

function computeLayout(nodes: KnowledgeGraphNode[]): Map<string, { x: number; y: number }> {
  const tierGroups = new Map<number, KnowledgeGraphNode[]>();
  for (const n of nodes) {
    const tier = NODE_TIER[n.type] ?? 12;
    const arr  = tierGroups.get(tier) ?? [];
    arr.push(n);
    tierGroups.set(tier, arr);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [tier, group] of tierGroups.entries()) {
    // Sort alphabetically within tier for determinism
    const sorted  = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const usable  = CANVAS_W - 2 * CANVAS_PAD;
    const cellW   = Math.max(NODE_W + 12, usable / sorted.length);
    const startX  = sorted.length === 1
      ? CANVAS_W / 2
      : CANVAS_PAD + cellW / 2;

    sorted.forEach((n, i) => {
      positions.set(n.id, {
        x: startX + i * cellW,
        y: CANVAS_PAD + tier * TIER_H + NODE_H / 2,
      });
    });
  }
  return positions;
}


// ── Edge path (cubic bezier) ──────────────────────────────────────────────────

function edgePath(
  sx: number, sy: number, tx: number, ty: number,
): string {
  const cy = (sy + ty) / 2;
  return `M ${sx} ${sy} C ${sx} ${cy} ${tx} ${cy} ${tx} ${ty}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface GraphCanvasProps {
  nodes:           KnowledgeGraphNode[];
  edges:           KnowledgeGraphEdge[];
  selectedId?:     string;
  highlightIds?:   Set<string>;
  onNodeClick:     (node: KnowledgeGraphNode) => void;
  filterTypes?:    Set<GraphNodeType>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  highlightIds,
  onNodeClick,
  filterTypes,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Viewport: { x, y } = pan offset; scale = zoom
  const [vp, setVp] = useState({ x: 0, y: 0, scale: 0.42 });
  const drag = useRef<{ startX: number; startY: number; vpX: number; vpY: number } | null>(null);

  // Apply type filter
  const visibleNodes = filterTypes?.size
    ? nodes.filter(n => filterTypes!.has(n.type))
    : nodes;
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges   = edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  const positions = computeLayout(visibleNodes);

  // ── Zoom ────────────────────────────────────────────────────────────────────
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta  = e.deltaY > 0 ? 0.92 : 1.08;
    setVp(v => ({ ...v, scale: Math.max(0.15, Math.min(3, v.scale * delta)) }));
  }, []);

  // ── Pan ─────────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: PointerEvent) => {
    if ((e.target as SVGElement).closest("[data-node]")) return;
    drag.current = { startX: e.clientX, startY: e.clientY, vpX: vp.x, vpY: vp.y };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }, [vp.x, vp.y]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!drag.current) return;
    setVp(v => ({
      ...v,
      x: drag.current!.vpX + (e.clientX - drag.current!.startX),
      y: drag.current!.vpY + (e.clientY - drag.current!.startY),
    }));
  }, []);

  const onPointerUp = useCallback(() => { drag.current = null; }, []);

  // ── Fit on mount / data change ───────────────────────────────────────────────
  useEffect(() => {
    setVp({ x: 0, y: 0, scale: 0.42 });
  }, [nodes.length]);

  // ── Node click ──────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((e: MouseEvent, n: KnowledgeGraphNode) => {
    e.stopPropagation();
    onNodeClick(n);
  }, [onNodeClick]);

  const isHighlighted = (id: string) =>
    !highlightIds || highlightIds.size === 0 || highlightIds.has(id);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full select-none cursor-grab active:cursor-grabbing"
      style={{ background: "var(--bg)" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="img"
      aria-label="Engineering Knowledge Graph"
    >
      {/* Arrowhead marker */}
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 8 8"
          refX={8} refY={4}
          markerWidth={5} markerHeight={5}
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(30,200,164,0.35)" />
        </marker>
        <marker
          id="arrow-alarm"
          viewBox="0 0 8 8"
          refX={8} refY={4}
          markerWidth={5} markerHeight={5}
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(220,38,38,0.45)" />
        </marker>
        <marker
          id="arrow-gold"
          viewBox="0 0 8 8"
          refX={8} refY={4}
          markerWidth={5} markerHeight={5}
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(196,160,40,0.45)" />
        </marker>
      </defs>

      {/* Graph transform group */}
      <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>

        {/* Tier labels */}
        {Array.from(new Map(visibleNodes.map(n => [NODE_TIER[n.type] ?? 0, n.type]))).map(([tier, type]) => (
          <text
            key={`tier-${tier}`}
            x={12}
            y={CANVAS_PAD + tier * TIER_H + 4}
            fill="rgba(255,255,255,0.08)"
            fontSize={9}
            fontFamily="var(--font-mono, monospace)"
            letterSpacing="0.12em"
          >
            {type}
          </text>
        ))}

        {/* Edges */}
        {visibleEdges.map(e => {
          const sp = positions.get(e.source);
          const tp = positions.get(e.target);
          if (!sp || !tp) return null;

          const hlSrc = isHighlighted(e.source);
          const hlTgt = isHighlighted(e.target);
          const hl    = hlSrc && hlTgt;
          const color = EDGE_COLOR[e.type] ?? "rgba(184,200,216,0.12)";

          const isAlarm = e.type === "TRIGGERS" || e.type === "GENERATES";
          const isGold  = e.type === "REFERENCES";
          const marker  = isAlarm ? "url(#arrow-alarm)" : isGold ? "url(#arrow-gold)" : "url(#arrow)";

          return (
            <path
              key={e.id}
              d={edgePath(sp.x, sp.y + NODE_H / 2, tp.x, tp.y - NODE_H / 2)}
              fill="none"
              stroke={color}
              strokeWidth={hl ? 1.2 : 0.6}
              opacity={hl ? 1 : 0.3}
              markerEnd={hl ? marker : undefined}
            />
          );
        })}

        {/* Nodes */}
        {visibleNodes.map(n => {
          const pos = positions.get(n.id);
          if (!pos) return null;

          const style    = NODE_STYLE[n.type];
          const isSelected = n.id === selectedId;
          const hl         = isHighlighted(n.id);
          const truncLabel = n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label;

          return (
            <g
              key={n.id}
              data-node={n.id}
              transform={`translate(${pos.x - NODE_W / 2},${pos.y - NODE_H / 2})`}
              style={{ cursor: "pointer" }}
              onClick={ev => handleNodeClick(ev as unknown as MouseEvent, n)}
              opacity={hl ? 1 : 0.25}
              tabIndex={0}
              role="button"
              aria-label={`${n.type}: ${n.label}`}
            >
              {/* Selection ring */}
              {isSelected && (
                <rect
                  x={-2} y={-2}
                  width={NODE_W + 4} height={NODE_H + 4}
                  rx={NODE_RX + 1}
                  fill="none"
                  stroke="var(--signal)"
                  strokeWidth={1.2}
                  opacity={0.7}
                />
              )}

              {/* Node body */}
              <rect
                width={NODE_W} height={NODE_H}
                rx={NODE_RX}
                fill={style.fill}
                stroke={isSelected ? "var(--signal)" : style.stroke}
                strokeWidth={isSelected ? 1 : 0.8}
              />

              {/* Type tag — left 3px bar */}
              <rect
                x={0} y={0}
                width={3} height={NODE_H}
                rx={NODE_RX}
                fill={style.stroke}
                opacity={0.7}
              />

              {/* Label */}
              <text
                x={10} y={NODE_H / 2 + 1}
                dominantBaseline="middle"
                fontSize={8}
                fontFamily="var(--font-mono, monospace)"
                fontWeight={isSelected ? "600" : "400"}
                fill={isSelected ? "var(--ink)" : style.text}
                style={{ userSelect: "none" }}
              >
                {truncLabel}
              </text>

              {/* Degree badge */}
              {n.degree > 0 && (
                <text
                  x={NODE_W - 5} y={NODE_H / 2 + 1}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize={6.5}
                  fontFamily="var(--font-mono, monospace)"
                  fill={style.stroke}
                  opacity={0.7}
                  style={{ userSelect: "none" }}
                >
                  {n.degree}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Zoom controls */}
      <g transform="translate(12,12)">
        {[
          { label: "+", dy: 0,  action: () => setVp(v => ({ ...v, scale: Math.min(3, v.scale * 1.25) })) },
          { label: "−", dy: 22, action: () => setVp(v => ({ ...v, scale: Math.max(0.15, v.scale * 0.8) })) },
          { label: "⊡", dy: 44, action: () => setVp({ x: 0, y: 0, scale: 0.42 }) },
        ].map(({ label, dy, action }) => (
          <g key={label} transform={`translate(0,${dy})`} style={{ cursor: "pointer" }} onClick={action}>
            <rect width={20} height={18} rx={2} fill="var(--surface-2)" stroke="var(--line)" strokeWidth={0.6} />
            <text x={10} y={10} dominantBaseline="middle" textAnchor="middle" fontSize={11} fill="var(--muted)" fontFamily="monospace">{label}</text>
          </g>
        ))}
      </g>

      {/* Scale indicator */}
      <text
        x={40} y={18}
        fontSize={8}
        fontFamily="var(--font-mono, monospace)"
        fill="var(--faint)"
        letterSpacing="0.10em"
      >
        {Math.round(vp.scale * 100)}%
      </text>
    </svg>
  );
}

"use client";

import { useRef }           from "react";
import { motion, useInView } from "framer-motion";
import { useTranslations }  from "next-intl";

const NODES = [
  { id: "brain",   x: 400, y: 220, color: "#00E5FF" },
  { id: "memory",  x: 180, y: 100, color: "#38BDF8" },
  { id: "kg",      x: 620, y: 100, color: "#38BDF8" },
  { id: "agents",  x: 120, y: 300, color: "#00B8FF" },
  { id: "risk",    x: 680, y: 300, color: "#00B8FF" },
  { id: "domain",  x: 240, y: 390, color: "#0EA5E9" },
  { id: "project", x: 560, y: 390, color: "#0EA5E9" },
] as const;

const EDGES: [string, string][] = [
  ["brain", "memory"], ["brain", "kg"],     ["brain", "agents"],
  ["brain", "risk"],   ["brain", "domain"],  ["brain", "project"],
  ["memory", "agents"],["kg", "risk"],       ["domain", "agents"],
  ["project", "risk"], ["memory", "kg"],
];

type NodeId = typeof NODES[number]["id"];

function NodeMap({ labels }: { labels: Record<NodeId, string> }) {
  const nodeById = Object.fromEntries(NODES.map(n => [n.id, n]));

  return (
    <svg viewBox="0 0 800 480" className="w-full max-w-3xl mx-auto"
      style={{ filter: "drop-shadow(0 0 20px rgba(0,229,255,0.08))" }}>
      <defs>
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#00E5FF" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {EDGES.map(([a, b]) => {
        const na = nodeById[a]; const nb = nodeById[b];
        if (!na || !nb) return null;
        const len = Math.hypot(nb.x - na.x, nb.y - na.y);
        return (
          <motion.line key={`${a}-${b}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="rgba(0,184,255,0.2)" strokeWidth="1"
            strokeDasharray={`${len}`}
            initial={{ strokeDashoffset: len }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          />
        );
      })}

      {EDGES.slice(0, 6).map(([a, b], i) => {
        const na = nodeById[a]; const nb = nodeById[b];
        if (!na || !nb) return null;
        return (
          <motion.circle key={`pulse-${a}-${b}`} r="2.5" fill="#00E5FF" opacity="0.7"
            animate={{ cx: [na.x, nb.x], cy: [na.y, nb.y] }}
            transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity, delay: i * 0.4, repeatDelay: 1.5 }}
          />
        );
      })}

      {NODES.map(node => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} r="20" fill="url(#nodeGlow)" />
          <motion.circle cx={node.x} cy={node.y} r="8" fill="none"
            stroke={node.color} strokeWidth="1.5" opacity="0.4"
            animate={{ r: [8, 14, 8], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, delay: (node.x % 7) * 0.3 }}
          />
          <circle cx={node.x} cy={node.y} r="5" fill={node.color} />
          <text x={node.x} y={node.y + 22} textAnchor="middle" fontSize="11"
            fontFamily="ui-monospace, monospace" fill="rgba(180,210,240,0.75)">
            {labels[node.id]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function EcosystemSection() {
  const t        = useTranslations("landing.ecosystem");
  const ref      = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const labels: Record<NodeId, string> = {
    brain:   t("brain"),
    memory:  t("memory"),
    kg:      t("kg"),
    agents:  t("agents"),
    risk:    t("risk"),
    domain:  t("domain"),
    project: t("project"),
  };

  return (
    <section ref={ref} className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #070E1C 0%, #050816 100%)" }}>
      <div className="max-w-6xl mx-auto px-6">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
            {t("eyebrow")}
          </p>
          <h2 className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", color: "#E8F4FF" }}>
            {t("title")}
          </h2>
          <p className="max-w-xl mx-auto font-body"
            style={{ color: "rgba(140,175,210,0.75)", lineHeight: "1.7" }}>
            {t("lede")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="relative rounded-3xl p-8 landing-glass"
        >
          <NodeMap labels={labels} />
        </motion.div>
      </div>
    </section>
  );
}

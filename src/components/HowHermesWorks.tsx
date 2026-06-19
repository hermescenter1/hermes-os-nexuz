"use client";

import { useRef }                          from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

// ── Mini visual: Card 1 — Core Pulse & Orbit ─────────────────────────────

const ORBIT_ICONS = [
  { label: "PLC",    angle:  90, color: "#00E5FF" },
  { label: "MEM",    angle: 210, color: "#38bdf8" },
  { label: "AI",     angle: 330, color: "#00E5FF" },
] as const;

function MiniCore({ reduced }: { reduced: boolean }) {
  const ocx = 80, ocy = 72, or = 48, cr = 22;
  return (
    <svg viewBox="0 0 160 144" className="w-full h-full" aria-hidden="true">
      {/* Orbit ring */}
      <motion.g
        style={{ transformOrigin: `${ocx}px ${ocy}px` }}
        animate={reduced ? {} : { rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        <circle cx={ocx} cy={ocy} r={or}
          fill="none" stroke="rgba(0,229,255,0.2)" strokeWidth="0.7" strokeDasharray="5 3" />
        {ORBIT_ICONS.map(({ label, angle, color }) => {
          const a = (angle - 90) * Math.PI / 180;
          const nx = Math.round((ocx + or * Math.cos(a)) * 1000) / 1000;
          const ny = Math.round((ocy + or * Math.sin(a)) * 1000) / 1000;
          return (
            <g key={label}>
              <circle cx={nx} cy={ny} r={10}
                fill="rgba(2,10,22,0.92)" stroke={color} strokeWidth="0.7" strokeOpacity="0.5" />
              <text x={nx} y={ny + 0.5} fontSize="6.5" fill={color} fillOpacity="0.9"
                textAnchor="middle" dominantBaseline="middle" fontFamily="'Courier New', monospace">
                {label}
              </text>
            </g>
          );
        })}
      </motion.g>

      {/* Core glow */}
      <motion.circle cx={ocx} cy={ocy} r={cr + 6}
        fill="rgba(0,229,255,0.06)" stroke="none"
        animate={reduced ? {} : { r: [cr + 4, cr + 10, cr + 4], opacity: [0.5, 1, 0.5] }}
        style={{ transformOrigin: `${ocx}px ${ocy}px` }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx={ocx} cy={ocy} r={cr}
        fill="rgba(2,10,22,0.96)" stroke="rgba(0,229,255,0.65)" strokeWidth="1"
        animate={reduced ? {} : { scale: [1, 1.04, 1] }}
        style={{ transformOrigin: `${ocx}px ${ocy}px` }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <text x={ocx} y={ocy - 5} fontSize="7.5" fill="#00E5FF" textAnchor="middle"
        dominantBaseline="middle" fontFamily="'Courier New', monospace" letterSpacing="1">
        HERMES
      </text>
      <text x={ocx} y={ocy + 6} fontSize="7.5" fill="rgba(0,229,255,0.6)" textAnchor="middle"
        dominantBaseline="middle" fontFamily="'Courier New', monospace" letterSpacing="1">
        NEXUS
      </text>
    </svg>
  );
}

// ── Mini visual: Card 2 — Data Flow ──────────────────────────────────────

const FLOW_ROWS = [
  { label: "PLC Signals",   color: "#00E5FF", delay: 0.0 },
  { label: "Sensor Data",   color: "#38bdf8", delay: 0.3 },
  { label: "SCADA Events",  color: "#00E5FF", delay: 0.6 },
  { label: "Alarms",        color: "#38bdf8", delay: 0.9 },
] as const;

function MiniDataFlow({ reduced }: { reduced: boolean }) {
  return (
    <div className="w-full flex items-center gap-2 px-2">
      {/* Sources */}
      <div className="flex flex-col gap-1.5 flex-none">
        {FLOW_ROWS.map(({ label, color }) => (
          <div key={label}
            className="text-[9px] font-mono px-2 py-0.5 rounded"
            style={{
              color,
              background: `${color}0d`,
              border: `0.5px solid ${color}28`,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Flow track */}
      <div className="relative flex-1 overflow-hidden" style={{ height: "84px" }}>
        <svg viewBox="0 0 80 84" className="absolute inset-0 w-full h-full" aria-hidden="true">
          {FLOW_ROWS.map(({ color, delay }, i) => {
            const y = 10 + i * 21;
            return (
              <g key={i}>
                <line x1="0" y1={y} x2="80" y2={y}
                  stroke={color} strokeWidth="0.4" strokeOpacity="0.15" />
                <motion.circle
                  cx={0} cy={y} r={2.5}
                  fill={color}
                  animate={reduced ? {} : { cx: [0, 80], opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: "linear",
                    delay,
                    repeatDelay: 0.6,
                    times: [0, 0.1, 0.9, 1],
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Receiver */}
      <div
        className="flex-none flex items-center justify-center text-[8px] font-mono rounded-lg"
        style={{
          width: "48px", height: "48px",
          background: "rgba(2,10,22,0.92)",
          border: "1px solid rgba(0,229,255,0.4)",
          color: "#00E5FF",
          textAlign: "center",
          lineHeight: 1.2,
          boxShadow: "0 0 14px rgba(0,229,255,0.15)",
        }}
      >
        HER<br />MES
      </div>
    </div>
  );
}

// ── Mini visual: Card 3 — AI Copilot Insight ─────────────────────────────

function MiniCopilotCard({ inView, reduced }: { inView: boolean; reduced: boolean }) {
  return (
    <div className="w-full px-1">
      <div
        className="rounded-xl p-3 text-[10px] font-mono"
        style={{
          background: "rgba(2,10,22,0.90)",
          border: "1px solid rgba(0,229,255,0.3)",
          boxShadow: "0 0 20px rgba(0,229,255,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "#00E5FF" }}
            animate={reduced ? {} : { opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span style={{ color: "#00E5FF" }}>Copilot Recommendation</span>
        </div>

        {/* Divider */}
        <div className="h-px mb-2" style={{ background: "rgba(0,229,255,0.15)" }} />

        {/* Recommendation text */}
        <p className="mb-2 leading-relaxed" style={{ color: "rgba(180,220,248,0.80)" }}>
          Reduce pump speed by 12% to prevent bearing overload.
        </p>

        {/* Confidence bar */}
        <div className="mb-2">
          <div className="flex justify-between mb-1" style={{ color: "rgba(0,229,255,0.6)" }}>
            <span>Confidence</span>
            <span>87%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,229,255,0.1)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #00E5FF, #38bdf8)" }}
              initial={{ width: "0%" }}
              animate={inView ? { width: "87%" } : { width: "0%" }}
              transition={{ duration: reduced ? 0 : 1.2, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <div
            className="flex-1 text-center py-1 rounded-md text-[9px]"
            style={{
              background: "rgba(0,229,255,0.12)",
              border: "0.5px solid rgba(0,229,255,0.35)",
              color: "#00E5FF",
            }}
          >
            Apply
          </div>
          <div
            className="flex-1 text-center py-1 rounded-md text-[9px]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              color: "rgba(140,180,218,0.55)",
            }}
          >
            Dismiss
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cards definition ──────────────────────────────────────────────────────

type CardItem = {
  title: string;
  desc:  string;
  Visual: React.ComponentType<{ inView: boolean; reduced: boolean }>;
};

const CARDS: CardItem[] = [
  {
    title:  "Core Pulse & Orbit",
    desc:   "The Hermes Nexus Core connects every industrial module in real time, orchestrating data flow across PLC, SCADA, memory, and AI layers.",
    Visual: ({ reduced }) => (
      <div className="w-full h-32 flex items-center justify-center">
        <div style={{ width: "160px", height: "144px" }}>
          <MiniCore reduced={reduced ?? false} />
        </div>
      </div>
    ),
  },
  {
    title:  "Data Flow",
    desc:   "PLC signals, sensor readings, SCADA events, and alarms are ingested continuously, normalized, and routed to the intelligence engine.",
    Visual: ({ reduced }) => (
      <div className="w-full h-32 flex items-center">
        <MiniDataFlow reduced={reduced ?? false} />
      </div>
    ),
  },
  {
    title:  "AI Copilot Insight",
    desc:   "The Copilot engine analyzes patterns, generates actionable recommendations, and delivers confidence-scored guidance to plant operators.",
    Visual: ({ inView, reduced }) => (
      <div className="w-full h-32 flex items-center">
        <MiniCopilotCard inView={inView} reduced={reduced ?? false} />
      </div>
    ),
  },
];

// ── Section ───────────────────────────────────────────────────────────────

export function HowHermesWorks() {
  const ref     = useRef<HTMLElement>(null);
  const inView  = useInView(ref, { once: true, margin: "-80px" });
  const reduced = useReducedMotion() ?? false;

  return (
    <section
      ref={ref}
      className="relative py-24 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #060B1A 0%, #060E20 100%)" }}
    >
      {/* Top separator */}
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.18), transparent)" }} />

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px]"
          style={{ background: "radial-gradient(ellipse, rgba(0,229,255,0.04) 0%, transparent 70%)" }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Heading */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <p className="font-mono text-xs uppercase tracking-widest mb-4"
            style={{ color: "#00E5FF" }}>
            Intelligence Pipeline
          </p>
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem,4vw,2.75rem)", color: "#E8F4FF" }}
          >
            How Hermes Works
          </h2>
          <p className="max-w-xl mx-auto font-body"
            style={{ color: "rgba(140,185,210,0.75)", lineHeight: "1.7", fontSize: "1rem" }}>
            From industrial signals to intelligent actions.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CARDS.map(({ title, desc, Visual }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 28 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, ease: "easeOut" as const, delay: 0.15 + i * 0.12 }}
              className="group relative rounded-2xl p-6 overflow-hidden"
              style={{
                background:     "rgba(4,12,22,0.75)",
                backdropFilter: "blur(16px)",
                border:         "1px solid rgba(0,229,255,0.12)",
                boxShadow:      "0 4px 32px rgba(0,0,0,0.3)",
              }}
            >
              {/* Top accent line on hover */}
              <div className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.5), transparent)" }} />

              {/* Mini visual */}
              <Visual inView={inView} reduced={reduced} />

              {/* Divider */}
              <div className="my-4 h-px" style={{ background: "rgba(0,229,255,0.08)" }} />

              {/* Text */}
              <h3
                className="font-display font-semibold mb-2"
                style={{ fontSize: "1.05rem", color: "#E8F4FF" }}
              >
                {title}
              </h3>
              <p
                className="font-body text-sm leading-relaxed"
                style={{ color: "rgba(140,185,210,0.7)" }}
              >
                {desc}
              </p>

              {/* Corner glow on hover */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 0% 100%, rgba(0,229,255,0.05) 0%, transparent 60%)" }} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";

// ── Geometry constants ────────────────────────────────────────────────────
const CX = 270, CY = 215;          // SVG center
const RO = 158, RI = 104, CR = 50; // outer/inner orbit radii, core radius

function pt(deg: number, r: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [
    Math.round((CX + r * Math.cos(a)) * 1000) / 1000,
    Math.round((CY + r * Math.sin(a)) * 1000) / 1000,
  ];
}

// ── Data ──────────────────────────────────────────────────────────────────
const MODULES = [
  { label: "PLC / TIA Portal",  angle:   0, color: "#00E5FF" },
  { label: "SCADA / HMI",       angle:  45, color: "#38bdf8" },
  { label: "OPC UA",            angle:  90, color: "#00E5FF" },
  { label: "MQTT",              angle: 135, color: "#38bdf8" },
  { label: "AI Copilot",        angle: 180, color: "#00E5FF" },
  { label: "Knowledge Engine",  angle: 225, color: "#38bdf8" },
  { label: "Cloud SaaS",        angle: 270, color: "#00E5FF" },
  { label: "Factory On-Prem",   angle: 315, color: "#38bdf8" },
] as const;

const CHIPS = [
  { label: "Telemetry Live",      cx:  72, cy:  28, color: "#00E5FF" },
  { label: "Copilot Ready",       cx: 468, cy:  28, color: "#38bdf8" },
  { label: "Plant Memory Active", cx:  72, cy: 456, color: "#00E5FF" },
  { label: "Safety Layer Online", cx: 468, cy: 456, color: "#38bdf8" },
] as const;

// Factory chimney tips for blinking lights
const CHIMNEY_TIPS: [number, number][] = [
  [28, 433], [124, 427], [254, 423], [334, 427], [434, 428], [503, 441],
];

// ── Factory silhouette path (hand-crafted skyline) ────────────────────────
const FACTORY_D = [
  "M0,480 L0,460",
  "L18,460 L18,448 L22,448 L22,438 L26,438 L26,432 L30,432 L30,438 L34,438 L34,448 L38,448 L38,460",
  "L55,460 L55,450 L72,450 L72,455 L88,455 L88,460",
  "L105,460 L105,450 L112,450 L112,440 L118,440 L118,432 L122,432 L122,426",
  "L126,426 L126,432 L130,432 L130,440 L136,440 L136,450 L143,450 L143,460",
  "L158,460 L158,452 L175,452 L175,460",
  "L192,460 L192,450 L198,450 L198,440 L215,440 L215,450 L221,450 L221,460",
  "L238,460 L238,448 L242,448 L242,435 L248,435 L248,428 L252,428 L252,422",
  "L256,422 L256,428 L260,428 L260,435 L266,435 L266,448 L270,448 L270,460",
  "L284,460 L284,452 L302,452 L302,460",
  "L315,460 L315,450 L322,450 L322,440 L328,440 L328,432 L332,432 L332,426",
  "L336,426 L336,432 L340,432 L340,440 L346,440 L346,450 L353,450 L353,460",
  "L368,460 L368,452 L385,452 L385,458 L400,458 L400,460",
  "L415,460 L415,450 L421,450 L421,440 L428,440 L428,433 L432,433 L432,427",
  "L436,427 L436,433 L440,433 L440,440 L447,440 L447,450 L453,450 L453,460",
  "L468,460 L468,452 L484,452 L484,460",
  "L498,460 L498,450 L504,450 L504,440 L521,440 L521,450 L527,450 L527,460",
  "L540,460 L540,480 Z",
].join(" ");

// ── Main component ────────────────────────────────────────────────────────
export default function HermesNexusVisual() {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="relative w-full h-full select-none" aria-hidden="true">
      <svg
        viewBox="0 0 540 480"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="hnv-bg" cx="50%" cy="45%" r="50%">
            <stop offset="0%"   stopColor="#00E5FF" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0"    />
          </radialGradient>
          <radialGradient id="hnv-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#001e38" />
            <stop offset="60%"  stopColor="#001228" />
            <stop offset="100%" stopColor="#000814" />
          </radialGradient>
          <filter id="hnv-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="hnv-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="hnv-pulse" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Background radial glow */}
        <rect x="0" y="0" width="540" height="480" fill="url(#hnv-bg)" />

        {/* Subtle grid */}
        {Array.from({ length: 13 }, (_, i) => i * 40).map(y => (
          <line key={`gh${y}`} x1="0" y1={y} x2="540" y2={y}
            stroke="rgba(0,229,255,0.04)" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 14 }, (_, i) => i * 40).map(x => (
          <line key={`gv${x}`} x1={x} y1="0" x2={x} y2="480"
            stroke="rgba(0,229,255,0.04)" strokeWidth="0.5" />
        ))}

        {/* Corner circuit traces */}
        <polyline points="0,90 38,90 38,130 76,130"   stroke="rgba(0,229,255,0.07)" strokeWidth="0.8" fill="none" />
        <polyline points="540,78 502,78 502,118 464,118" stroke="rgba(0,229,255,0.07)" strokeWidth="0.8" fill="none" />
        <polyline points="28,390 28,355 68,355"         stroke="rgba(56,189,248,0.06)" strokeWidth="0.8" fill="none" />
        <polyline points="512,408 512,368 472,368"      stroke="rgba(0,229,255,0.06)" strokeWidth="0.8" fill="none" />

        {/* ── Outer orbit ring (slow clockwise rotation) ── */}
        <motion.g
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={reduced ? {} : { rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        >
          <circle cx={CX} cy={CY} r={RO}
            fill="none" stroke="rgba(0,229,255,0.18)" strokeWidth="0.7" strokeDasharray="8 4" />
        </motion.g>

        {/* ── Inner orbit ring (counter-clockwise) ── */}
        <motion.g
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={reduced ? {} : { rotate: -360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          <circle cx={CX} cy={CY} r={RI}
            fill="none" stroke="rgba(0,229,255,0.13)" strokeWidth="0.6" strokeDasharray="3 6" />
        </motion.g>

        {/* ── Sonar heartbeat pulse rings ── */}
        {[0, 1, 2].map(i => (
          <motion.circle
            key={`pulse-${i}`}
            cx={CX} cy={CY}
            r={CR + 6}
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="1.4"
            strokeOpacity={0}
            filter="url(#hnv-pulse)"
            animate={reduced ? {} : {
              r: [CR + 6, RO + 20],
              strokeOpacity: [0.46, 0],
            }}
            transition={{
              duration: 3.0,
              repeat: Infinity,
              ease: "easeOut",
              delay: i * 2,
              repeatDelay: 3.0,
            }}
          />
        ))}

        {/* ── Connector lines + traveling data particles ── */}
        {MODULES.map((mod, i) => {
          const [mx, my] = pt(mod.angle, RO);
          return (
            <g key={`conn-${i}`}>
              {/* Static dim wire */}
              <line x1={mx} y1={my} x2={CX} y2={CY}
                stroke={mod.color} strokeWidth="0.5" strokeOpacity="0.14" />
              {/* Traveling dash */}
              <motion.line
                x1={mx} y1={my} x2={CX} y2={CY}
                stroke={mod.color}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeDasharray={`3 ${RO + 2}`}
                animate={reduced ? {} : { strokeDashoffset: [0, -(RO + 3)] }}
                transition={{
                  duration: 1.6 + i * 0.08,
                  repeat: Infinity,
                  ease: "linear",
                  delay: i * 0.38,
                  repeatDelay: 0.1,
                }}
              />
            </g>
          );
        })}

        {/* ── Module nodes ── */}
        {MODULES.map((mod, i) => {
          const [mx, my] = pt(mod.angle, RO);
          const bw = 78, bh = 22;
          return (
            <motion.g
              key={`mod-${i}`}
              animate={reduced ? {} : { y: [0, -2.5, 0, 2.5, 0] }}
              transition={{
                duration: 4.5 + i * 0.6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.7,
              }}
            >
              <rect
                x={mx - bw / 2} y={my - bh / 2}
                width={bw} height={bh} rx={6}
                fill="rgba(2,10,22,0.90)"
                stroke={mod.color}
                strokeWidth="0.65"
                strokeOpacity="0.5"
                filter="url(#hnv-soft)"
              />
              {/* Status dot */}
              <motion.circle
                cx={mx - bw / 2 + 8} cy={my} r={2}
                fill={mod.color}
                animate={reduced ? {} : { opacity: [1, 0.25, 1] }}
                transition={{ duration: 2.2 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* Pulse-hit flare — brightens when sonar ring reaches the node */}
              <motion.circle
                cx={mx - bw / 2 + 8} cy={my}
                fill="#2dd4bf"
                initial={{ r: 2, fillOpacity: 0 }}
                animate={reduced ? {} : { fillOpacity: [0, 0.88, 0], r: [2, 5.5, 2] }}
                transition={{
                  duration: 0.32,
                  repeat: Infinity,
                  repeatDelay: 1.68,
                  ease: "easeOut",
                  delay: 2.5,
                }}
              />
              <text
                x={mx - bw / 2 + 16} y={my + 0.5}
                fontSize="7.6"
                fill={mod.color}
                fillOpacity="0.9"
                fontFamily="'Courier New', monospace"
                dominantBaseline="middle"
              >
                {mod.label}
              </text>
            </motion.g>
          );
        })}

        {/* ── Core glow pulse ── */}
        <motion.circle
          cx={CX} cy={CY} r={CR + 20}
          fill="rgba(0,229,255,0.04)"
          stroke="none"
          animate={reduced ? {} : { r: [CR + 16, CR + 26, CR + 16], opacity: [0.6, 1, 0.6] }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Beat ring — teal flash in sync with each sonar emission */}
        <motion.circle
          cx={CX} cy={CY}
          r={CR + 3}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="2"
          strokeOpacity={0}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={reduced ? {} : { strokeOpacity: [0, 0.55, 0], r: [CR + 3, CR + 16, CR + 3] }}
          transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 1.3, ease: "easeOut" }}
        />
        <circle cx={CX} cy={CY} r={CR + 8}
          fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="1.5" />

        {/* Core body */}
        <motion.circle
          cx={CX} cy={CY} r={CR}
          fill="url(#hnv-core)"
          stroke="rgba(0,229,255,0.70)"
          strokeWidth="1.1"
          filter="url(#hnv-glow)"
          animate={reduced ? {} : { scale: [1, 1.022, 1] }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <circle cx={CX} cy={CY} r={CR - 13}
          fill="none" stroke="rgba(0,229,255,0.18)" strokeWidth="0.6" />

        {/* Core text */}
        <text x={CX} y={CY - 7} fontSize="9" fill="#00E5FF" textAnchor="middle"
          dominantBaseline="middle" fontFamily="'Courier New', monospace" letterSpacing="1.5">
          HERMES
        </text>
        <text x={CX} y={CY + 7} fontSize="9" fill="rgba(0,229,255,0.65)" textAnchor="middle"
          dominantBaseline="middle" fontFamily="'Courier New', monospace" letterSpacing="1.5">
          NEXUS
        </text>

        {/* ── Status chips ── */}
        {CHIPS.map((chip, i) => {
          const cw = chip.label.length * 5.2 + 24;
          return (
            <g key={`chip-${i}`}>
              <rect x={chip.cx - cw / 2} y={chip.cy - 9} width={cw} height={18} rx={9}
                fill="rgba(2,8,20,0.88)"
                stroke={chip.color} strokeWidth="0.55" strokeOpacity="0.38"
              />
              <motion.circle
                cx={chip.cx - cw / 2 + 9} cy={chip.cy} r={2.4}
                fill={chip.color}
                animate={reduced ? {} : { opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.45 }}
              />
              <text
                x={chip.cx - cw / 2 + 18} y={chip.cy + 0.5}
                fontSize="6.8" fill={chip.color} fillOpacity="0.82"
                fontFamily="'Courier New', monospace" dominantBaseline="middle"
              >
                {chip.label}
              </text>
            </g>
          );
        })}

        {/* ── Factory silhouette ── */}
        <path
          d={FACTORY_D}
          fill="rgba(0,229,255,0.04)"
          stroke="rgba(0,229,255,0.11)"
          strokeWidth="0.55"
        />

        {/* Chimney warning lights */}
        {CHIMNEY_TIPS.map(([fx, fy], i) => (
          <motion.circle key={`fl-${i}`}
            cx={fx} cy={fy} r={1.5}
            fill={i % 2 === 0 ? "#00E5FF" : "#38bdf8"}
            animate={reduced ? {} : { opacity: [0.85, 0.15, 0.85] }}
            transition={{ duration: 1.6 + i * 0.28, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          />
        ))}
      </svg>
    </div>
  );
}

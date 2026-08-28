// PHASE 104-E — the Hermes Observatory signature (round 3: RETAINED AND
// ENHANCED, per owner ruling OBSERVATORY_SIGNATURE=KEEP).
//
// The product's whole argument as ONE bespoke drawing:
//
//   industrial asset -> PLC / SCADA / HMI -> evidence -> Industrial Brain
//                    -> hypothesis & risk -> human validation gate -> safe action
//
// Repo-native: hand-built SVG geometry on the Phase 104 token grammar. No
// image, no library, no dependency, and NO TEXT INSIDE ANY SVG — every label is
// HTML, read from the EXISTING `publicSite` catalog, so the diagram is fully
// localized in en/de/fa without adding a message key and mirrors safely under
// RTL (pure geometry flips; glyphs would not).
//
// ROUND 3 CHANGES, all in response to the visual review:
//   - a real stroke HIERARCHY: the bus is 2.5 at full brand contrast, secondary
//     connections 1.25, dimension/provenance lines 1 — the round-2 drawing had
//     everything at one faint weight and vanished into the field;
//   - node weight follows meaning: asset, Brain, gate and action are the
//     heaviest marks; control-layer and packet marks are lighter;
//   - the semantic reasoning tokens appear at their meaning ONLY — evidence
//     (azure), contradiction (red), missing (amber, dashed), hypothesis
//     (violet), decision (cyan). Nothing else on the page uses them;
//   - a THIRD composition, `CompactSignature`, sized to sit inside the mobile
//     fold beneath the CTA, so the signature is the first thing a phone shows
//     rather than empty space;
//   - the provenance trail is a visible cyan dash rather than a ghost.
//
// The desktop bus and the mobile column remain two genuinely different
// compositions, not one scaled drawing.

import { cn } from "@/components/ds";

export interface ObservatoryNodes {
  asset: string;
  signals: string;
  evidence: string;
  brain: string;
  hypotheses: string;
  risk: string;
  gate: string;
  action: string;
  /** Evidence quality states — evidence / contradiction / missing. */
  quality: readonly string[];
  /** "Illustrative — not live plant telemetry." */
  disclosure: string;
  /** Accessible name for the whole diagram. */
  ariaLabel: string;
}

/** Locale-invariant protocol identifiers. Rendered LTR inside an RTL page. */
const PROTOCOLS = ["PLC", "SCADA/HMI", "OPC UA"] as const;

/* ── shared glyphs ────────────────────────────────────────────────────────── */

function Pump({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle className="hh-sig-core" cx={cx} cy={cy} r={r} />
      <circle className="hh-sig-dim" cx={cx} cy={cy} r={r * 0.62} />
      <path
        className="hh-sig-mark"
        d={`M${cx - r * 0.28} ${cy - r * 0.32} l${r * 0.6} ${r * 0.32} l${-r * 0.6} ${r * 0.32} Z`}
      />
    </g>
  );
}

function Gate({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <path
        className="hh-sig-gate"
        d={`M${cx} ${cy - r * 2.9} V${cy - r * 1.45} M${cx} ${cy + r * 1.45} V${cy + r * 2.9}`}
      />
      <path
        className="hh-sig-gate"
        d={`M${cx - r * 1.05} ${cy - r * 1.45} H${cx + r * 1.05} M${cx - r * 1.05} ${cy + r * 1.45} H${cx + r * 1.05}`}
      />
      <circle className="hh-sig-core-2" cx={cx} cy={cy} r={r} />
      <circle className="hh-sig-gate" cx={cx} cy={cy} r={r} />
      <path
        className="hh-sig-decision"
        d={`M${cx - r * 0.42} ${cy} l${r * 0.3} ${r * 0.36} l${r * 0.66} ${-r * 0.78} l${r * 0.15} ${r * 0.15} l${-r * 0.81} ${r * 0.96} l${-r * 0.45} ${-r * 0.54} Z`}
      />
    </g>
  );
}

function Core({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  const hex = (k: number) =>
    `M${cx} ${cy - s * k} L${cx + s * 0.87 * k} ${cy - s * 0.5 * k} L${cx + s * 0.87 * k} ${cy + s * 0.5 * k} L${cx} ${cy + s * k} L${cx - s * 0.87 * k} ${cy + s * 0.5 * k} L${cx - s * 0.87 * k} ${cy - s * 0.5 * k} Z`;
  return (
    <g>
      <path className="hh-sig-plate-3" d={hex(1)} />
      <path className="hh-sig-core" d={hex(0.66)} />
      <path
        className="hh-sig-dim"
        d={`M${cx} ${cy} L${cx - s * 0.57} ${cy - s * 0.33} M${cx} ${cy} L${cx + s * 0.57} ${cy - s * 0.33} M${cx} ${cy} L${cx} ${cy + s * 0.66}`}
      />
      <circle className="hh-sig-mark" cx={cx} cy={cy} r={s * 0.14} />
    </g>
  );
}

/** Evidence packets: quality is carried by SHAPE (filled / split / dashed) and
    then reinforced by the semantic token — colour is never the only channel. */
function Packets({ x, y, w, h, gap }: { x: number; y: number; w: number; h: number; gap: number }) {
  return (
    <g>
      <rect className="hh-sig-plate-2" x={x} y={y} width={w} height={h} rx="2" />
      <rect className="hh-sig-evidence" x={x + 3} y={y + 3} width={w * 0.45} height={h - 6} rx="1" opacity="0.9" />
      <rect className="hh-sig-plate-2" x={x + w + gap} y={y} width={w} height={h} rx="2" />
      <line className="hh-sig-track" x1={x + w + gap + w / 2} y1={y} x2={x + w + gap + w / 2} y2={y + h} />
      <rect className="hh-sig-contradiction" x={x + w + gap + 3} y={y + h - 8} width={w - 6} height={4} rx="1" />
      <rect className="hh-sig-missing" x={x + 2 * (w + gap)} y={y} width={w} height={h} rx="2" strokeWidth="1.5" />
    </g>
  );
}

/** Ranked hypotheses (bar LENGTH carries rank) and the risk window. */
function Ranking({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect className="hh-sig-plate-2" x={x} y={y} width={w} height={16} rx="1" />
      <rect className="hh-sig-hypothesis" x={x} y={y} width={w * 0.86} height={16} rx="1" opacity="0.85" />
      <rect className="hh-sig-plate-2" x={x} y={y + 22} width={w} height={16} rx="1" />
      <rect className="hh-sig-hypothesis" x={x} y={y + 22} width={w * 0.41} height={16} rx="1" opacity="0.5" />
      <rect className="hh-sig-plate" x={x} y={y + 52} width={w} height={22} rx="1" />
      <rect x={x} y={y + 52} width={4} height={22} style={{ fill: "var(--color-status-warning)" }} />
      <line className="hh-sig-dim" x1={x + w * 0.35} y1={y + 52} x2={x + w * 0.35} y2={y + 74} />
      <line className="hh-sig-dim" x1={x + w * 0.7} y1={y + 52} x2={x + w * 0.7} y2={y + 74} />
    </g>
  );
}

/* ═══ Desktop: the signal bus ═══════════════════════════════════════════════ */
function BusSignature() {
  const Y = 150;
  return (
    <svg
      viewBox="0 0 1400 330"
      className="hh-sig-frame h-auto w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <g className="hh-sig-dim" opacity="0.6">
        <line x1="40" y1="34" x2="1360" y2="34" />
        <line x1="40" y1="300" x2="1360" y2="300" />
        {[40, 370, 700, 1030, 1360].map((x) => (
          <line key={x} x1={x} y1="30" x2={x} y2="38" />
        ))}
      </g>

      {/* THE BUS — full contrast, the one dominant line */}
      <line className="hh-sig-bus" x1="160" y1={Y} x2="1300" y2={Y} />
      <line className="hh-sig-flow" x1="160" y1={Y} x2="1300" y2={Y} />

      {/* 1 · asset */}
      <g>
        <path className="hh-sig-plate" d="M52 92 L120 92 L120 70 L160 70 L160 206 L52 206 Z" />
        <rect className="hh-sig-plate-2" x="66" y="150" width="28" height="42" />
        <rect className="hh-sig-plate-2" x="104" y="164" width="24" height="28" />
        <line className="hh-sig-track" x1="140" y1="70" x2="140" y2="52" />
        <Pump cx={84} cy={122} r={17} />
        <line className="hh-sig-track" x1="84" y1="139" x2="84" y2="150" />
      </g>

      {/* 2 · control layer — PLC rack, SCADA/HMI trend, historian */}
      <g>
        <rect className="hh-sig-plate" x="236" y="58" width="100" height="54" rx="2" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} className="hh-sig-plate-3" x={244 + i * 18} y="66" width="12" height="38" />
        ))}
        <rect className="hh-sig-mark" x="244" y="66" width="12" height="6" />
        <rect className="hh-sig-plate" x="236" y="126" width="100" height="48" rx="2" />
        <polyline className="hh-sig-scan" points="244,160 258,150 272,156 288,138 304,146 328,134" />
        <rect className="hh-sig-plate" x="236" y="188" width="100" height="42" rx="2" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} className="hh-sig-plate-3" x={244 + i * 13} y={200 + (i % 3) * 5} width="8" height={22 - (i % 3) * 5} />
        ))}
        <path className="hh-sig-track" d="M160 136 H200 V85 H236" />
        <path className="hh-sig-track" d="M160 150 H236" />
        <path className="hh-sig-track" d="M160 164 H200 V209 H236" />
        <path className="hh-sig-track" d="M336 85 H372 V150" />
        <path className="hh-sig-track" d="M336 209 H372 V150" />
      </g>

      {/* 3 · evidence packets */}
      <g>
        <Packets x={432} y={78} w={40} h={30} gap={20} />
        {[452, 512, 572].map((x) => (
          <line key={x} className="hh-sig-track" x1={x} y1={108} x2={x} y2={Y} />
        ))}
      </g>

      {/* 4 · Industrial Brain */}
      <Core cx={706} cy={Y} s={58} />

      {/* 5 · hypotheses + risk */}
      <g>
        <path className="hh-sig-track" d="M770 150 H840" />
        <Ranking x={840} y={92} w={124} />
        <path className="hh-sig-track" d="M964 150 H1020" />
      </g>

      {/* 6 · human validation gate — the Beacon */}
      <Gate cx={1058} cy={Y} r={18} />

      {/* 7 · safe action */}
      <g>
        <path className="hh-sig-track" d="M1076 150 H1236" />
        <rect className="hh-sig-core" x="1236" y="126" width="64" height="48" rx="3" />
        <path className="hh-sig-ink" d="M1252 141 h32 v6 h-32 Z M1252 153 h22 v6 h-22 Z" />
      </g>

      {/* provenance — the action stays tied to its evidence */}
      <path className="hh-sig-prov" strokeDasharray="3 6" d="M1268 174 V262 H452 V108" />
    </svg>
  );
}

/* ═══ Mobile: the instrument column ═════════════════════════════════════════ */
function ColumnSignature() {
  const stages = ["asset", "rack", "packets", "core", "bars", "gate", "out"] as const;
  return (
    <svg
      viewBox="0 0 300 640"
      className="hh-sig-frame h-auto w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <line className="hh-sig-bus" x1="52" y1="40" x2="52" y2="600" />
      <line className="hh-sig-flow" x1="52" y1="40" x2="52" y2="600" />
      {stages.map((s, i) => {
        const y = 58 + i * 84;
        return (
          <g key={s}>
            <line className="hh-sig-track" x1="52" y1={y} x2="88" y2={y} />
            <circle className="hh-sig-mark" cx="52" cy={y} r="4" />
            {s === "asset" && (
              <g>
                <path className="hh-sig-plate" d={`M96 ${y - 26} h56 v52 h-56 Z`} />
                <Pump cx={124} cy={y} r={13} />
              </g>
            )}
            {s === "rack" && (
              <g>
                <rect className="hh-sig-plate" x="96" y={y - 22} width="84" height="44" rx="2" />
                {[0, 1, 2, 3].map((j) => (
                  <rect key={j} className="hh-sig-plate-3" x={103 + j * 19} y={y - 15} width="13" height="30" />
                ))}
                <rect className="hh-sig-mark" x="103" y={y - 15} width="13" height="5" />
              </g>
            )}
            {s === "packets" && <Packets x={96} y={y - 12} w={30} h={24} gap={8} />}
            {s === "core" && <Core cx={136} cy={y} s={34} />}
            {s === "bars" && <Ranking x={96} y={y - 30} w={90} />}
            {s === "gate" && <Gate cx={130} cy={y} r={13} />}
            {s === "out" && (
              <g>
                <rect className="hh-sig-core" x="96" y={y - 20} width="60" height="40" rx="3" />
                <path className="hh-sig-ink" d={`M110 ${y - 7} h30 v5 h-30 Z M110 ${y + 3} h20 v5 h-20 Z`} />
              </g>
            )}
          </g>
        );
      })}
      <path className="hh-sig-prov" strokeDasharray="3 6" d="M240 566 V226 H196" />
    </svg>
  );
}

/* ═══ Compact: the mobile-fold strip ════════════════════════════════════════
   Sits under the primary CTA at 390px. Seven marks on one bus, no detail —
   legible at thumbnail scale, so the fold shows the signature, not space. */
function CompactSignature() {
  const Y = 40;
  const xs = [26, 78, 128, 178, 226, 272, 318];
  return (
    <svg
      viewBox="0 0 344 80"
      className="hh-sig-frame h-auto w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <line className="hh-sig-bus" x1={xs[0]} y1={Y} x2={xs[6]} y2={Y} />
      <line className="hh-sig-flow" x1={xs[0]} y1={Y} x2={xs[6]} y2={Y} />
      <Pump cx={xs[0]} cy={Y} r={11} />
      <g>
        <rect className="hh-sig-plate" x={xs[1] - 14} y={Y - 12} width="28" height="24" rx="2" />
        {[0, 1, 2].map((j) => (
          <rect key={j} className="hh-sig-plate-3" x={xs[1] - 10 + j * 8} y={Y - 8} width="5" height="16" />
        ))}
      </g>
      <g>
        <rect className="hh-sig-plate-2" x={xs[2] - 16} y={Y - 9} width="10" height="18" rx="1" />
        <rect className="hh-sig-evidence" x={xs[2] - 14} y={Y - 7} width="6" height="14" rx="1" />
        <rect className="hh-sig-plate-2" x={xs[2] - 5} y={Y - 9} width="10" height="18" rx="1" />
        <rect className="hh-sig-contradiction" x={xs[2] - 3} y={Y + 4} width="6" height="3" />
        <rect className="hh-sig-missing" x={xs[2] + 6} y={Y - 9} width="10" height="18" rx="1" />
      </g>
      <Core cx={xs[3]} cy={Y} s={17} />
      <g>
        <rect className="hh-sig-hypothesis" x={xs[4] - 14} y={Y - 9} width="26" height="6" rx="1" opacity="0.85" />
        <rect className="hh-sig-hypothesis" x={xs[4] - 14} y={Y + 2} width="14" height="6" rx="1" opacity="0.5" />
      </g>
      <Gate cx={xs[5]} cy={Y} r={8} />
      <g>
        <rect className="hh-sig-core" x={xs[6] - 12} y={Y - 11} width="24" height="22" rx="2" />
        <path className="hh-sig-ink" d={`M${xs[6] - 7} ${Y - 4} h14 v3 h-14 Z M${xs[6] - 7} ${Y + 2} h9 v3 h-9 Z`} />
      </g>
    </svg>
  );
}

export function ObservatorySignature({
  nodes,
  variant = "auto",
  className,
}: {
  nodes: ObservatoryNodes;
  /**
   * `auto` — the bus on md+, the column below md (chapter use).
   * `compact` — the mobile-fold strip only, no label grid.
   */
  variant?: "auto" | "compact";
  className?: string;
}) {
  const flow = [
    nodes.asset,
    nodes.signals,
    nodes.evidence,
    nodes.brain,
    `${nodes.hypotheses} · ${nodes.risk}`,
    nodes.gate,
    nodes.action,
  ];

  if (variant === "compact") {
    return (
      <figure className={cn("min-w-0", className)} aria-label={nodes.ariaLabel}>
        <CompactSignature />
        <figcaption dir="auto" className="mt-2 text-caption text-text-muted">
          {nodes.disclosure}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className={cn("min-w-0", className)} aria-label={nodes.ariaLabel}>
      <div className="hidden md:block">
        <BusSignature />
      </div>
      <div className="md:hidden">
        <ColumnSignature />
      </div>

      {/* The flow as text — the accessible and no-SVG path. HTML, not SVG
          text: Persian shaping, wrapping and RTL alignment are the browser's
          job here and a source of subtle breakage inside SVG. */}
      <ol className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
        {flow.map((label, i) => (
          <li key={label} className="min-w-0">
            <span aria-hidden="true" className="hh-mono-label block">
              {`0${i + 1}`}
            </span>
            <span
              dir="auto"
              className={cn(
                "mt-1 block text-label",
                i === 5 ? "font-bold text-brand-primary" : "font-medium text-text-secondary",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        {PROTOCOLS.map((p) => (
          <span key={p} dir="ltr" className="hh-mono-label">
            {p}
          </span>
        ))}
        <span dir="auto" className="ms-auto text-caption text-text-muted">
          {nodes.disclosure}
        </span>
      </div>
    </figure>
  );
}

// PHASE 104-F — the Evidence Folio signature.
//
// The Journal's own drawing, and NOT the Observatory signature: that one is a
// signal bus through a plant. This one is a PUBLISHING instrument —
//
//   raw signal -> evidence fragment -> engineering annotation
//              -> reviewed technical folio -> published knowledge
//
// — the path an engineer's field observation takes to become durable technical
// knowledge. Repo-native SVG on the Phase 104 token grammar, no image, no
// library, no dependency, and NO TEXT INSIDE THE SVG: every label is HTML read
// from the `journal` catalog, so the drawing is trilingual without a message
// key of its own and mirrors safely under RTL (pure geometry flips; glyphs
// would not).
//
// Two genuinely different compositions: a horizontal folio spread on md+, a
// vertical folio stack below md. Neither is a scaled copy of the other.
//
// Nothing here is data. There is no issue number, edition, count or date in
// the drawing — the Journal has no real edition numbering to show, so none is
// invented.

import { cn } from "@/components/ds";

/** The five stages, as accessible labels — HTML, never SVG text. */
export interface FolioLabels {
  signal: string;
  fragment: string;
  annotation: string;
  folio: string;
  knowledge: string;
  ariaLabel: string;
}

/* ── shared glyphs ────────────────────────────────────────────────────────── */

/** A raw field signal — a short trace on a small instrument strip. */
function Signal({ x, y, w }: { x: number; y: number; w: number }) {
  const h = 34;
  const pts = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1].map((k, i) => {
    const px = x + k * w;
    const py = y + h / 2 + [0, -4, 3, -9, 5, -2, 7, -11, 4, -6, 0][i];
    return `${px},${py}`;
  }).join(" ");
  return (
    <g>
      <rect className="hj-sig-sheet" x={x - 6} y={y} width={w + 12} height={h} rx="2" />
      <line className="hj-sig-hair" x1={x - 6} y1={y + h / 2} x2={x + w + 6} y2={y + h / 2} />
      <polyline className="hj-sig-signal" points={pts} />
    </g>
  );
}

/** An evidence fragment — a torn-corner sheet with a highlighted band. */
function Fragment({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className="hj-sig-sheet" d={`M${x} ${y} h44 v40 l-10 8 h-34 Z`} />
      <line className="hj-sig-hair" x1={x + 8} y1={y + 12} x2={x + 36} y2={y + 12} />
      <line className="hj-sig-hair" x1={x + 8} y1={y + 20} x2={x + 30} y2={y + 20} />
      <rect className="hj-sig-mark" x={x + 8} y={y + 27} width={22} height={4} rx="1" opacity="0.85" />
      <line className="hj-sig-hair" x1={x + 8} y1={y + 38} x2={x + 26} y2={y + 38} />
    </g>
  );
}

/** Engineering annotation — the fragment under a margin bracket with notes. */
function Annotation({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className="hj-sig-sheet-2" d={`M${x} ${y} h56 v50 h-56 Z`} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 12} x2={x + 46} y2={y + 12} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 20} x2={x + 40} y2={y + 20} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 28} x2={x + 46} y2={y + 28} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 36} x2={x + 34} y2={y + 36} />
      {/* margin bracket + annotation leaders, drawn in brand ink */}
      <path className="hj-sig-annot" d={`M${x + 62} ${y + 8} h8 v34 h-8`} />
      <path className="hj-sig-annot" d={`M${x + 70} ${y + 14} h14 M${x + 70} ${y + 36} h14`} />
      <circle className="hj-sig-mark" cx={x + 86} cy={y + 14} r="2.5" />
      <circle className="hj-sig-mark" cx={x + 86} cy={y + 36} r="2.5" />
    </g>
  );
}

/** The reviewed folio — a bound sheet carrying the review seal. */
function Folio({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className="hj-sig-sheet" d={`M${x + 4} ${y + 4} h60 v66 h-60 Z`} />
      <path className="hj-sig-sheet-2" d={`M${x} ${y} h60 v66 h-60 Z`} />
      <line className="hj-sig-ink-2" x1={x + 10} y1={y + 14} x2={x + 50} y2={y + 14} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 24} x2={x + 46} y2={y + 24} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 32} x2={x + 50} y2={y + 32} />
      <line className="hj-sig-hair" x1={x + 10} y1={y + 40} x2={x + 42} y2={y + 40} />
      {/* the seal: reviewed */}
      <circle className="hj-sig-seal" cx={x + 46} cy={y + 54} r="9" />
      <path className="hj-sig-ink" d={`M${x + 41.5} ${y + 54} l3 3.5 l6.5 -7.5`} />
    </g>
  );
}

/** Published knowledge — the folio filed into a bound volume with a spine tab. */
function Knowledge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className="hj-sig-sheet" d={`M${x} ${y} h54 v70 h-54 Z`} />
      <path className="hj-sig-ink-2" d={`M${x + 8} ${y} v70`} />
      <path className="hj-sig-sheet-2" d={`M${x + 8} ${y + 8} h38 v10 h-38 Z`} />
      <line className="hj-sig-hair" x1={x + 14} y1={y + 30} x2={x + 46} y2={y + 30} />
      <line className="hj-sig-hair" x1={x + 14} y1={y + 38} x2={x + 42} y2={y + 38} />
      <line className="hj-sig-hair" x1={x + 14} y1={y + 46} x2={x + 46} y2={y + 46} />
      {/* spine tab: the filed-and-findable mark */}
      <rect className="hj-sig-mark" x={x + 54} y={y + 22} width={6} height={18} rx="1" />
    </g>
  );
}

/* ═══ Desktop: the folio spread ═════════════════════════════════════════════ */
function SpreadSignature() {
  const Y = 40;
  return (
    <svg
      viewBox="0 0 900 150"
      className="hj-sig-frame h-auto w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* the ledger baseline every stage sits on */}
      <line className="hj-sig-stroke" x1="20" y1="126" x2="880" y2="126" />
      {[20, 235, 450, 665, 880].map((x) => (
        <line key={x} className="hj-sig-stroke" x1={x} y1="122" x2={x} y2="130" />
      ))}
      {/* stage-to-stage transfer arrows: ink, not brand — the process is quiet */}
      {[168, 380, 600, 810].map((x) => (
        <path key={x} className="hj-sig-ink-2" d={`M${x} 76 h22 m-6 -5 l6 5 l-6 5`} />
      ))}
      <Signal x={44} y={Y + 18} w={110} />
      <Fragment x={218} y={Y + 8} />
      <Annotation x={410} y={Y + 2} />
      <Folio x={640} y={Y - 6} />
      <Knowledge x={840 - 20} y={Y - 8} />
    </svg>
  );
}

/* ═══ Mobile: the folio stack ═══════════════════════════════════════════════ */
function StackSignature() {
  const X = 34;
  return (
    <svg
      viewBox="0 0 320 420"
      className="hj-sig-frame h-auto w-full"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <line className="hj-sig-stroke" x1={X} y1="10" x2={X} y2="410" />
      {[24, 108, 190, 272, 356].map((y) => (
        <g key={y}>
          <line className="hj-sig-stroke" x1={X - 4} y1={y} x2={X + 4} y2={y} />
          <line className="hj-sig-hair" x1={X} y1={y} x2={X + 40} y2={y} />
        </g>
      ))}
      <Signal x={X + 46} y={12} w={120} />
      <Fragment x={X + 46} y={84} />
      <Annotation x={X + 46} y={160} />
      <Folio x={X + 46} y={240} />
      <Knowledge x={X + 46} y={324} />
    </svg>
  );
}

export function EvidenceFolioSignature({
  labels,
  className,
}: {
  labels: FolioLabels;
  className?: string;
}) {
  const stages = [labels.signal, labels.fragment, labels.annotation, labels.folio, labels.knowledge];
  return (
    <figure className={cn("min-w-0", className)} aria-label={labels.ariaLabel}>
      <div className="hidden md:block">
        <SpreadSignature />
      </div>
      <div className="md:hidden">
        <StackSignature />
      </div>
      {/* the stages as text: accessible, and the no-SVG fallback.

          A technical word is never split. An earlier revision paired
          `hyphens-auto` with `overflow-wrap:anywhere` to force-fit the row,
          which is what rendered "Reviewed tech-nical folio" — a licence to
          break INSIDE words. Both are gone; `.hj-folio-stages` sets
          hyphens:none / word-break:normal / overflow-wrap:normal so wrapping
          happens at spaces only, and the tracks carry a measured floor.

          The floor is derived from the longest single word any locale
          carries — German "Ingenieurtechnische" (19 chars) at the label size —
          via `repeat(auto-fit, minmax(...))`, so the row REFLOWS its column
          count rather than squeezing a track below what a whole word needs.
          Copy is never shortened, no locale is special-cased, and there is no
          overflow masking, ellipsis or font-size reduction anywhere here. */}
      <ol className="hj-folio-stages mt-3">
        {stages.map((label, i) => (
          <li key={label} className="min-w-0">
            <span aria-hidden="true" className="hj-folio block">{`0${i + 1}`}</span>
            <span dir="auto" className={cn("mt-0.5 block text-label", i === 3 ? "font-semibold text-text-primary" : "text-text-secondary")}>
              {label}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

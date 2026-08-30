import { cn } from "@/components/ds";

// PHASE 87F — risk & evidence overview. Presents the real snapshot risk score
// (0–100) as a posture band + contributing factors (weight bars), and an
// evidence posture (supported / watch / awaiting) derived from real counts.
// No false precision: the score is shown as an integer band with a word label,
// factor weights as proportions, readiness as a discrete Ready/Guarded/Hold.

export interface RiskFactor {
  key: string;
  label: string;
  weight: number; // 0–1
}

export interface RiskEvidenceProps {
  score: number; // 0–100, lower is better
  trendLabel: string;
  riskLabel: string;
  postureLabel: string;
  factorsTitle: string;
  factors: RiskFactor[];
  evidenceTitle: string;
  evidence: { supportedLabel: string; supported: number; watchLabel: string; watch: number; missingLabel: string; missing: number };
  confidenceLabel: string;
  readiness: { label: string; tone: "ready" | "guarded" | "hold" };
  formatNumber: (n: number) => string;
  pct: string;
  /** Grid basis: viewport breakpoints (default) or this element's own width. */
  layout?: "viewport" | "container";
  /**
   * PHASE 109-B0 — optional, visually hidden marker appended to each numeric
   * value rendered here, so the value states in its OWN accessible name what
   * kind of data it is. Consumers rendering real data omit it and render
   * exactly as before.
   */
  valueMarker?: string;
  /** Snapshot-path prefix, e.g. "command". Emitted only alongside valueMarker. */
  pathPrefix?: string;
}

const READINESS_TONE = {
  ready: "text-status-success",
  guarded: "text-status-warning",
  hold: "text-status-danger",
} as const;

function factorTone(weight: number): string {
  if (weight > 0.6) return "bg-status-danger";
  if (weight > 0.35) return "bg-status-warning";
  return "bg-status-success";
}

export function RiskEvidence(props: RiskEvidenceProps) {
  // PHASE 104-D2 — "container" makes the two-up split follow this component's
  // OWN width instead of the viewport, which is what a Triad group needs.
  // Defaults to "viewport" so every existing consumer renders identically.
  const layout = props.layout ?? "viewport";
  const { score, formatNumber, pct, valueMarker } = props;
  const mark = valueMarker ? <span className="sr-only"> {valueMarker}</span> : null;
  const markAttr = valueMarker ? "simulated" : undefined;
  const p = (leaf: string) =>
    valueMarker && props.pathPrefix ? `${props.pathPrefix}.${leaf}` : undefined;
  const scoreTone = score >= 75 ? "text-status-danger" : score >= 50 ? "text-status-warning" : "text-status-success";

  return (
    <div className={cn("gap-5", layout === "container" ? "hermes-cq-grid" : "grid grid-cols-1 sm:grid-cols-2")}>
      {/* Risk */}
      <div>
        <p className="text-label-compact font-semibold uppercase tracking-wide text-text-muted">{props.riskLabel}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={cn("text-kpi-lg font-bold tabular-nums", scoreTone)}
            dir="ltr"
            data-hermes-operational-value={markAttr}
            data-hermes-snapshot-path={p("risk.score")}
          >
            {formatNumber(Math.round(score))}
            {mark}
          </span>
          <span className="text-caption text-text-muted">{props.postureLabel}</span>
        </div>
        <p
          className="mt-0.5 text-caption text-text-secondary"
          data-hermes-operational-value={markAttr}
          data-hermes-snapshot-path={p("risk.trend")}
        >
          {props.trendLabel}
          {mark}
        </p>

        <p className="mt-4 text-label-compact font-semibold uppercase tracking-wide text-text-muted">
          {props.factorsTitle}
        </p>
        <ul className="mt-2 flex flex-col gap-2.5">
          {props.factors.map((f, fi) => (
            <li key={f.key}>
              <div className="flex items-baseline justify-between gap-2 text-caption">
                <span className="text-text-secondary" dir="auto">{f.label}</span>
                <span
                  className="tabular-nums text-text-primary"
                  dir="ltr"
                  data-hermes-operational-value={markAttr}
                  data-hermes-snapshot-path={p(`risk.factors[${fi}]`)}
                >
                  {formatNumber(Math.round(f.weight * 100))}
                  {pct}
                  {mark}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-surface-interactive">
                <div
                  className={cn("h-1 rounded-full", factorTone(f.weight))}
                  style={{ inlineSize: `${Math.min(f.weight * 100, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Evidence */}
      {/* The Evidence pane's side divider only makes sense once a second column
          exists beside it. In the container layout that decision belongs to the
          container, not the viewport. */}
      <div
        className={
          layout === "container"
            ? "hermes-cq-divide"
            : "sm:border-s sm:border-border-subtle sm:ps-5"
        }
      >
        <p className="text-label-compact font-semibold uppercase tracking-wide text-text-muted">
          {props.evidenceTitle}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {[
            { label: props.evidence.supportedLabel, n: props.evidence.supported, dot: "bg-status-success", glyph: "✓" },
            { label: props.evidence.watchLabel, n: props.evidence.watch, dot: "bg-status-warning", glyph: "◆" },
            { label: props.evidence.missingLabel, n: props.evidence.missing, dot: "bg-text-muted/50", glyph: "…" },
          ].map((row, ri) => (
            <li key={row.label} className="flex items-center gap-2.5">
              <span aria-hidden="true" className={cn("inline-block h-2 w-2 rounded-full", row.dot)} />
              <span aria-hidden="true" className="w-3 text-center text-caption text-text-muted">{row.glyph}</span>
              <span className="flex-1 text-caption text-text-secondary" dir="auto">{row.label}</span>
              <span
                className="tabular-nums text-body-compact font-semibold text-text-primary"
                dir="ltr"
                data-hermes-operational-value={markAttr}
                data-hermes-snapshot-path={p(`evidence[${ri}]`)}
              >
                {formatNumber(row.n)}
                {mark}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 ds-glass-card rounded-lg p-3">
          <p className="text-caption text-text-muted">{props.confidenceLabel}</p>
          <p
            className={cn("mt-0.5 text-title font-semibold", READINESS_TONE[props.readiness.tone])}
            dir="auto"
            data-hermes-operational-value={markAttr}
            data-hermes-snapshot-path={p("readiness")}
          >
            {props.readiness.label}
            {mark}
          </p>
        </div>
      </div>
    </div>
  );
}

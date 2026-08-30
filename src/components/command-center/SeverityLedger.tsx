/**
 * PHASE 104-I.D2 — Severity Ledger.
 *
 * The dominant composition of the Alarm Center. It is deliberately NOT a row of
 * equal cards: the estate's posture is one proportional band read left-to-right
 * (or right-to-left under RTL, which the band inherits from flow direction),
 * with the counts subordinate to it. Weight comes from proportion and type
 * scale, not from glow.
 *
 * It renders only proportions of a REAL total. When nothing is observed the
 * caller shows an empty state instead — a full-width bar in a calm colour would
 * assert "all clear", which is a claim this component has no evidence for.
 */
import type { AlertSeverity } from "@/lib/operations/types";
import type { LedgerSegment } from "./alarm-state";
import { SEVERITY_FILL, SEVERITY_TEXT } from "./severity-tokens";

export function SeverityLedger({
  segments,
  total,
  totalLabel,
  labels,
  dominant,
  dominantLabel,
  formatNumber,
}: {
  segments:      LedgerSegment[];
  total:         number;
  totalLabel:    string;
  labels:        Record<AlertSeverity, string>;
  dominant:      AlertSeverity | null;
  /** Plain-language reading of the posture. Absent when nothing is observed. */
  dominantLabel: string | null;
  formatNumber:  (n: number) => string;
}) {
  return (
    // Gate A.1 §9: read as an instrument panel, not a stretched progress bar.
    // The count and the posture reading share one baseline, the band sits
    // directly beneath them as the instrument face, and the per-severity figures
    // are separated into their own footed row so the eye lands on posture first
    // and detail second.
    <section className="rounded-xl border border-line bg-surface shadow-e2">
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <p className="exec-kpi-value leading-none text-ink">{formatNumber(total)}</p>
            <p className="kpi-label">{totalLabel}</p>
          </div>
          {dominant && dominantLabel && (
            // Same reason as StateBoundary: `type-panel-title` would override the
            // severity colour and print the posture reading in neutral grey.
            <p
              className={`flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-wide sm:text-sm ${SEVERITY_TEXT[dominant]}`}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${SEVERITY_FILL[dominant]}`}
              />
              {dominantLabel}
            </p>
          )}
        </div>

        {/* Proportional band — the instrument face. aria-hidden because the same
            facts are in the list below; exposing both would duplicate them. */}
        <div
          className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-line/40 sm:mt-5"
          aria-hidden="true"
        >
          {segments
            .filter((s) => s.count > 0)
            .map((s) => (
              <div
                key={s.severity}
                className={SEVERITY_FILL[s.severity]}
                style={{ width: `${s.percent}%` }}
              />
            ))}
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
        {segments.map((s) => (
          <div key={s.severity} className="px-4 py-3 sm:px-6">
            {/* Wraps rather than truncates: at 320px three columns are tight and
                "Informational" was clipping to "INFORMAT…". A severity label is
                not something a reader should have to guess at. */}
            <dt className="kpi-label mb-1 leading-tight">{labels[s.severity]}</dt>
            <dd className={`metric text-base sm:text-lg ${SEVERITY_TEXT[s.severity]}`}>
              {formatNumber(s.count)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

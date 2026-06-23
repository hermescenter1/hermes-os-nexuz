import type { BrainAnalysis } from "@/lib/services/types";

interface RootCausePanelProps {
  result:        BrainAnalysis;
  domainLabel:   string;
  rootCause:     string;
  recommendations: string[];
}

/**
 * Visual root-cause chain: Domain → Root Cause → Risk → Recommendation.
 * Deterministic — derives everything from the existing BrainAnalysis result.
 */
export function RootCausePanel({
  result,
  domainLabel,
  rootCause,
  recommendations,
}: RootCausePanelProps) {
  const confidence = result.confidence;
  const riskLevel =
    confidence < 0.3  ? "high"
    : confidence < 0.6 ? "medium"
    : "low";

  const riskColor: Record<string, { text: string; bg: string; border: string; dot: string }> = {
    high:   { text: "text-[--danger]", bg: "bg-[--danger]/8",   border: "border-[--danger]/30",   dot: "bg-[--danger]" },
    medium: { text: "text-[--warn]",   bg: "bg-[--warn]/8",     border: "border-[--warn]/30",     dot: "bg-[--warn]"   },
    low:    { text: "text-signal",     bg: "bg-signal/8",       border: "border-signalDim/40",    dot: "bg-signal"     },
  };
  const rc = riskColor[riskLevel];

  const chain: Array<{ step: number; label: string; value: string; accent: string }> = [
    { step: 1, label: "Detected Domain",    value: domainLabel, accent: "text-signal" },
    { step: 2, label: "Root Cause",         value: rootCause,   accent: "text-[--warn]" },
    { step: 3, label: "Risk Level",         value: riskLevel.toUpperCase(), accent: rc.text },
    ...(recommendations.length > 0
      ? [{ step: 4, label: "Action",        value: recommendations[0] ?? "—", accent: "text-ink" }]
      : []),
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
          Root Cause Chain
        </h2>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[0.7rem] font-mono ${rc.bg} ${rc.border} ${rc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${rc.dot}`} />
          {riskLevel.toUpperCase()} RISK
        </span>
      </div>

      {/* Chain steps */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute start-[17px] top-6 bottom-6 w-px bg-line" />

        <ol className="space-y-3 relative">
          {chain.map((item) => (
            <li key={item.step} className="flex gap-4 items-start">
              {/* Step circle */}
              <div className="relative z-10 flex-shrink-0 w-[34px] h-[34px] rounded-full border border-line bg-surface flex items-center justify-center">
                <span className="font-mono text-[10px] font-bold text-muted">
                  {item.step.toString().padStart(2, "0")}
                </span>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted/70 mb-0.5">
                  {item.label}
                </p>
                <p className={`text-sm font-semibold leading-snug ${item.accent}`}>
                  {item.value}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
